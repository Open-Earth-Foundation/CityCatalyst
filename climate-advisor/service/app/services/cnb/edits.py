"""Proposal lifecycle orchestration; model-generated text is never auto-applied."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from time import perf_counter
from typing import Any
from uuid import UUID

from app.config.settings import get_settings
from app.db.cnb_reference import get_cnb_reference_session_factory
from app.db.session import get_session_factory
from app.models.cnb.concept_note_edits import (
    EditApplyRequest,
    EditProposalRequest,
    EditProposalResponse,
)
from app.models.db.concept_note import ConceptNoteContextBundle, ConceptNoteRun
from app.persistence.concept_notes.edits import (
    ConceptNoteEditRepository,
    EditOperationError,
)
from app.persistence.concept_notes.workspace import ConceptNoteWorkspaceRepository
from app.services.cnb.edit_planner import ConceptNoteEditPlanner
from app.services.cnb.edit_validation import validate_edit_plan
from app.utils.cnb_observability import record_edit_outcome
from app.utils.conversation_observability import finish_workflow_trace, workflow_trace
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

logger = logging.getLogger(__name__)


class ConceptNoteEditService:
    """Coordinate durable proposals and deterministic automatic-target validation."""

    def __init__(
        self,
        repository: ConceptNoteEditRepository,
        workspace: ConceptNoteWorkspaceRepository,
        planner: ConceptNoteEditPlanner,
        *,
        workflow_sessions: async_sessionmaker[AsyncSession],
    ) -> None:
        """Share existing CNB persistence boundaries and the configured planner."""
        self.repository = repository
        self.workspace = workspace
        self.planner = planner
        self._workflow_sessions = workflow_sessions

    @asynccontextmanager
    async def _locked_context(
        self, run: ConceptNoteRun
    ) -> AsyncIterator[dict[str, Any]]:
        """Serialize edit registration/application with funding changes.

        Read context only after acquiring the workflow row lock. Registration
        commits its processing proposal before releasing this lock, so funding
        changes will reject the run until planning finishes or is cancelled.
        """
        async with self._workflow_sessions() as session, session.begin():
            current = await session.scalar(
                select(ConceptNoteRun)
                .where(
                    ConceptNoteRun.run_id == run.run_id,
                    ConceptNoteRun.user_id == run.user_id,
                )
                .with_for_update()
            )
            if current is None or current.status != "active":
                raise EditOperationError(
                    "run_inactive", "Only an active Concept Note can be edited."
                )
            bundle = await session.get(ConceptNoteContextBundle, run.run_id)
            yield bundle.context_bundle if bundle else {}

    async def propose(
        self,
        run: ConceptNoteRun,
        request: EditProposalRequest,
        *,
        recent_messages: list[dict[str, str]] | None = None,
    ) -> EditProposalResponse:
        """Trace proposal inputs, model calls and the resulting proposed changes."""
        with workflow_trace(
            name="cnb_chat_edit",
            inputs={"request": request, "recent_messages": recent_messages},
            session_id=getattr(run, "thread_id", None) or run.run_id,
            user_id=run.user_id,
            attributes={
                "workflow": "CNB",
                "interaction": "chat_edit",
                "concept_note_run_id": str(run.run_id),
            },
        ) as span:
            started = perf_counter()
            try:
                result = await self._propose(
                    run,
                    request,
                    recent_messages=recent_messages,
                )
            except EditOperationError as error:
                record_edit_outcome(
                    run_id=run.run_id,
                    operation="propose",
                    outcome="failed",
                    error_code=error.code,
                )
                raise
            if result.status != "rejected" or result.changes:
                record_edit_outcome(
                    run_id=run.run_id,
                    proposal_id=result.proposal_id,
                    operation="propose",
                    outcome=result.status,
                    error_code=result.error_code,
                    duration_ms=(perf_counter() - started) * 1000,
                )
            finish_workflow_trace(span, result, ok=not bool(result.error_code))
            return result

    async def _propose(
        self,
        run: ConceptNoteRun,
        request: EditProposalRequest,
        *,
        recent_messages: list[dict[str, str]] | None,
    ) -> EditProposalResponse:
        """Persist progress before planning and recover safely from provider/cancellation failures."""
        # Register processing and snapshot authoritative context under one lock.
        async with self._locked_context(run) as run_context:
            proposal, created = await self.repository.start(
                run_id=run.run_id, user_id=run.user_id, request=request
            )
        if not created:
            return proposal
        identity = {
            "run_id": run.run_id,
            "user_id": run.user_id,
            "proposal_id": proposal.proposal_id,
        }
        # Preserve the real base vector; proposals remain separate from the draft.
        base_revisions = {}
        prior = None
        try:
            if request.refines_proposal_id:
                prior = await self.repository.get(
                    run_id=run.run_id,
                    user_id=run.user_id,
                    proposal_id=request.refines_proposal_id,
                )
            chapters = await self.workspace.list_chapters(run_id=run.run_id)
            if not chapters or any(
                chapter.body_markdown is None for chapter in chapters
            ):
                raise EditOperationError(
                    "draft_unavailable",
                    "Finish drafting before requesting edits.",
                    status_code=422,
                )
            if len(chapters) > 100:
                raise EditOperationError(
                    "context_limit",
                    "This draft exceeds the automatic edit revision-vector limit.",
                    status_code=422,
                )
            plan = await self.planner.plan(
                request,
                chapters,
                run_context or {},
                prior_proposal=prior,
                recent_messages=recent_messages,
            )
            if plan.intent == "question":
                return await self.repository.reject(**identity)
            if plan.intent == "clarification":
                return await self.repository.finish(
                    **identity,
                    base_revisions={},
                    changes=[],
                    clarification=plan.clarification,
                )
            changes = validate_edit_plan(
                request,
                chapters,
                plan,
                run_context,
                prior_proposal=prior,
                recent_messages=recent_messages,
            )
            # Automatic edits rely on the whole document remaining the reviewed base.
            base_revisions = {
                chapter.chapter_id: chapter.revision_number for chapter in chapters
            }
            result = await self.repository.finish(
                **identity, base_revisions=base_revisions, changes=changes
            )
            if (
                prior is not None
                and result.status == "proposed"
                and prior.status
                in {
                    "processing",
                    "proposed",
                    "clarification_required",
                    "failed",
                    "stale",
                }
            ):
                try:
                    await self.repository.reject(
                        run_id=run.run_id,
                        user_id=run.user_id,
                        proposal_id=prior.proposal_id,
                    )
                except EditOperationError as error:
                    if error.code != "already_applied":
                        raise
                    logger.info(
                        "Prior proposal was applied while refinement was planned run_id=%s proposal_id=%s",
                        run.run_id,
                        prior.proposal_id,
                    )
            return result
        except asyncio.CancelledError:
            await asyncio.shield(
                self.repository.finish(
                    **identity,
                    base_revisions=base_revisions,
                    changes=[],
                    error_code="planning_interrupted",
                )
            )
            record_edit_outcome(
                run_id=run.run_id,
                proposal_id=proposal.proposal_id,
                operation="propose",
                outcome="failed",
                error_code="planning_interrupted",
            )
            raise
        except EditOperationError as error:
            if error.code == "not_edit_request":
                return await self.repository.reject(**identity)
            if error.code == "clarification_required":
                return await self.repository.finish(
                    **identity,
                    base_revisions=base_revisions,
                    changes=[],
                    clarification=str(error),
                )
            logger.info(
                "Edit planning rejected run_id=%s proposal_id=%s code=%s",
                run.run_id,
                proposal.proposal_id,
                error.code,
            )
            return await self.repository.finish(
                **identity,
                base_revisions=base_revisions,
                changes=[],
                error_code=error.code,
            )
        except Exception:
            # Exception text may contain model/document payloads: emit only identifiers.
            logger.warning(
                "Edit planning failed run_id=%s proposal_id=%s code=planner_unavailable",
                run.run_id,
                proposal.proposal_id,
            )
            return await self.repository.finish(
                **identity,
                base_revisions=base_revisions,
                changes=[],
                error_code="planner_unavailable",
            )

    async def apply(
        self,
        run: ConceptNoteRun,
        proposal_id: UUID,
        request: EditApplyRequest,
    ) -> EditProposalResponse:
        """Recheck immutable evidence and record only metadata around explicit acceptance."""
        started = perf_counter()
        try:
            # Funding invalidation and acceptance use the same workflow-first
            # lock order; a stale proposal cannot race the funding commit.
            async with self._locked_context(run) as run_context:
                proposal = await self.repository.get(
                    run_id=run.run_id, user_id=run.user_id, proposal_id=proposal_id
                )
                sources = {
                    str(source.get("upload_id")): source.get("sha256")
                    for source in run_context.get("selected_sources", [])
                }
                changed = any(
                    sources.get(str(source.upload_id)) != source.sha256
                    for change in proposal.changes
                    for source in change.source_snapshots
                )
                if proposal.status == "proposed" and changed:
                    stale = await self.repository.mark_stale(
                        run_id=run.run_id, user_id=run.user_id, proposal_id=proposal_id
                    )
                    if stale.status == "stale":
                        raise EditOperationError(
                            "source_changed",
                            "The supporting source changed. Generate a fresh proposal.",
                        )
                result = await self.repository.apply(
                    run_id=run.run_id,
                    user_id=run.user_id,
                    proposal_id=proposal_id,
                    request=request,
                )
        except EditOperationError as error:
            record_edit_outcome(
                run_id=run.run_id,
                proposal_id=proposal_id,
                operation="apply",
                outcome="failed",
                error_code=error.code,
            )
            raise
        record_edit_outcome(
            run_id=run.run_id,
            proposal_id=proposal_id,
            revision_id=result.result.application_id if result.result else None,
            operation="apply",
            outcome=result.status,
            duration_ms=(perf_counter() - started) * 1000,
        )
        return result

    async def reject(
        self, run: ConceptNoteRun, proposal_id: UUID
    ) -> EditProposalResponse:
        """Reject explicitly while keeping both revisions and telemetry text-free."""
        result = await self.repository.reject(
            run_id=run.run_id, user_id=run.user_id, proposal_id=proposal_id
        )
        record_edit_outcome(
            run_id=run.run_id,
            proposal_id=proposal_id,
            operation="reject",
            outcome=result.status,
        )
        return result


def get_edit_service() -> ConceptNoteEditService | None:
    """Return the managed CNB edit boundary when the existing store is configured."""
    settings = get_settings()
    if not settings.cnb_database_url:
        return None
    sessions = get_cnb_reference_session_factory()
    return ConceptNoteEditService(
        ConceptNoteEditRepository(sessions),
        ConceptNoteWorkspaceRepository(sessions),
        ConceptNoteEditPlanner(settings),
        workflow_sessions=get_session_factory(),
    )
