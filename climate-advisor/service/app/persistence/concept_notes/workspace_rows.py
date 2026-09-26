"""Bulk copy and delete helpers for one run's Concept Note workspace rows."""

from __future__ import annotations

from copy import deepcopy
from uuid import UUID

from app.models.db.cnb_edit import ConceptNoteEditApplication, ConceptNoteEditProposal
from app.models.db.cnb_workspace import (
    ConceptNoteChapter,
    ConceptNoteChapterRevision,
    ConceptNoteChapterValidation,
    ConceptNoteEvidenceLink,
    ConceptNoteExport,
    ConceptNoteGap,
    ConceptNoteGapResolution,
    ConceptNoteMatchedProject,
)
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession


async def _run_gaps(
    session: AsyncSession,
    run_id: UUID,
) -> list[ConceptNoteGap]:
    """Load every run-scoped gap copied into a duplicated workspace."""
    return list(
        (
            await session.scalars(
                select(ConceptNoteGap).where(ConceptNoteGap.run_id == run_id)
            )
        ).all()
    )


async def _run_matches(
    session: AsyncSession,
    run_id: UUID,
) -> list[ConceptNoteMatchedProject]:
    """Load selected project matches copied into a duplicated workspace."""
    return list(
        (
            await session.scalars(
                select(ConceptNoteMatchedProject).where(
                    ConceptNoteMatchedProject.run_id == run_id
                )
            )
        ).all()
    )


async def _copy_chapters(
    session: AsyncSession,
    *,
    destination_run_id: UUID,
    source_chapters: list[ConceptNoteChapter],
    revisions: dict[UUID, ConceptNoteChapterRevision],
    evidence_by_chapter: dict[UUID, list[ConceptNoteEvidenceLink]],
    gaps: list[ConceptNoteGap],
) -> tuple[dict[UUID, UUID], int]:
    """Clone active chapters, latest bodies, and evidence with new identities."""
    # Open gaps determine the destination chapter's initial review state.
    chapters_with_open_gaps = {
        gap.chapter_id
        for gap in gaps
        if gap.chapter_id is not None and gap.status in {"open", "processing"}
    }
    chapter_map: dict[UUID, UUID] = {}
    completed_chapters = 0

    # Persist each chapter before cloning rows that require its new identity.
    for source in source_chapters:
        latest = revisions.get(source.chapter_id)
        if latest is None:
            status = "empty"
        elif source.chapter_id in chapters_with_open_gaps:
            status = "needs_review"
        else:
            status = "draft"
        destination = ConceptNoteChapter(
            run_id=destination_run_id,
            template_section_id=source.template_section_id,
            description=source.description,
            title=source.title,
            position=source.position,
            status=status,
            required=source.required,
            user_locked=source.user_locked,
        )
        session.add(destination)
        await session.flush()
        chapter_map[source.chapter_id] = destination.chapter_id

        if latest is not None:
            destination_revision = ConceptNoteChapterRevision(
                chapter_id=destination.chapter_id,
                revision_number=1,
                author_type="system",
                change_type="draft",
                body_markdown=latest.body_markdown,
                patch_summary={"duplicated_from_revision_id": str(latest.revision_id)},
            )
            session.add(destination_revision)
            await session.flush()
            if source.confirmed_revision_id == latest.revision_id:
                destination.confirmed_revision_id = destination_revision.revision_id
                if status == "draft":
                    destination.status = "ready"
            completed_chapters += 1

        for evidence in evidence_by_chapter[source.chapter_id]:
            session.add(
                ConceptNoteEvidenceLink(
                    chapter_id=destination.chapter_id,
                    selected_source_label=evidence.selected_source_label,
                    source_location=evidence.source_location,
                    claim_ref=evidence.claim_ref,
                    quote_or_summary=evidence.quote_or_summary,
                )
            )

    return chapter_map, completed_chapters


