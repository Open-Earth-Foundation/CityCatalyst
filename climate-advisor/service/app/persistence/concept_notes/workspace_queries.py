"""Shared row queries for the Concept Note workspace."""

from __future__ import annotations

from uuid import UUID

from app.models.db.cnb_workspace import (
    ConceptNoteChapter,
    ConceptNoteChapterRevision,
    ConceptNoteEvidenceLink,
    ConceptNoteGap,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


async def _latest_revision(
    session: AsyncSession,
    chapter_id: UUID,
) -> ConceptNoteChapterRevision | None:
    """Load the current immutable revision for a chapter."""
    return await session.scalar(
        select(ConceptNoteChapterRevision)
        .where(ConceptNoteChapterRevision.chapter_id == chapter_id)
        .order_by(ConceptNoteChapterRevision.revision_number.desc())
        .limit(1)
    )


async def _active_chapters(
    session: AsyncSession,
    run_id: UUID,
    *,
    lock: bool = False,
) -> list[ConceptNoteChapter]:
    """Load one run's active chapters in canonical document order."""
    statement = (
        select(ConceptNoteChapter)
        .where(
            ConceptNoteChapter.run_id == run_id,
            ConceptNoteChapter.status != "deleted",
        )
        .order_by(
            ConceptNoteChapter.position.asc(),
            ConceptNoteChapter.chapter_id.asc(),
        )
    )
    if lock:
        statement = statement.with_for_update()
    return list((await session.scalars(statement)).all())


async def _latest_revisions(
    session: AsyncSession,
    chapter_ids: list[UUID],
) -> dict[UUID, ConceptNoteChapterRevision]:
    """Load the latest immutable revision for each supplied chapter."""
    if not chapter_ids:
        return {}
    revisions = list(
        (
            await session.scalars(
                select(ConceptNoteChapterRevision)
                .where(ConceptNoteChapterRevision.chapter_id.in_(chapter_ids))
                .order_by(
                    ConceptNoteChapterRevision.chapter_id.asc(),
                    ConceptNoteChapterRevision.revision_number.desc(),
                )
            )
        ).all()
    )
    latest: dict[UUID, ConceptNoteChapterRevision] = {}
    for revision in revisions:
        latest.setdefault(revision.chapter_id, revision)
    return latest


async def _gaps_by_chapter(
    session: AsyncSession,
    chapter_ids: list[UUID],
    *,
    lock: bool = False,
    only_open: bool = True,
) -> dict[UUID, list[ConceptNoteGap]]:
    """Group gaps for validation or the complete review-state presentation."""
    grouped = {chapter_id: [] for chapter_id in chapter_ids}
    if not chapter_ids:
        return grouped
    statement = (
        select(ConceptNoteGap)
        .where(
            ConceptNoteGap.chapter_id.in_(chapter_ids),
        )
        .order_by(ConceptNoteGap.created_at.asc(), ConceptNoteGap.gap_id.asc())
    )
    if only_open:
        statement = statement.where(ConceptNoteGap.status.in_(["open", "processing"]))
    if lock:
        statement = statement.with_for_update()
    gaps = list((await session.scalars(statement)).all())
    for gap in gaps:
        if gap.chapter_id is not None:
            grouped[gap.chapter_id].append(gap)
    return grouped


async def _evidence_by_chapter(
    session: AsyncSession,
    chapter_ids: list[UUID],
    *,
    lock: bool = False,
) -> dict[UUID, list[ConceptNoteEvidenceLink]]:
    """Group evidence links in stable identifier order."""
    grouped = {chapter_id: [] for chapter_id in chapter_ids}
    if not chapter_ids:
        return grouped
    statement = (
        select(ConceptNoteEvidenceLink)
        .where(ConceptNoteEvidenceLink.chapter_id.in_(chapter_ids))
        .order_by(ConceptNoteEvidenceLink.evidence_link_id.asc())
    )
    if lock:
        statement = statement.with_for_update()
    evidence_links = list((await session.scalars(statement)).all())
    for evidence in evidence_links:
        grouped[evidence.chapter_id].append(evidence)
    return grouped
