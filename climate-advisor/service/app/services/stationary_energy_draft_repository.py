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
)


class StationaryEnergyDraftRepository:
    def __init__(self, session: AsyncSession):
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
        result = await self.session.execute(
            select(StationaryEnergyDraftRun)
            .options(
                selectinload(StationaryEnergyDraftRun.source_candidates),
                selectinload(StationaryEnergyDraftRun.proposals),
                selectinload(StationaryEnergyDraftRun.review_decisions),
            )
            .where(StationaryEnergyDraftRun.draft_run_id == draft_run_id)
        )
        return result.scalar_one_or_none()

    async def get_draft_run_for_user(
        self,
        draft_run_id: UUID,
        user_id: str,
    ) -> StationaryEnergyDraftRun | None:
        draft_run = await self.get_draft_run(draft_run_id)
        if draft_run is None or draft_run.user_id != user_id:
            return None
        return draft_run

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

    async def persist_review_decisions(
        self,
        decisions: list[StationaryEnergyReviewDecision],
    ) -> list[StationaryEnergyReviewDecision]:
        self.session.add_all(decisions)
        await self.session.flush()
        return decisions

    async def get_next_review_versions(
        self,
        *,
        draft_run_id: UUID,
        proposal_ids: list[UUID],
    ) -> dict[UUID, int]:
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
