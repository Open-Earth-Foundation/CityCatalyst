from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.middleware import get_request_id
from app.models.db.stationary_energy_draft import (
    StationaryEnergyDraftProposal,
    StationaryEnergyDraftRun,
    StationaryEnergyDraftSourceCandidate,
    StationaryEnergyReviewDecision,
)
from app.models.stationary_energy_drafts import (
    DraftProposal,
    LoadStationaryEnergyContextRequest,
    LoadStationaryEnergyContextResponse,
    RetryStationaryEnergyDraftRequest,
    ReviewDecisionInput,
    ReviewDecisionResponse,
    ReviewStationaryEnergyDraftRequest,
    ReviewStationaryEnergyDraftResponse,
    StartStationaryEnergyDraftRequest,
    StartStationaryEnergyDraftResponse,
    StationaryEnergyDraftStatusResponse,
    StationaryEnergySourceCandidate,
    StoredSourceCandidate,
    StoredSourceScope,
)
from app.services.citycatalyst_client import (
    CityCatalystClient,
    CityCatalystClientError,
    TokenRefreshError,
)
from app.services.stationary_energy_draft_repository import (
    StationaryEnergyDraftRepository,
)
from app.services.stationary_energy_llm_service import (
    StationaryEnergyLLMServiceError,
    StationaryEnergyProposalLLMService,
)
from app.services.thread_service import ThreadService
from app.utils.stationary_energy_context import (
    stationary_energy_scope_label,
    stationary_energy_scope_matches_target,
)
from app.utils.token_manager import (
    LogSafeFormatter,
    create_token_context,
    is_token_expired,
    parse_jwt_claims,
)


logger = logging.getLogger(__name__)

LOAD_CONTEXT_CAPABILITY = "ghgi.stationary_energy.load_context"