async def _copy_gaps(
    session: AsyncSession,
    destination_run_id: UUID,
    gaps: list[ConceptNoteGap],
    chapter_map: dict[UUID, UUID],
) -> None:
    """Clone structured gaps and resolution events with independent identities."""
    gap_map: dict[UUID, UUID] = {}
    for gap in gaps:
        if gap.chapter_id is not None and gap.chapter_id not in chapter_map:
            continue
        destination = ConceptNoteGap(
            run_id=destination_run_id,
            chapter_id=(
                chapter_map.get(gap.chapter_id) if gap.chapter_id is not None else None
            ),
            field_key=gap.field_key,
            severity=gap.severity,
            question=gap.question,
            why_asking=gap.why_asking,
            suggestions=deepcopy(gap.suggestions),
            source_refs=list(gap.source_refs),
            status=gap.status,
            version=gap.version,
        )
        session.add(destination)
        await session.flush()
        gap_map[gap.gap_id] = destination.gap_id

    # Copy the resolution history only after all destination gap IDs exist.
    if not gap_map:
        return
    resolutions = await session.scalars(
        select(ConceptNoteGapResolution).where(
            ConceptNoteGapResolution.gap_id.in_(gap_map)
        )
    )
    for resolution in resolutions:
        session.add(
            ConceptNoteGapResolution(
                gap_id=gap_map[resolution.gap_id],
                action=resolution.action,
                answer=resolution.answer,
                actor_user_id=resolution.actor_user_id,
                source_refs=list(resolution.source_refs),
                idempotency_key=resolution.idempotency_key,
                created_at=resolution.created_at,
            )
        )


def _copy_matches(
    session: AsyncSession,
    destination_run_id: UUID,
    matches: list[ConceptNoteMatchedProject],
) -> None:
    """Clone selected project matches as independent mutable rows."""
    for match in matches:
        session.add(
            ConceptNoteMatchedProject(
                run_id=destination_run_id,
                funded_project_id=match.funded_project_id,
                decision=match.decision,
                fit_rationale=match.fit_rationale,
                matched_tags=deepcopy(match.matched_tags),
                evidence=deepcopy(match.evidence),
                caveats=deepcopy(match.caveats),
            )
        )


async def _delete_workspace_rows(session: AsyncSession, run_id: UUID) -> None:
    """Delete one run's workspace in explicit dependency order."""
    # Applications reference proposals; both retain document text after chapter deletion.
    await session.execute(
        delete(ConceptNoteEditApplication).where(
            ConceptNoteEditApplication.run_id == run_id
        )
    )
    await session.execute(
        delete(ConceptNoteEditProposal).where(ConceptNoteEditProposal.run_id == run_id)
    )
    chapter_ids = list(
        (
            await session.scalars(
                select(ConceptNoteChapter.chapter_id).where(
                    ConceptNoteChapter.run_id == run_id
                )
            )
        ).all()
    )
    if chapter_ids:
        await session.execute(
            delete(ConceptNoteChapterValidation).where(
                ConceptNoteChapterValidation.chapter_id.in_(chapter_ids)
            )
        )
        await session.execute(
            delete(ConceptNoteEvidenceLink).where(
                ConceptNoteEvidenceLink.chapter_id.in_(chapter_ids)
            )
        )
        await session.execute(
            delete(ConceptNoteChapterRevision).where(
                ConceptNoteChapterRevision.chapter_id.in_(chapter_ids)
            )
        )
    await session.execute(
        delete(ConceptNoteExport).where(ConceptNoteExport.run_id == run_id)
    )
    await session.execute(
        delete(ConceptNoteMatchedProject).where(
            ConceptNoteMatchedProject.run_id == run_id
        )
    )
    await session.execute(delete(ConceptNoteGap).where(ConceptNoteGap.run_id == run_id))
    await session.execute(
        delete(ConceptNoteChapter).where(ConceptNoteChapter.run_id == run_id)
    )
