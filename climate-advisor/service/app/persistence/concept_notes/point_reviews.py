"""Settle canonical point propagation in the same transaction as accepted edits."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.db.cnb_edit import ConceptNoteEditProposal
from app.models.db.document_workspace import (
    DocumentDependency,
    DocumentPoint,
    DocumentUpdateJob,
    DocumentWorkspaceState,
)


async def settle_point_review(
    session: AsyncSession, state: DocumentWorkspaceState, job: DocumentUpdateJob
) -> None:
    """Retain proposal/vector fences before marking reviewed dependencies current.

    Callers hold the workspace lock and this job's lock, in that order. Shared
    by normal edit acceptance and the background recovery reconciler; no remote
    reads occur inside this transaction.
    """
    if job.status != "pending_review":
        return
    proposals = [
        await session.get(ConceptNoteEditProposal, UUID(value))
        for value in job.payload.get("proposal_ids", [])
    ]
    if not proposals or any(
        proposal is None
        or proposal.status in {"rejected", "failed", "stale", "partially_applied"}
        for proposal in proposals
    ):
        job.status, job.error_code = "failed", "point_update_review_unavailable"
        state.revision += 1
        return
    if not all(proposal.status == "applied" for proposal in proposals):
        return
    points = list(
        await session.scalars(
            select(DocumentPoint).where(
                DocumentPoint.run_id == job.run_id, DocumentPoint.active.is_(True)
            )
        )
    )
    if {
        point.semantic_key: point.accepted_version
        for point in points
        if set(point.definition["chapter_refs"]).intersection(
            job.payload["chapter_refs"]
        )
    } != job.payload.get("point_versions", {}):
        job.status = "superseded"
        return
    by_id = {point.point_id: point for point in points}
    for dependency in await session.scalars(
        select(DocumentDependency).where(
            DocumentDependency.point_id.in_(by_id),
            DocumentDependency.chapter_ref.in_(job.payload["chapter_refs"]),
        )
    ):
        dependency.applied_version = by_id[dependency.point_id].accepted_version
    job.status = "complete"
    state.revision += 1


async def settle_point_reviews(
    session: AsyncSession, state: DocumentWorkspaceState
) -> None:
    """Settle terminal proposal decisions before their edit transaction commits."""
    jobs = await session.scalars(
        select(DocumentUpdateJob)
        .where(
            DocumentUpdateJob.run_id == state.run_id,
            DocumentUpdateJob.status == "pending_review",
        )
        .order_by(DocumentUpdateJob.job_id)
        .with_for_update()
    )
    for job in jobs:
        await settle_point_review(session, state, job)