class StationaryEnergyDraftService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        cc_client: CityCatalystClient | None = None,
        proposal_generator: StationaryEnergyProposalLLMService | None = None,
    ) -> None:
        self.session = session
        self.repository = StationaryEnergyDraftRepository(session)
        self.thread_service = ThreadService(session)
        self.cc_client = cc_client or CityCatalystClient()
        self.proposal_generator = proposal_generator

    async def start_draft(
        self,
        payload: StartStationaryEnergyDraftRequest,
        *,
        authorization: str | None = None,
    ) -> StartStationaryEnergyDraftResponse:
        trace_id = get_request_id()
        canonical_user_id, token = await self._resolve_user_and_token(
            payload,
            authorization=authorization,
        )

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
        )

    async def retry_draft(
        self,
        *,
        draft_run_id: UUID,
        payload: RetryStationaryEnergyDraftRequest,
        authorization: str | None = None,
    ) -> StartStationaryEnergyDraftResponse:
        trace_id = get_request_id()
        draft_run = await self._get_draft_run_or_404(draft_run_id)
        token = self._extract_bearer_token(authorization) or self._extract_token(
            payload.context
        )
        if token is None and draft_run.thread_id:
            thread = await self.thread_service.get_thread(draft_run.thread_id)
            if thread is not None:
                token = self._extract_token(thread.context)

        user_id = self._resolve_authenticated_user_id(
            token=token,
            requested_user_id=payload.user_id,
        )
        if draft_run.user_id != user_id:
            raise HTTPException(status_code=403, detail="Draft run does not belong to user")

        if draft_run.status in {"reviewed", "partially_committed"}:
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
    ) -> StartStationaryEnergyDraftResponse:
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

            allowed_capabilities = await self.cc_client.get_stationary_energy_allowed_capabilities(
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
            if isinstance(context_payload, dict) and "data" in context_payload and "city" not in context_payload:
                context_payload = context_payload["data"]
            context = LoadStationaryEnergyContextResponse.model_validate(context_payload)

            source_candidates = await self.repository.replace_source_candidates(
                draft_run.draft_run_id,
                self._source_candidate_records(draft_run.draft_run_id, context.source_candidates),
            )
            stored_source_candidates = [
                self._stored_source_candidate_payload(candidate)
                for candidate in source_candidates
            ]
            failed_step = "generating"
            await self.repository.update_draft_run(draft_run, status="generating")
            proposal_generator = self.proposal_generator or StationaryEnergyProposalLLMService()
            llm_result = await proposal_generator.generate_proposals(
                context=context,
                stored_source_candidates=stored_source_candidates,
                allowed_capabilities=allowed_capabilities,
                trace_id=trace_id,
            )
            proposals = await self.repository.replace_proposals(
                draft_run.draft_run_id,
                llm_result.proposals,
            )
            context_summary = self._context_summary(context, allowed_capabilities)
            context_summary["llm_trace"] = llm_result.trace
            await self.repository.update_draft_run(
                draft_run,
                status="ready",
                workflow_step="draft",
                context_summary=context_summary,
                permission_summary=context.permission_summary,
                trace_id=trace_id,
            )

            logger.info(
                "Stationary Energy draft ready run=%s user_id=%s city_id=%s inventory_id=%s candidates=%s proposals=%s",
                draft_run.draft_run_id,
                user_id,
                city_id,
                inventory_id,
                len(source_candidates),
                len(proposals),
            )
            return self._to_start_response(draft_run, proposals_override=proposals)
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
        except StationaryEnergyLLMServiceError as exc:
            await self._mark_failed(
                draft_run,
                failed_step=failed_step,
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

    async def get_draft_status(
        self,
        *,
        draft_run_id: UUID,
        requested_user_id: str,
        authorization: str | None = None,
    ) -> StationaryEnergyDraftStatusResponse:
        user_id = self._resolve_authenticated_user_id(
            token=self._extract_bearer_token(authorization),
            requested_user_id=requested_user_id,
        )
        draft_run = await self._get_owned_draft_run(draft_run_id, user_id)
        return self._to_status_response(draft_run)

    async def review_draft(
        self,
        *,
        draft_run_id: UUID,
        payload: ReviewStationaryEnergyDraftRequest,
        authorization: str | None = None,
    ) -> ReviewStationaryEnergyDraftResponse:
        user_id = self._resolve_authenticated_user_id(
            token=self._extract_bearer_token(authorization),
            requested_user_id=payload.user_id,
        )
        draft_run = await self._get_owned_draft_run(draft_run_id, user_id)

        proposal_by_id = {proposal.proposal_id: proposal for proposal in draft_run.proposals}
        self._validate_complete_review_decisions(payload.decisions, proposal_by_id)
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

        decisions: list[StationaryEnergyReviewDecision] = []
        for decision_input in payload.decisions:
            proposal = proposal_by_id.get(decision_input.proposal_id)
            if proposal is None:
                raise HTTPException(
                    status_code=400,
                    detail=f"Proposal {decision_input.proposal_id} does not belong to this draft",
                )

            selected_candidate = self._resolve_selected_candidate(
                decision_input,
                candidate_by_id,
                candidate_by_datasource,
            )
            self._validate_review_action(decision_input, proposal, selected_candidate)

            commit_status = self._commit_status_for_action(decision_input.action)
            decision = StationaryEnergyReviewDecision(
                draft_run_id=draft_run.draft_run_id,
                proposal_id=proposal.proposal_id,
                decision_version=next_review_versions.get(proposal.proposal_id, 1),
                user_id=user_id,
                action=decision_input.action,
                selected_source_id=self._selected_source_id_for_storage(
                    decision_input,
                    selected_candidate,
                ),
                selected_candidate_id=selected_candidate.candidate_id if selected_candidate else None,
                manual_value=decision_input.manual_value,
                manual_unit=decision_input.manual_unit,
                note=decision_input.note,
                commit_status=commit_status,
                commit_response=self._commit_response_for_action(decision_input.action),
            )
            self._apply_proposal_status(proposal, decision_input.action)
            decisions.append(decision)

        await self.repository.persist_review_decisions(decisions)
        await self.repository.update_draft_run(
            draft_run,
            status="reviewed",
            workflow_step="review",
        )

        return ReviewStationaryEnergyDraftResponse(
            draft_run_id=draft_run.draft_run_id,
            user_id=user_id,
            status="reviewed",
            decisions=[self._to_review_decision_response(decision) for decision in decisions],
        )

    async def _resolve_user_and_token(
        self,
        payload: StartStationaryEnergyDraftRequest,
        *,
        authorization: str | None,
    ) -> tuple[str, str | None]:
        request_token = self._extract_bearer_token(authorization) or self._extract_token(
            payload.context
        )

        if payload.thread_id is None:
            user_id = self._resolve_authenticated_user_id(
                token=request_token,
                requested_user_id=payload.user_id,
            )
            return user_id, request_token

        thread = await self.thread_service.get_thread(payload.thread_id)
        if thread is None:
            raise HTTPException(status_code=404, detail=f"Thread {payload.thread_id} not found")

        thread_token = self._extract_token(thread.context)
        token = request_token or thread_token
        user_id = self._resolve_authenticated_user_id(
            token=token,
            requested_user_id=payload.user_id,
        )
        if thread.user_id != user_id:
            raise HTTPException(status_code=403, detail="Thread does not belong to user")
        return user_id, token

    async def _get_draft_run_or_404(
        self,
        draft_run_id: UUID,
    ) -> StationaryEnergyDraftRun:
        draft_run = await self.repository.get_draft_run(draft_run_id)
        if draft_run is None:
            raise HTTPException(status_code=404, detail=f"Draft run {draft_run_id} not found")
        return draft_run

    async def _get_owned_draft_run(
        self,
        draft_run_id: UUID,
        user_id: str,
    ) -> StationaryEnergyDraftRun:
        draft_run = await self.repository.get_draft_run(draft_run_id)
        if draft_run is None:
            raise HTTPException(status_code=404, detail=f"Draft run {draft_run_id} not found")
        if draft_run.user_id != user_id:
            raise HTTPException(status_code=403, detail="Draft run does not belong to user")
        return draft_run

    @staticmethod
    def _extract_token(context: Any) -> str | None:
        if not isinstance(context, dict):
            return None
        return context.get("cc_access_token") or context.get("access_token")

    @staticmethod
    def _extract_bearer_token(authorization: str | None) -> str | None:
        if authorization is None:
            return None
        scheme, separator, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not separator or not token.strip():
            raise HTTPException(
                status_code=401,
                detail="Authorization header must use Bearer token",
            )
        return token.strip()

    @staticmethod
    def _token_user_id(token: str) -> str | None:
        claims = parse_jwt_claims(token)
        if not isinstance(claims, dict):
            return None
        value = claims.get("sub") or claims.get("user_id") or claims.get("userId")
        return str(value) if value else None

    def _resolve_authenticated_user_id(
        self,
        *,
        token: str | None,
        requested_user_id: str,
    ) -> str:
        if not token:
            raise HTTPException(
                status_code=401,
                detail="CityCatalyst access token is required",
            )

        token_user_id = self._token_user_id(token)
        if not token_user_id:
            raise HTTPException(
                status_code=401,
                detail="CityCatalyst access token must include a user subject",
            )
        if token_user_id != requested_user_id:
            raise HTTPException(
                status_code=403,
                detail="Request user does not match access token",
            )
        return token_user_id

    async def _ensure_user_token(
        self,
        *,
        user_id: str,
        thread_id: UUID | None,
        token: str | None,
    ) -> str | None:
        if not token:
            raise HTTPException(
                status_code=401,
                detail="CityCatalyst access token is required",
            )
        if token and not self._needs_token_refresh(token):
            return token

        if token:
            logger.info("Refreshing expired CityCatalyst token for Stationary Energy draft user_id=%s", user_id)

        fresh_token, expires_in = await self.cc_client.refresh_token(user_id)
        if thread_id:
            await self._persist_thread_token(thread_id, user_id, fresh_token, expires_in)
        return fresh_token

    @staticmethod
    def _needs_token_refresh(token: str) -> bool:
        if "." not in token:
            return False
        claims = parse_jwt_claims(token)
        if claims is None:
            return False
        if "exp" not in claims:
            return True
        return is_token_expired(token)

    async def _persist_thread_token(
        self,
        thread_id: UUID,
        user_id: str,
        token: str,
        expires_in: int,
    ) -> None:
        thread = await self.thread_service.get_thread(thread_id)
        if thread is None or thread.user_id != user_id:
            return
        await self.thread_service.update_context(
            thread=thread,
            context_update=create_token_context(token, expires_in),
        )

    async def _mark_failed(
        self,
        draft_run: StationaryEnergyDraftRun,
        *,
        failed_step: str,
        exc: Exception,
        trace_id: str | None,
    ) -> None:
        await self.repository.update_draft_run(
            draft_run,
            status="failed",
            workflow_step="draft",
            context_summary=self._context_summary_with_error(
                draft_run.context_summary,
                failed_step=failed_step,
                exc=exc,
                trace_id=trace_id,
            ),
            trace_id=trace_id,
        )

    @staticmethod
    def _context_summary_with_error(
        existing: dict[str, Any] | None,
        *,
        failed_step: str,
        exc: Exception,
        trace_id: str | None,
    ) -> dict[str, Any]:
        context_summary = dict(existing or {})
        safe_message = LogSafeFormatter.redact_tokens(str(exc))[:500]
        context_summary["error_summary"] = {
            "failed_step": failed_step,
            "error_type": type(exc).__name__,
            "message": safe_message,
            "trace_id": trace_id,
            "failed_at": datetime.now(timezone.utc).isoformat(),
        }
        context_summary["attempt_count"] = int(context_summary.get("attempt_count") or 0) + 1
        return context_summary

    @staticmethod
    def _source_candidate_records(
        draft_run_id: UUID,
        candidates: list[StationaryEnergySourceCandidate],
    ) -> list[dict[str, Any]]:
        records: list[dict[str, Any]] = []
        for candidate in candidates:
            candidate_json = candidate.model_dump(mode="json", exclude={"quality_score"})
            records.append(
                {
                    "datasource_id": candidate.datasource_id,
                    "name": candidate.name,
                    "publisher_name": candidate.publisher_name,
                    "retrieval_method": candidate.retrieval_method,
                    "dataset_name": candidate.dataset_name,
                    "dataset_year": candidate.dataset_year,
                    "url": candidate.url,
                    "geography_match": candidate.geography_match,
                    "source_scope": candidate.source_scope.model_dump(
                        mode="json",
                        exclude_none=True,
                    ),
                    "source_data": candidate_json.get("source_data"),
                    "normalized_rows": candidate_json.get("normalized_rows") or [],
                    "applicability_status": candidate.applicability_status,
                    "applicability_issues": candidate.applicability_issues,
                    "failure_reason": candidate.failure_reason,
                    "quality_score": candidate.quality_score,
                    "confidence_notes": candidate.confidence_notes,
                }
            )
        if not records:
            logger.info("No Stationary Energy source candidates received for draft=%s", draft_run_id)
        return records

    @staticmethod
    def _stored_source_candidate_payload(
        candidate: StationaryEnergyDraftSourceCandidate,
    ) -> dict[str, Any]:
        return StoredSourceCandidate(
            candidate_id=candidate.candidate_id,
            draft_run_id=candidate.draft_run_id,
            datasource_id=candidate.datasource_id,
            name=candidate.name,
            publisher_name=candidate.publisher_name,
            retrieval_method=candidate.retrieval_method,
            dataset_name=candidate.dataset_name,
            dataset_year=candidate.dataset_year,
            url=candidate.url,
            geography_match=candidate.geography_match,  # type: ignore[arg-type]
            source_scope=StoredSourceScope.model_validate(candidate.source_scope or {}),
            source_data=candidate.source_data,
            normalized_rows=candidate.normalized_rows or [],
            applicability_status=candidate.applicability_status,  # type: ignore[arg-type]
            applicability_issues=candidate.applicability_issues or [],
            failure_reason=candidate.failure_reason,
            quality_score=candidate.quality_score,
            confidence_notes=candidate.confidence_notes,
            created_at=candidate.created_at,
            updated_at=candidate.updated_at,
        ).model_dump(mode="json", exclude_none=True)

    @staticmethod
    def _context_summary(
        context: LoadStationaryEnergyContextResponse,
        allowed_capabilities: list[str],
    ) -> dict[str, Any]:
        return {
            "city": context.city.model_dump(mode="json", exclude_none=True),
            "inventory": context.inventory.model_dump(mode="json", exclude_none=True),
            "taxonomy_count": len(context.taxonomy),
            "current_values_count": len(context.current_values),
            "source_candidates_count": len(context.source_candidates),
            "allowed_capabilities": allowed_capabilities,
        }

    @staticmethod
    def _resolve_selected_candidate(
        decision_input: ReviewDecisionInput,
        candidate_by_id: dict[str, StationaryEnergyDraftSourceCandidate],
        candidate_by_datasource: dict[str, StationaryEnergyDraftSourceCandidate],
    ) -> StationaryEnergyDraftSourceCandidate | None:
        if decision_input.action != "override_source":
            return None
        if not decision_input.selected_source_id:
            raise HTTPException(
                status_code=400,
                detail="selected_source_id is required for override_source",
            )

        selected = (
            candidate_by_id.get(decision_input.selected_source_id)
            or candidate_by_datasource.get(decision_input.selected_source_id)
        )
        if selected is None:
            raise HTTPException(
                status_code=400,
                detail="selected_source_id must match a stored candidate for this draft",
            )
        return selected

    @staticmethod
    def _validate_review_action(
        decision_input: ReviewDecisionInput,
        proposal: StationaryEnergyDraftProposal,
        selected_candidate: StationaryEnergyDraftSourceCandidate | None,
    ) -> None:
        if decision_input.action == "accept" and proposal.recommended_candidate_id is None:
            raise HTTPException(
                status_code=400,
                detail="Cannot accept a proposal without a recommended source candidate",
            )
        if decision_input.action == "override_source" and selected_candidate is None:
            raise HTTPException(
                status_code=400,
                detail="selected_source_id must match a stored candidate for this draft",
            )
        if (
            decision_input.action == "override_source"
            and selected_candidate is not None
            and selected_candidate.applicability_status != "applicable"
        ):
            raise HTTPException(
                status_code=400,
                detail="selected_source_id must match an applicable stored candidate",
            )
        if (
            decision_input.action == "override_source"
            and selected_candidate is not None
            and not stationary_energy_scope_matches_target(
                target_ref=proposal.target_ref,
                source_scope=selected_candidate.source_scope,
            )
        ):
            raise HTTPException(
                status_code=400,
                detail=(
                    "selected_source_id must match the proposal target scope "
                    f"({stationary_energy_scope_label(proposal.target_ref)})"
                ),
            )
        if decision_input.action == "override_manual" and decision_input.manual_value is None:
            raise HTTPException(
                status_code=400,
                detail="manual_value is required for override_manual",
            )

    @staticmethod
    def _validate_complete_review_decisions(
        decisions: list[ReviewDecisionInput],
        proposal_by_id: dict[UUID, StationaryEnergyDraftProposal],
    ) -> None:
        if not proposal_by_id:
            raise HTTPException(
                status_code=400,
                detail="Draft has no proposals to review",
            )
        if not decisions:
            raise HTTPException(
                status_code=400,
                detail="Review decisions must cover every proposal",
            )

        proposal_ids = set(proposal_by_id)
        seen: set[UUID] = set()
        duplicates: set[UUID] = set()
        unknown: set[UUID] = set()
        for decision in decisions:
            if decision.proposal_id in seen:
                duplicates.add(decision.proposal_id)
            seen.add(decision.proposal_id)
            if decision.proposal_id not in proposal_ids:
                unknown.add(decision.proposal_id)

        if duplicates:
            raise HTTPException(
                status_code=400,
                detail="Each proposal can only have one review decision",
            )
        if unknown:
            raise HTTPException(
                status_code=400,
                detail="Review decision proposal_id must belong to this draft",
            )
        if seen != proposal_ids:
            raise HTTPException(
                status_code=400,
                detail="Review decisions must cover every proposal",
            )

    @staticmethod
    def _commit_status_for_action(action: str) -> str:
        if action in {"accept", "override_source"}:
            return "pending_cc_commit"
        if action == "override_manual":
            return "staged_manual"
        return "not_applicable"

    @staticmethod
    def _commit_response_for_action(action: str) -> dict[str, Any] | None:
        if action in {"accept", "override_source"}:
            return {
                "state": "pending",
                "reason": "CC commit capability is outside the CA-side draft persistence implementation.",
            }
        return None

    @staticmethod
    def _apply_proposal_status(
        proposal: StationaryEnergyDraftProposal,
        action: str,
    ) -> None:
        status_by_action = {
            "accept": "accepted",
            "override_source": "overridden",
            "override_manual": "overridden",
            "leave_draft": "left_draft",
        }
        proposal.status = status_by_action[action]
        proposal.updated_at = datetime.now(timezone.utc)

    def _to_start_response(
        self,
        draft_run: StationaryEnergyDraftRun,
        *,
        status_override: str | None = None,
        proposals_override: list[StationaryEnergyDraftProposal] | None = None,
    ) -> StartStationaryEnergyDraftResponse:
        status = status_override or draft_run.status
        if status not in {"resolving_scope", "loading_context", "generating", "ready", "failed"}:
            status = "ready"
        proposals = proposals_override if proposals_override is not None else draft_run.proposals
        return StartStationaryEnergyDraftResponse(
            draft_run_id=draft_run.draft_run_id,
            thread_id=draft_run.thread_id,
            user_id=draft_run.user_id,
            city_id=draft_run.city_id,
            inventory_id=draft_run.inventory_id,
            sector_code="stationary_energy",
            status=status,  # type: ignore[arg-type]
            proposals=[
                self._to_draft_proposal(proposal)
                for proposal in sorted(proposals, key=lambda item: str(item.proposal_id))
            ],
            trace_id=draft_run.trace_id,
            llm_trace=self._llm_trace(draft_run),
            error_summary=self._error_summary(draft_run),
        )

    def _to_status_response(
        self,
        draft_run: StationaryEnergyDraftRun,
    ) -> StationaryEnergyDraftStatusResponse:
        return StationaryEnergyDraftStatusResponse(
            draft_run_id=draft_run.draft_run_id,
            thread_id=draft_run.thread_id,
            user_id=draft_run.user_id,
            city_id=draft_run.city_id,
            inventory_id=draft_run.inventory_id,
            sector_code="stationary_energy",
            status=draft_run.status,
            workflow_step=draft_run.workflow_step,
            proposals=[
                self._to_draft_proposal(proposal)
                for proposal in sorted(draft_run.proposals, key=lambda item: str(item.proposal_id))
            ],
            review_decisions=[
                self._to_review_decision_response(decision)
                for decision in sorted(
                    draft_run.review_decisions,
                    key=self._review_decision_sort_key,
                )
            ],
            source_candidates=[
                self._to_stored_source_candidate(candidate)
                for candidate in sorted(draft_run.source_candidates, key=lambda item: str(item.candidate_id))
            ],
            trace_id=draft_run.trace_id,
            llm_trace=self._llm_trace(draft_run),
            error_summary=self._error_summary(draft_run),
            created_at=draft_run.created_at,
            updated_at=draft_run.updated_at,
        )

    @staticmethod
    def _llm_trace(draft_run: StationaryEnergyDraftRun) -> dict[str, Any] | None:
        if not isinstance(draft_run.context_summary, dict):
            return None
        trace = draft_run.context_summary.get("llm_trace")
        return trace if isinstance(trace, dict) else None

    @staticmethod
    def _error_summary(draft_run: StationaryEnergyDraftRun) -> dict[str, Any] | None:
        if not isinstance(draft_run.context_summary, dict):
            return None
        error_summary = draft_run.context_summary.get("error_summary")
        return error_summary if isinstance(error_summary, dict) else None

    @staticmethod
    def _to_draft_proposal(
        proposal: StationaryEnergyDraftProposal,
    ) -> DraftProposal:
        return DraftProposal(
            proposal_id=proposal.proposal_id,
            draft_run_id=proposal.draft_run_id,
            target_ref=proposal.target_ref or {},
            current_value=proposal.current_value,
            recommended_candidate_id=proposal.recommended_candidate_id,
            recommended_datasource_id=proposal.recommended_datasource_id,
            alternative_candidate_ids=proposal.alternative_candidate_ids or [],
            proposed_value=proposal.proposed_value,
            rationale=proposal.rationale,
            status=proposal.status,  # type: ignore[arg-type]
            confidence_score=proposal.confidence_score,
            created_at=proposal.created_at,
            updated_at=proposal.updated_at,
        )

    @staticmethod
    def _to_stored_source_candidate(
        candidate: StationaryEnergyDraftSourceCandidate,
    ) -> StoredSourceCandidate:
        return StoredSourceCandidate(
            candidate_id=candidate.candidate_id,
            draft_run_id=candidate.draft_run_id,
            datasource_id=candidate.datasource_id,
            name=candidate.name,
            publisher_name=candidate.publisher_name,
            retrieval_method=candidate.retrieval_method,
            dataset_name=candidate.dataset_name,
            dataset_year=candidate.dataset_year,
            url=candidate.url,
            geography_match=candidate.geography_match,  # type: ignore[arg-type]
            source_scope=StoredSourceScope.model_validate(candidate.source_scope or {}),
            source_data=candidate.source_data,
            normalized_rows=candidate.normalized_rows or [],
            applicability_status=candidate.applicability_status,  # type: ignore[arg-type]
            applicability_issues=candidate.applicability_issues or [],
            failure_reason=candidate.failure_reason,
            quality_score=candidate.quality_score,
            confidence_notes=candidate.confidence_notes,
            created_at=candidate.created_at,
            updated_at=candidate.updated_at,
        )

    @staticmethod
    def _to_review_decision_response(
        decision: StationaryEnergyReviewDecision,
    ) -> ReviewDecisionResponse:
        return ReviewDecisionResponse(
            decision_id=decision.decision_id,
            draft_run_id=decision.draft_run_id,
            proposal_id=decision.proposal_id,
            decision_version=decision.decision_version,
            user_id=decision.user_id,
            action=decision.action,
            selected_source_id=decision.selected_source_id,
            selected_candidate_id=decision.selected_candidate_id,
            manual_value=decision.manual_value,
            manual_unit=decision.manual_unit,
            note=decision.note,
            commit_status=decision.commit_status,
            commit_response=decision.commit_response,
            created_at=decision.created_at,
            updated_at=decision.updated_at,
        )

    @staticmethod
    def _selected_source_id_for_storage(
        decision_input: ReviewDecisionInput,
        selected_candidate: StationaryEnergyDraftSourceCandidate | None,
    ) -> str | None:
        if decision_input.action != "override_source" or selected_candidate is None:
            return decision_input.selected_source_id
        return selected_candidate.datasource_id

    @staticmethod
    def _review_decision_sort_key(
        decision: StationaryEnergyReviewDecision,
    ) -> tuple[str, int, str]:
        return (
            str(decision.proposal_id),
            decision.decision_version,
            str(decision.decision_id),
        )
