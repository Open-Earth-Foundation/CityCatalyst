from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.db.stationary_energy_draft import (
    StationaryEnergyDraftProposal,
    StationaryEnergyDraftRun,
    StationaryEnergyDraftSourceCandidate,
    StationaryEnergyReviewDecision,
    StationaryEnergyStagedReviewSelection,
)


class StationaryEnergyDraftRepository:
    """Database access layer for Stationary Energy draft persistence."""

    def __init__(self, session: AsyncSession) -> None:
        """Store the async session used for draft persistence queries."""
        self.session = session

    async def create_draft_run(
        self,
        *,
        user_id: str,
        city_id: str,
        inventory_id: str,
        thread_id: UUID | None,
        trace_id: str | None,
    ) -> StationaryEnergyDraftRun:
        """Insert a new Stationary Energy draft run row and flush it."""
        draft_run = StationaryEnergyDraftRun(
            user_id=user_id,
            city_id=city_id,
            inventory_id=inventory_id,
            thread_id=thread_id,
            sector_code="stationary_energy",
            status="resolving_scope",
            workflow_step="draft",
            trace_id=trace_id,
        )
        self.session.add(draft_run)
        await self.session.flush()
        return draft_run

    async def get_draft_run(
        self,
        draft_run_id: UUID,
    ) -> StationaryEnergyDraftRun | None:
        """Load a draft run with proposals, candidates, and review decisions."""
        result = await self.session.execute(
            select(StationaryEnergyDraftRun)
            .options(
                selectinload(StationaryEnergyDraftRun.source_candidates),
                selectinload(StationaryEnergyDraftRun.proposals),
                selectinload(StationaryEnergyDraftRun.review_decisions),
                selectinload(StationaryEnergyDraftRun.staged_review_selections),
            )
            .where(StationaryEnergyDraftRun.draft_run_id == draft_run_id)
        )
        return result.scalar_one_or_none()

    async def get_draft_run_for_user(
        self,
        draft_run_id: UUID,
        user_id: str,
    ) -> StationaryEnergyDraftRun | None:
        """Load a draft run only when it belongs to the requested user."""
        draft_run = await self.get_draft_run(draft_run_id)
        if draft_run is None or draft_run.user_id != user_id:
            return None
        return draft_run

    async def get_latest_draft_run_for_scope(
        self,
        *,
        user_id: str,
        city_id: str,
        inventory_id: str,
        sector_code: str,
        excluded_statuses: set[str] | None = None,
    ) -> StationaryEnergyDraftRun | None:
        """Load the newest draft matching the durable user/city/inventory scope."""
        # Eager-load review children because resume callers immediately serialize state.
        query = (
            select(StationaryEnergyDraftRun)
            .options(
                selectinload(StationaryEnergyDraftRun.source_candidates),
                selectinload(StationaryEnergyDraftRun.proposals),
                selectinload(StationaryEnergyDraftRun.review_decisions),
                selectinload(StationaryEnergyDraftRun.staged_review_selections),
            )
            .where(
                StationaryEnergyDraftRun.user_id == user_id,
                StationaryEnergyDraftRun.city_id == city_id,
                StationaryEnergyDraftRun.inventory_id == inventory_id,
                StationaryEnergyDraftRun.sector_code == sector_code,
            )
            .order_by(
                StationaryEnergyDraftRun.updated_at.desc(),
                StationaryEnergyDraftRun.created_at.desc(),
                StationaryEnergyDraftRun.draft_run_id.desc(),
            )
        )
        # Exclude terminal or failed statuses when callers need a resumable draft.
        if excluded_statuses:
            query = query.where(
                StationaryEnergyDraftRun.status.notin_(excluded_statuses)
            )

        # Use updated_at first so retries and review saves become the active draft.
        result = await self.session.execute(query)
        return result.scalars().first()

    async def list_draft_runs_for_scope(
        self,
        *,
        user_id: str,
        city_id: str,
        inventory_id: str,
        sector_code: str,
        excluded_statuses: set[str] | None = None,
    ) -> list[StationaryEnergyDraftRun]:
        """Load every draft matching the durable user/city/inventory scope."""
        # Eager-load related rows to avoid lazy IO during list serialization.
        query = (
            select(StationaryEnergyDraftRun)
            .options(
                selectinload(StationaryEnergyDraftRun.source_candidates),
                selectinload(StationaryEnergyDraftRun.proposals),
                selectinload(StationaryEnergyDraftRun.review_decisions),
                selectinload(StationaryEnergyDraftRun.staged_review_selections),
            )
            .where(
                StationaryEnergyDraftRun.user_id == user_id,
                StationaryEnergyDraftRun.city_id == city_id,
                StationaryEnergyDraftRun.inventory_id == inventory_id,
                StationaryEnergyDraftRun.sector_code == sector_code,
            )
            .order_by(
                StationaryEnergyDraftRun.updated_at.desc(),
                StationaryEnergyDraftRun.created_at.desc(),
                StationaryEnergyDraftRun.draft_run_id.desc(),
            )
        )
        # Keep filtering optional so history screens can include terminal drafts.
        if excluded_statuses:
            query = query.where(
                StationaryEnergyDraftRun.status.notin_(excluded_statuses)
            )

        # Preserve newest-first ordering for draft picker consumers.
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def update_draft_run(
        self,
        draft_run: StationaryEnergyDraftRun,
        *,
        status: str | None = None,
        workflow_step: str | None = None,
        context_summary: dict[str, Any] | None = None,
        permission_summary: dict[str, Any] | None = None,
        trace_id: str | None = None,
    ) -> StationaryEnergyDraftRun:
        """Apply partial field updates to a draft run and flush them."""
        if status is not None:
            draft_run.status = status
        if workflow_step is not None:
            draft_run.workflow_step = workflow_step
        if context_summary is not None:
            draft_run.context_summary = context_summary
        if permission_summary is not None:
            draft_run.permission_summary = permission_summary
        if trace_id is not None:
            draft_run.trace_id = trace_id
        draft_run.updated_at = datetime.now(timezone.utc)
        await self.session.flush()
        return draft_run

    async def replace_source_candidates(
        self,
        draft_run_id: UUID,
        candidates: list[dict[str, Any]],
    ) -> list[StationaryEnergyDraftSourceCandidate]:
        """Replace the stored candidate snapshot for a draft run."""
        await self.session.execute(
            delete(StationaryEnergyDraftSourceCandidate).where(
                StationaryEnergyDraftSourceCandidate.draft_run_id == draft_run_id
            )
        )
        await self.session.flush()

        models = [
            StationaryEnergyDraftSourceCandidate(
                draft_run_id=draft_run_id,
                **candidate,
            )
            for candidate in candidates
        ]
        self.session.add_all(models)
        await self.session.flush()
        return models

    async def replace_proposals(
        self,
        draft_run_id: UUID,
        proposals: list[dict[str, Any]],
    ) -> list[StationaryEnergyDraftProposal]:
        """Replace the stored proposal snapshot for a draft run."""
        await self.session.execute(
            delete(StationaryEnergyDraftProposal).where(
                StationaryEnergyDraftProposal.draft_run_id == draft_run_id
            )
        )
        await self.session.flush()

        models = [
            StationaryEnergyDraftProposal(
                draft_run_id=draft_run_id,
                **proposal,
            )
            for proposal in proposals
        ]
        self.session.add_all(models)
        await self.session.flush()
        return models

    async def add_proposals(
        self,
        draft_run_id: UUID,
        proposals: list[dict[str, Any]],
    ) -> list[StationaryEnergyDraftProposal]:
        """Append proposals to a draft run without clearing existing rows.

        Used by the staggered (per-row) generation path so that pollers can see
        proposals accumulate incrementally instead of all-at-once.
        """
        models = [
            StationaryEnergyDraftProposal(
                draft_run_id=draft_run_id,
                **proposal,
            )
            for proposal in proposals
        ]
        self.session.add_all(models)
        await self.session.flush()
        return models

    async def persist_review_decisions(
        self,
        decisions: list[StationaryEnergyReviewDecision],
    ) -> list[StationaryEnergyReviewDecision]:
        """Insert review decision rows and flush them."""
        self.session.add_all(decisions)
        await self.session.flush()
        return decisions

    async def get_staged_review_selections(
        self,
        *,
        draft_run_id: UUID,
        user_id: str,
    ) -> list[StationaryEnergyStagedReviewSelection]:
        """Load active staged selections for one user and draft."""
        result = await self.session.execute(
            select(StationaryEnergyStagedReviewSelection).where(
                StationaryEnergyStagedReviewSelection.draft_run_id == draft_run_id,
                StationaryEnergyStagedReviewSelection.user_id == user_id,
                StationaryEnergyStagedReviewSelection.status == "active",
            )
        )
        return list(result.scalars().all())

    async def upsert_staged_review_selections(
        self,
        selections: list[StationaryEnergyStagedReviewSelection],
    ) -> list[StationaryEnergyStagedReviewSelection]:
        """Create or replace active staged selections keyed by draft/proposal/user."""
        persisted: list[StationaryEnergyStagedReviewSelection] = []
        for selection in selections:
            # Reuse the unique draft/proposal/user row so staging is idempotent.
            existing_result = await self.session.execute(
                select(StationaryEnergyStagedReviewSelection).where(
                    StationaryEnergyStagedReviewSelection.draft_run_id
                    == selection.draft_run_id,
                    StationaryEnergyStagedReviewSelection.proposal_id
                    == selection.proposal_id,
                    StationaryEnergyStagedReviewSelection.user_id == selection.user_id,
                )
            )
            existing = existing_result.scalar_one_or_none()
            if existing is None:
                self.session.add(selection)
                persisted.append(selection)
                continue

            # Replace the staged choice while keeping the stable selection identity.
            existing.action = selection.action
            existing.selected_source_id = selection.selected_source_id
            existing.selected_candidate_id = selection.selected_candidate_id
            existing.notation_key = selection.notation_key
            existing.unavailable_reason = selection.unavailable_reason
            existing.unavailable_explanation = selection.unavailable_explanation
            existing.rationale = selection.rationale
            existing.tool_call_id = selection.tool_call_id
            existing.status = selection.status
            existing.updated_at = datetime.now(timezone.utc)
            persisted.append(existing)

        # Flush once after all inserts/updates so callers can continue the transaction.
        await self.session.flush()
        return persisted

    async def mark_staged_review_selections_saved(
        self,
        *,
        draft_run_id: UUID,
        user_id: str,
    ) -> None:
        """Mark active staged selections as persisted into review decisions."""
        selections = await self.get_staged_review_selections(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        for selection in selections:
            selection.status = "saved"
            selection.updated_at = datetime.now(timezone.utc)
        await self.session.flush()

    async def mark_staged_review_selections_rolled_back(
        self,
        *,
        draft_run_id: UUID,
        user_id: str,
        proposal_ids: set[UUID] | None = None,
    ) -> list[StationaryEnergyStagedReviewSelection]:
        """Mark active staged selections as rolled back."""
        selections = await self.get_staged_review_selections(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        rolled_back = [
            selection
            for selection in selections
            if proposal_ids is None or selection.proposal_id in proposal_ids
        ]
        for selection in rolled_back:
            selection.status = "rolled_back"
            selection.updated_at = datetime.now(timezone.utc)
        await self.session.flush()
        return rolled_back

    async def get_next_review_versions(
        self,
        *,
        draft_run_id: UUID,
        proposal_ids: list[UUID],
    ) -> dict[UUID, int]:
        """Return the next decision version number for each reviewed proposal."""
        if not proposal_ids:
            return {}

        result = await self.session.execute(
            select(
                StationaryEnergyReviewDecision.proposal_id,
                func.max(StationaryEnergyReviewDecision.decision_version),
            )
            .where(
                StationaryEnergyReviewDecision.draft_run_id == draft_run_id,
                StationaryEnergyReviewDecision.proposal_id.in_(proposal_ids),
            )
            .group_by(StationaryEnergyReviewDecision.proposal_id)
        )

        next_versions = {proposal_id: 1 for proposal_id in proposal_ids}
        for proposal_id, max_version in result.all():
            next_versions[proposal_id] = int(max_version or 0) + 1
        return next_versions
