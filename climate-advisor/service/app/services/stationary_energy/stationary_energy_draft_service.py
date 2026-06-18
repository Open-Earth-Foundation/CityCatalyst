from __future__ import annotations

import asyncio
import logging
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session_factory
from app.middleware import get_request_id
from app.models.db.stationary_energy_draft import (
    StationaryEnergyDraftRun,
    StationaryEnergyReviewDecision,
)
from app.models.stationary_energy_drafts import (
    DraftStalenessResponse,
    ListStationaryEnergyDraftsResponse,
    LoadStationaryEnergyContextRequest,
    LoadStationaryEnergyContextResponse,
    RetryStationaryEnergyDraftRequest,
    ReviewStationaryEnergyDraftRequest,
    ReviewStationaryEnergyDraftResponse,
    SaveStationaryEnergyDraftRequest,
    SaveStationaryEnergyDraftResponse,
    StartStationaryEnergyDraftRequest,
    StartStationaryEnergyDraftResponse,
    StationaryEnergyDraftStatusResponse,
)
from app.services.citycatalyst_client import (
    CityCatalystClient,
    CityCatalystClientError,
    TokenRefreshError,
)
from app.services.stationary_energy.stationary_energy_draft_auth import (
    extract_bearer_token,
    needs_token_refresh,
    persist_thread_draft_run_id,
    persist_thread_token,
    require_bearer_token,
)
from app.services.stationary_energy.stationary_energy_draft_context import (
    context_summary,
    context_summary_with_error,
    source_candidate_records,
    stored_source_candidate_payload_from_record,
)
from app.services.stationary_energy.stationary_energy_draft_repository import (
    StationaryEnergyDraftRepository,
)
from app.services.stationary_energy.stationary_energy_draft_review import (
    apply_commit_results_to_decisions,
    build_review_decisions,
    build_commit_rows,
    commit_result_key,
    latest_review_decisions,
    save_status_after_commit,
    validate_complete_review_decisions,
)
from app.services.stationary_energy.stationary_energy_draft_serializers import (
    to_list_item_response,
    to_review_decision_response,
    to_save_response,
    to_start_response,
    to_status_response,
)
from app.services.stationary_energy.stationary_energy_proposal_builder import (
    build_deterministic_proposals,
)
from app.services.thread_service import ThreadService


logger = logging.getLogger(__name__)

LOAD_CONTEXT_CAPABILITY = "ghgi.stationary_energy.load_context"
COMMIT_ACCEPTED_CAPABILITY = "ghgi.stationary_energy.commit_accepted"
RESUME_EXCLUDED_STATUSES = {"saved", "partially_saved", "no_changes", "failed"}
GENERATION_IN_PROGRESS_STATUSES = {"resolving_scope", "loading_context", "generating"}

# Keep strong references to in-flight background generation tasks so the event
# loop does not garbage-collect them before they finish.
_BACKGROUND_TASKS: set[asyncio.Task[Any]] = set()


def _schedule_background_task(coro: Any) -> asyncio.Task[Any]:
    """Schedule a generation coroutine and retain it until completion."""
    task = asyncio.create_task(coro)
    _BACKGROUND_TASKS.add(task)
    task.add_done_callback(_BACKGROUND_TASKS.discard)
    return task


class StationaryEnergyDraftService:
    """Coordinate Stationary Energy draft generation, review, and save workflows."""

    def __init__(
        self,
        session: AsyncSession,
        *,
        cc_client: CityCatalystClient | None = None,
    ) -> None:
        """Initialize repository, thread, and external integration dependencies."""
        self.session = session
        self.repository = StationaryEnergyDraftRepository(session)
        self.thread_service = ThreadService(session)
        self.cc_client = cc_client or CityCatalystClient()

    async def start_draft(
        self,
        payload: StartStationaryEnergyDraftRequest,
        *,
        authorization: str | None = None,
    ) -> StartStationaryEnergyDraftResponse:
        """Create and start a new Stationary Energy draft run."""
        trace_id = get_request_id()
        if payload.thread_id is not None:
            thread = await self.thread_service.get_thread(payload.thread_id)
            if thread is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"Thread {payload.thread_id} not found",
                )
            if thread.user_id != payload.user_id:
                raise HTTPException(
                    status_code=403,
                    detail="Thread does not belong to user",
                )

        token, allowed_capabilities = await self._require_scope_token_and_capabilities(
            requested_user_id=payload.user_id,
            city_id=payload.city_id,
            inventory_id=payload.inventory_id,
            workflow_step="draft",
            authorization=authorization,
        )
        canonical_user_id = payload.user_id

        draft_run = await self.repository.create_draft_run(
            user_id=canonical_user_id,
            city_id=payload.city_id,
            inventory_id=payload.inventory_id,
            thread_id=payload.thread_id,
            trace_id=trace_id,
        )

        return await self._run_draft_generation(
            draft_run=draft_run,
            user_id=canonical_user_id,
            city_id=payload.city_id,
            inventory_id=payload.inventory_id,
            thread_id=payload.thread_id,
            locale=payload.locale,
            token=token,
            trace_id=trace_id,
            allowed_capabilities=allowed_capabilities,
        )

    async def retry_draft(
        self,
        *,
        draft_run_id: UUID,
        payload: RetryStationaryEnergyDraftRequest,
        authorization: str | None = None,
    ) -> StartStationaryEnergyDraftResponse:
        """Retry a non-terminal draft run using the latest available token context."""
        trace_id = get_request_id()
        draft_run = await self._get_draft_run_or_404(draft_run_id)
        token, allowed_capabilities = await self._require_scope_token_and_capabilities(
            requested_user_id=payload.user_id,
            city_id=draft_run.city_id,
            inventory_id=draft_run.inventory_id,
            workflow_step="draft",
            authorization=authorization,
        )
        if draft_run.user_id != payload.user_id:
            raise HTTPException(status_code=403, detail="Draft run does not belong to user")
        if draft_run.status in {"reviewed", "saved", "partially_saved"}:
            raise HTTPException(
                status_code=409,
                detail="Reviewed Stationary Energy drafts cannot be retried",
            )

        return await self._run_draft_generation(
            draft_run=draft_run,
            user_id=draft_run.user_id,
            city_id=draft_run.city_id,
            inventory_id=draft_run.inventory_id,
            thread_id=draft_run.thread_id,
            locale=payload.locale,
            token=token,
            trace_id=trace_id,
            allowed_capabilities=allowed_capabilities,
        )

    async def _run_draft_generation(
        self,
        *,
        draft_run: StationaryEnergyDraftRun,
        user_id: str,
        city_id: str,
        inventory_id: str,
        thread_id: UUID | None,
        locale: str | None,
        token: str | None,
        trace_id: str | None,
        allowed_capabilities: list[str] | None = None,
    ) -> StartStationaryEnergyDraftResponse:
        """Load CC context, persist source snapshots, and schedule deterministic proposals."""
        failed_step = "resolving_scope"
        try:
            await self.repository.update_draft_run(
                draft_run,
                status="resolving_scope",
                workflow_step="draft",
                trace_id=trace_id,
            )

            token = await self._ensure_user_token(
                user_id=user_id,
                thread_id=thread_id,
                token=token,
            )
            if allowed_capabilities is None:
                allowed_capabilities = await self._get_scope_capabilities(
                    user_id=user_id,
                    city_id=city_id,
                    inventory_id=inventory_id,
                    workflow_step="draft",
                    token=token,
                )
            if LOAD_CONTEXT_CAPABILITY not in allowed_capabilities:
                raise HTTPException(
                    status_code=403,
                    detail="Stationary Energy context loading is not allowed for this draft",
                )

            failed_step = "loading_context"
            await self.repository.update_draft_run(draft_run, status="loading_context")
            context = await self._load_context_response(
                user_id=user_id,
                city_id=city_id,
                inventory_id=inventory_id,
                locale=locale,
                token=token,
            )

            candidate_records = source_candidate_records(
                draft_run.draft_run_id,
                context.source_candidates,
            )
            stored_source_candidates = [
                stored_source_candidate_payload_from_record(
                    draft_run.draft_run_id,
                    candidate_record,
                )
                for candidate_record in candidate_records
            ]
            applicable_source_candidates = [
                candidate
                for candidate in stored_source_candidates
                if candidate.get("applicability_status") == "applicable"
            ]

            failed_step = "generating"
            # Staggered generation: persist candidates, clear any prior proposals
            # (retry case), mark "generating", then commit so the background
            # session and status pollers can observe this state before per-row
            # generation begins.
            await self.repository.replace_source_candidates(
                draft_run.draft_run_id,
                candidate_records,
            )
            await self.repository.replace_proposals(draft_run.draft_run_id, [])
            await self.repository.update_draft_run(
                draft_run,
                status="generating",
                workflow_step="draft",
                permission_summary=context.permission_summary,
                trace_id=trace_id,
            )
            await self.session.commit()

            _schedule_background_task(
                self._generate_rows_background(
                    draft_run_id=draft_run.draft_run_id,
                    context=context,
                    stored_source_candidates=stored_source_candidates,
                    applicable_source_candidates=applicable_source_candidates,
                    allowed_capabilities=allowed_capabilities,
                    source_candidates_count=len(stored_source_candidates),
                    applicable_source_candidates_count=len(applicable_source_candidates),
                    thread_id=thread_id,
                    user_id=user_id,
                    trace_id=trace_id,
                )
            )

            logger.info(
                "Stationary Energy deterministic generation scheduled run=%s user_id=%s city_id=%s inventory_id=%s candidates=%s rows=%s",
                draft_run.draft_run_id,
                user_id,
                city_id,
                inventory_id,
                len(candidate_records),
                len(context.taxonomy),
            )
            return to_start_response(
                draft_run,
                status_override="generating",
                proposals_override=[],
            )
        except HTTPException as exc:
            await self._mark_failed(
                draft_run,
                failed_step=failed_step,
                exc=exc,
                trace_id=trace_id,
            )
            raise
        except CityCatalystClientError as exc:
            await self._mark_failed(
                draft_run,
                failed_step=failed_step,
                exc=exc,
                trace_id=trace_id,
            )
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        except TokenRefreshError as exc:
            await self._mark_failed(
                draft_run,
                failed_step="token_readiness",
                exc=exc,
                trace_id=trace_id,
            )
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        except Exception as exc:
            await self._mark_failed(
                draft_run,
                failed_step=failed_step,
                exc=exc,
                trace_id=trace_id,
            )
            raise HTTPException(
                status_code=500,
                detail="Stationary Energy draft generation failed",
            ) from exc

    async def _generate_rows_background(
        self,
        *,
        draft_run_id: UUID,
        context: Any,
        stored_source_candidates: list[dict[str, Any]],
        applicable_source_candidates: list[dict[str, Any]],
        allowed_capabilities: list[str],
        source_candidates_count: int,
        applicable_source_candidates_count: int,
        thread_id: UUID | None,
        user_id: str,
        trace_id: str | None,
    ) -> None:
        """Generate deterministic proposals in a fresh DB session."""
        factory = get_session_factory()
        rows = list(context.taxonomy)
        try:
            async with factory() as session:
                service = StationaryEnergyDraftService(
                    session,
                    cc_client=self.cc_client,
                )
                draft_run = await service.repository.get_draft_run(draft_run_id)
                if draft_run is None:
                    logger.warning(
                        "Stationary Energy deterministic generation: draft run %s not found",
                        draft_run_id,
                    )
                    return

                total = 0
                proposals = build_deterministic_proposals(
                    taxonomy_rows=rows,
                    stored_source_candidates=applicable_source_candidates,
                    current_values=list(context.current_values),
                    inventory_year=getattr(context.inventory, "year", None),
                )
                if proposals:
                    await service.repository.add_proposals(draft_run_id, proposals)
                    await session.commit()
                    total += len(proposals)
                    logger.info(
                        "Stationary Energy deterministic run=%s resolved=%s/%s",
                        draft_run_id,
                        len(proposals),
                        len(rows),
                    )

                summary = context_summary(
                    context,
                    allowed_capabilities,
                    source_candidates_count=source_candidates_count,
                    applicable_source_candidates_count=applicable_source_candidates_count,
                )
                await service.repository.update_draft_run(
                    draft_run,
                    status="ready",
                    workflow_step="draft",
                    context_summary=summary,
                    permission_summary=context.permission_summary,
                    trace_id=trace_id,
                )
                await session.commit()

                try:
                    await persist_thread_draft_run_id(
                        thread_service=service.thread_service,
                        thread_id=thread_id,
                        user_id=user_id,
                        draft_run_id=draft_run_id,
                    )
                    await session.commit()
                except Exception as exc:
                    logger.warning(
                        "Failed to persist Stationary Energy draft context on thread_id=%s: %s",
                        thread_id,
                        exc,
                    )

                logger.info(
                    "Stationary Energy deterministic draft ready run=%s proposals=%s",
                    draft_run_id,
                    total,
                )
        except Exception as exc:
            logger.exception(
                "Stationary Energy deterministic generation failed run=%s: %s",
                draft_run_id,
                exc,
            )
            try:
                async with factory() as session:
                    service = StationaryEnergyDraftService(
                        session, cc_client=self.cc_client
                    )
                    draft_run = await service.repository.get_draft_run(draft_run_id)
                    if draft_run is not None:
                        await service.repository.update_draft_run(
                            draft_run,
                            status="failed",
                            workflow_step="draft",
                            context_summary={
                                "error": {"step": "generating", "message": str(exc)}
                            },
                            trace_id=trace_id,
                        )
                        await session.commit()
            except Exception:
                logger.exception(
                    "Failed to mark Stationary Energy draft failed run=%s",
                    draft_run_id,
                )

    async def get_draft_status(
        self,
        *,
        draft_run_id: UUID,
        requested_user_id: str,
        authorization: str | None = None,
    ) -> StationaryEnergyDraftStatusResponse:
        """Return the persisted draft snapshot plus connected-source staleness metadata."""
        draft_run = await self._get_draft_run_or_404(draft_run_id)
        await self._require_scope_token_and_capabilities(
            requested_user_id=requested_user_id,
            city_id=draft_run.city_id,
            inventory_id=draft_run.inventory_id,
            workflow_step=self._draft_workflow_step(draft_run),
            authorization=authorization,
        )
        if draft_run.user_id != requested_user_id:
            raise HTTPException(status_code=403, detail="Draft run does not belong to user")
        staleness = await self._build_draft_staleness(
            draft_run,
            authorization=authorization,
        )
        return to_status_response(draft_run, staleness=staleness)

    async def resume_latest_draft(
        self,
        *,
        requested_user_id: str,
        city_id: str,
        inventory_id: str,
        sector_code: str = "stationary_energy",
        authorization: str | None = None,
    ) -> StationaryEnergyDraftStatusResponse:
        """Return the latest active draft for a user and Stationary Energy scope."""
        await self._require_scope_token_and_capabilities(
            requested_user_id=requested_user_id,
            city_id=city_id,
            inventory_id=inventory_id,
            workflow_step="draft",
            authorization=authorization,
        )
        draft_run = await self.repository.get_latest_draft_run_for_scope(
            user_id=requested_user_id,
            city_id=city_id,
            inventory_id=inventory_id,
            sector_code=sector_code,
            excluded_statuses=RESUME_EXCLUDED_STATUSES,
        )
        if draft_run is None:
            raise HTTPException(
                status_code=404,
                detail="No active Stationary Energy draft run found",
            )
        staleness = await self._build_draft_staleness(
            draft_run,
            authorization=authorization,
        )
        return to_status_response(draft_run, staleness=staleness)

    async def list_drafts_for_scope(
        self,
        *,
        requested_user_id: str,
        city_id: str,
        inventory_id: str,
        sector_code: str = "stationary_energy",
        authorization: str | None = None,
    ) -> ListStationaryEnergyDraftsResponse:
        """Return every active draft for a user and Stationary Energy scope."""
        await self._require_scope_token_and_capabilities(
            requested_user_id=requested_user_id,
            city_id=city_id,
            inventory_id=inventory_id,
            workflow_step="draft",
            authorization=authorization,
        )
        draft_runs = await self.repository.list_draft_runs_for_scope(
            user_id=requested_user_id,
            city_id=city_id,
            inventory_id=inventory_id,
            sector_code=sector_code,
            excluded_statuses=RESUME_EXCLUDED_STATUSES,
        )
        return ListStationaryEnergyDraftsResponse(
            drafts=[to_list_item_response(draft_run) for draft_run in draft_runs]
        )

    async def review_draft(
        self,
        *,
        draft_run_id: UUID,
        payload: ReviewStationaryEnergyDraftRequest,
        authorization: str | None = None,
    ) -> ReviewStationaryEnergyDraftResponse:
        """Persist a complete review decision set for a draft run."""
        draft_run = await self._get_draft_run_or_404(draft_run_id)
        await self._require_scope_token_and_capabilities(
            requested_user_id=payload.user_id,
            city_id=draft_run.city_id,
            inventory_id=draft_run.inventory_id,
            workflow_step="review",
            authorization=authorization,
        )
        if draft_run.user_id != payload.user_id:
            raise HTTPException(status_code=403, detail="Draft run does not belong to user")
        self._require_generation_complete(draft_run)

        proposal_by_id = {
            proposal.proposal_id: proposal for proposal in draft_run.proposals
        }
        validate_complete_review_decisions(payload.decisions, proposal_by_id)
        candidate_by_id = {
            str(candidate.candidate_id): candidate
            for candidate in draft_run.source_candidates
        }
        candidate_by_datasource = {
            candidate.datasource_id: candidate
            for candidate in draft_run.source_candidates
        }
        next_review_versions = await self.repository.get_next_review_versions(
            draft_run_id=draft_run.draft_run_id,
            proposal_ids=[decision.proposal_id for decision in payload.decisions],
        )

        decisions = build_review_decisions(
            draft_run_id=draft_run.draft_run_id,
            user_id=payload.user_id,
            decisions=payload.decisions,
            proposal_by_id=proposal_by_id,
            candidate_by_id=candidate_by_id,
            candidate_by_datasource=candidate_by_datasource,
            next_review_versions=next_review_versions,
        )

        await self.repository.persist_review_decisions(decisions)
        await self.repository.update_draft_run(
            draft_run,
            status="reviewed",
            workflow_step="review",
        )

        return ReviewStationaryEnergyDraftResponse(
            draft_run_id=draft_run.draft_run_id,
            user_id=payload.user_id,
            status="reviewed",
            decisions=[
                to_review_decision_response(decision) for decision in decisions
            ],
        )

    async def save_draft(
        self,
        *,
        draft_run_id: UUID,
        payload: SaveStationaryEnergyDraftRequest,
        authorization: str | None = None,
    ) -> SaveStationaryEnergyDraftResponse:
        """Commit accepted reviewed rows into CityCatalyst and persist the outcome."""
        draft_run = await self._get_draft_run_or_404(draft_run_id)
        token, _allowed_capabilities = await self._require_scope_token_and_capabilities(
            requested_user_id=payload.user_id,
            city_id=draft_run.city_id,
            inventory_id=draft_run.inventory_id,
            workflow_step="review",
            authorization=authorization,
        )
        if draft_run.user_id != payload.user_id:
            raise HTTPException(status_code=403, detail="Draft run does not belong to user")
        self._require_generation_complete(draft_run)
        if not draft_run.review_decisions:
            raise HTTPException(
                status_code=409,
                detail="Draft has no review decisions to save",
            )

        token = await self._ensure_user_token(
            user_id=payload.user_id,
            thread_id=draft_run.thread_id,
            token=token,
        )
        allowed_capabilities = await self._get_scope_capabilities(
            user_id=payload.user_id,
            city_id=draft_run.city_id,
            inventory_id=draft_run.inventory_id,
            workflow_step="review",
            token=token,
        )
        if COMMIT_ACCEPTED_CAPABILITY not in allowed_capabilities:
            raise HTTPException(
                status_code=403,
                detail="Stationary Energy save is not allowed for this draft",
            )

        latest_decisions = latest_review_decisions(draft_run.review_decisions)
        pending_decisions = [
            decision
            for decision in latest_decisions.values()
            if decision.commit_status in {"pending_cc_commit", "staged_manual"}
        ]
        if not pending_decisions:
            await self.repository.update_draft_run(
                draft_run,
                status="no_changes",
                workflow_step="review",
            )
            return to_save_response(draft_run, status_override="no_changes")

        proposal_by_id = {
            proposal.proposal_id: proposal for proposal in draft_run.proposals
        }
        rows, local_results = build_commit_rows(
            pending_decisions=pending_decisions,
            proposal_by_id=proposal_by_id,
        )

        cc_results: list[dict[str, Any]] = []
        if rows:
            commit_payload = {
                "draft_run_id": str(draft_run.draft_run_id),
                "user_id": payload.user_id,
                "city_id": draft_run.city_id,
                "inventory_id": draft_run.inventory_id,
                "rows": rows,
            }
            commit_response = await self.cc_client.commit_stationary_energy_accepted(
                request_payload=commit_payload,
                token=token,
            )
            raw_results = (
                commit_response.get("results")
                if isinstance(commit_response, dict)
                else None
            )
            if not isinstance(raw_results, list):
                raise HTTPException(
                    status_code=502,
                    detail="CityCatalyst save response did not include commit results",
                )
            cc_results = [result for result in raw_results if isinstance(result, dict)]

        results_by_key: dict[tuple[str, int], dict[str, Any]] = {}
        for result in [*cc_results, *local_results]:
            key = commit_result_key(result)
            if key is not None:
                results_by_key[key] = result

        apply_commit_results_to_decisions(
            pending_decisions=pending_decisions,
            results_by_key=results_by_key,
        )
        save_status = save_status_after_commit(
            latest_decisions=latest_decisions,
            attempted=pending_decisions,
        )
        await self.repository.update_draft_run(
            draft_run,
            status=save_status,
            workflow_step="review",
        )
        return to_save_response(draft_run, status_override=save_status)

    async def _get_draft_run_or_404(
        self,
        draft_run_id: UUID,
    ) -> StationaryEnergyDraftRun:
        """Load a draft run or raise a 404 if it does not exist."""
        draft_run = await self.repository.get_draft_run(draft_run_id)
        if draft_run is None:
            raise HTTPException(
                status_code=404,
                detail=f"Draft run {draft_run_id} not found",
            )
        return draft_run

    async def _require_scope_token_and_capabilities(
        self,
        *,
        requested_user_id: str,
        city_id: str,
        inventory_id: str,
        workflow_step: str,
        authorization: str | None,
    ) -> tuple[str, list[str]]:
        """Require a bearer token and validate it through CC scope checks."""
        token = require_bearer_token(extract_bearer_token(authorization))
        capabilities = await self._get_scope_capabilities(
            user_id=requested_user_id,
            city_id=city_id,
            inventory_id=inventory_id,
            workflow_step=workflow_step,
            token=token,
        )
        return token, capabilities

    async def _get_scope_capabilities(
        self,
        *,
        user_id: str,
        city_id: str,
        inventory_id: str,
        workflow_step: str,
        token: str,
    ) -> list[str]:
        """Load allowed capabilities while mapping CC auth failures to local HTTP errors."""
        try:
            return await self.cc_client.get_stationary_energy_allowed_capabilities(
                user_id=user_id,
                city_id=city_id,
                inventory_id=inventory_id,
                workflow_step=workflow_step,
                token=token,
            )
        except CityCatalystClientError as exc:
            if exc.status_code == 401:
                raise HTTPException(
                    status_code=401,
                    detail="CityCatalyst access token is invalid or expired",
                ) from exc
            if exc.status_code == 403:
                raise HTTPException(
                    status_code=403,
                    detail="Stationary Energy draft access is not allowed for this inventory",
                ) from exc
            raise

    async def _ensure_user_token(
        self,
        *,
        user_id: str,
        thread_id: UUID | None,
        token: str | None,
    ) -> str:
        """Return a usable CityCatalyst token, refreshing and persisting it when needed."""
        if not token:
            raise HTTPException(
                status_code=401,
                detail="CityCatalyst access token is required",
            )
        if not needs_token_refresh(token):
            return token

        logger.info(
            "Refreshing expired CityCatalyst token for Stationary Energy draft user_id=%s",
            user_id,
        )
        fresh_token, expires_in = await self.cc_client.refresh_token(user_id)
        if thread_id:
            await persist_thread_token(
                thread_service=self.thread_service,
                thread_id=thread_id,
                user_id=user_id,
                token=fresh_token,
                expires_in=expires_in,
            )
        return fresh_token

    @staticmethod
    def _require_generation_complete(draft_run: StationaryEnergyDraftRun) -> None:
        """Reject review/save calls while async draft generation is still running."""
        if draft_run.status in GENERATION_IN_PROGRESS_STATUSES:
            raise HTTPException(
                status_code=409,
                detail="Stationary Energy draft generation is still in progress",
            )

    @staticmethod
    def _draft_workflow_step(draft_run: StationaryEnergyDraftRun) -> str:
        """Normalize persisted draft workflow state into the CC capability workflow step."""
        if draft_run.workflow_step == "review":
            return "review"
        return "draft"

    async def _load_context_response(
        self,
        *,
        user_id: str,
        city_id: str,
        inventory_id: str,
        locale: str | None = None,
        token: str,
    ) -> LoadStationaryEnergyContextResponse:
        """Load and normalize the bounded Stationary Energy context payload from CC."""
        context_request = LoadStationaryEnergyContextRequest(
            user_id=user_id,
            city_id=city_id,
            inventory_id=inventory_id,
            locale=locale,
        )
        context_payload = await self.cc_client.load_stationary_energy_context(
            request_payload=context_request.model_dump(mode="json", exclude_none=True),
            token=token,
        )
        if (
            isinstance(context_payload, dict)
            and "data" in context_payload
            and "city" not in context_payload
        ):
            context_payload = context_payload["data"]
        return LoadStationaryEnergyContextResponse.model_validate(context_payload)

    async def _mark_failed(
        self,
        draft_run: StationaryEnergyDraftRun,
        *,
        failed_step: str,
        exc: Exception,
        trace_id: str | None,
    ) -> None:
        """Persist a failed draft status plus a redacted error summary."""
        await self.repository.update_draft_run(
            draft_run,
            status="failed",
            workflow_step="draft",
            context_summary=context_summary_with_error(
                draft_run.context_summary,
                failed_step=failed_step,
                exc=exc,
                trace_id=trace_id,
            ),
            trace_id=trace_id,
        )

    async def _build_draft_staleness(
        self,
        draft_run: StationaryEnergyDraftRun,
        *,
        authorization: str | None,
    ) -> DraftStalenessResponse:
        """Compare the stored draft snapshot to the current connected source set."""
        if draft_run.status in GENERATION_IN_PROGRESS_STATUSES:
            return DraftStalenessResponse()

        stored_source_ids = sorted(
            {
                candidate.datasource_id
                for candidate in draft_run.source_candidates
                if candidate.datasource_id
                and candidate.applicability_status == "applicable"
            }
        )

        try:
            token = await self._ensure_user_token(
                user_id=draft_run.user_id,
                thread_id=draft_run.thread_id,
                token=extract_bearer_token(authorization),
            )
            context = await self._load_context_response(
                user_id=draft_run.user_id,
                city_id=draft_run.city_id,
                inventory_id=draft_run.inventory_id,
                token=token,
            )
            current_source_ids = sorted(
                {
                    candidate.datasource_id
                    for candidate in context.source_candidates
                    if candidate.datasource_id
                    and candidate.applicability_status == "applicable"
                }
            )
        except Exception as exc:
            logger.warning(
                "Failed to compute draft staleness for run=%s: %s",
                draft_run.draft_run_id,
                exc,
            )
            return DraftStalenessResponse(
                is_stale=False,
                stored_source_ids=stored_source_ids,
                current_source_ids=stored_source_ids,
            )

        is_stale = set(stored_source_ids) != set(current_source_ids)
        return DraftStalenessResponse(
            is_stale=is_stale,
            reason="connected_sources_changed" if is_stale else None,
            stored_source_ids=stored_source_ids,
            current_source_ids=current_source_ids,
        )
