"""Detached chapter snapshots projected from the Concept Note workspace."""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
from uuid import UUID

from app.models.db.cnb_workspace import (
    ConceptNoteChapter,
    ConceptNoteChapterRevision,
    ConceptNoteChapterValidation,
    ConceptNoteEvidenceLink,
    ConceptNoteGap,
    ConceptNoteGapResolution,
)
from app.persistence.concept_notes.gaps import (
    WorkspaceGapSnapshot,
    _latest_gap_resolutions,
    _snapshot_gap,
)
from app.persistence.concept_notes.workspace_queries import (
    _active_chapters,
    _evidence_by_chapter,
    _gaps_by_chapter,
    _latest_revisions,
)
from app.persistence.concept_notes.workspace_validation import (
    WorkspaceValidationChapter,
    WorkspaceValidationSnapshot,
    _validation_chapters,
    _validation_evidence,
    _validation_gaps,
    calculate_validation_input_fingerprint,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass(frozen=True)
class WorkspaceChapterSnapshot:
    """Detached chapter metadata plus its current immutable revision."""

    chapter_id: UUID
    chapter_ref: str | None
    title: str
    position: int
    status: str
    required: bool
    user_locked: bool
    body_markdown: str | None
    description: str | None = None
    gaps: list[WorkspaceGapSnapshot] = field(default_factory=list)
    revision_id: UUID | None = None
    revision_number: int | None = None
    confirmed_body_markdown: str | None = None
    confirmed_revision_number: int | None = None
    # Retained for consumers introduced on develop while structured gap
    # snapshots remain the canonical CC-730/CC-732 representation.
    missing_information: list[str] = field(default_factory=list)
    validation: WorkspaceValidationSnapshot | None = None


async def _snapshot_chapters(
    session: AsyncSession,
    run_id: UUID,
    *,
    template_fingerprint: str | None = None,
) -> list[WorkspaceChapterSnapshot]:
    """Project active chapters with latest validations and derived staleness."""
    # Fetch all current inputs once because draft state is polled frequently.
    chapters = await _active_chapters(session, run_id)
    if not chapters:
        return []
    chapter_ids = [chapter.chapter_id for chapter in chapters]
    revisions = await _latest_revisions(session, chapter_ids)
    gaps = await _gaps_by_chapter(session, chapter_ids, only_open=False)
    gap_resolutions = await _latest_gap_resolutions(
        session, [gap.gap_id for chapter_gaps in gaps.values() for gap in chapter_gaps]
    )
    evidence = await _evidence_by_chapter(session, chapter_ids)
    validations = {
        validation.chapter_id: validation
        for validation in (
            await session.scalars(
                select(ConceptNoteChapterValidation).where(
                    ConceptNoteChapterValidation.chapter_id.in_(chapter_ids)
                )
            )
        ).all()
    }
    validation_chapters = _validation_chapters(chapters, revisions)
    revision_history = await _snapshot_revision_history(
        session,
        chapters,
        validations,
        revisions,
    )
    validated_revision_numbers = {
        revision_id: revision.revision_number
        for revision_id, revision in revision_history.items()
    }

    # Compute every target's freshness against the same document snapshot.
    return [
        _chapter_snapshot(
            chapter=chapter,
            detached=detached,
            validation_chapters=validation_chapters,
            gaps=gaps[chapter.chapter_id],
            gap_resolutions=gap_resolutions,
            confirmed=revision_history.get(chapter.confirmed_revision_id),
            evidence=evidence[chapter.chapter_id],
            stored_validation=validations.get(chapter.chapter_id),
            validated_revision_numbers=validated_revision_numbers,
            template_fingerprint=template_fingerprint,
        )
        for chapter, detached in zip(chapters, validation_chapters, strict=True)
    ]


async def _snapshot_revision_history(
    session: AsyncSession,
    chapters: list[ConceptNoteChapter],
    validations: dict[UUID, ConceptNoteChapterValidation],
    current_revisions: dict[UUID, ConceptNoteChapterRevision],
) -> dict[UUID, ConceptNoteChapterRevision]:
    """Batch-load revisions referenced by validations and exact confirmations."""
    revision_history = {
        revision.revision_id: revision for revision in current_revisions.values()
    }
    historical_ids = {
        validation.validated_revision_id
        for validation in validations.values()
        if validation.validated_revision_id is not None
        and validation.validated_revision_id not in revision_history
    }
    historical_ids.update(
        chapter.confirmed_revision_id
        for chapter in chapters
        if chapter.confirmed_revision_id is not None
        and chapter.confirmed_revision_id not in revision_history
    )
    if historical_ids:
        historical_revisions = (
            await session.scalars(
                select(ConceptNoteChapterRevision).where(
                    ConceptNoteChapterRevision.revision_id.in_(historical_ids)
                )
            )
        ).all()
        revision_history.update(
            (revision.revision_id, revision) for revision in historical_revisions
        )
    return revision_history


def _chapter_snapshot(
    *,
    chapter: ConceptNoteChapter,
    detached: WorkspaceValidationChapter,
    validation_chapters: list[WorkspaceValidationChapter],
    gaps: list[ConceptNoteGap],
    gap_resolutions: dict[UUID, ConceptNoteGapResolution],
    confirmed: ConceptNoteChapterRevision | None,
    evidence: list[ConceptNoteEvidenceLink],
    stored_validation: ConceptNoteChapterValidation | None,
    validated_revision_numbers: dict[UUID, int],
    template_fingerprint: str | None,
) -> WorkspaceChapterSnapshot:
    """Project one chapter and derive validation freshness and display status."""
    # Compare the stored validation with the chapter's complete current input.
    current_fingerprint = calculate_validation_input_fingerprint(
        chapters=validation_chapters,
        target_chapter_id=chapter.chapter_id,
        open_gaps=_validation_gaps(
            [gap for gap in gaps if gap.status in {"open", "processing"}]
        ),
        evidence_links=_validation_evidence(evidence),
        template_fingerprint=template_fingerprint,
    )
    validation_snapshot = None
    if stored_validation is not None:
        validation_snapshot = WorkspaceValidationSnapshot(
            validation_id=stored_validation.validation_id,
            status=stored_validation.status,
            is_stale=(
                stored_validation.validation_input_fingerprint != current_fingerprint
            ),
            validated_revision_id=stored_validation.validated_revision_id,
            validated_revision_number=validated_revision_numbers.get(
                stored_validation.validated_revision_id
            ),
            validation_input_fingerprint=stored_validation.validation_input_fingerprint,
            validated_at=stored_validation.validated_at,
            findings=deepcopy(stored_validation.findings),
        )

    # A stale ready result must return to review without deleting its details.
    effective_status = chapter.status
    if (
        validation_snapshot is not None
        and validation_snapshot.is_stale
        and effective_status == "ready"
    ):
        effective_status = "needs_review"
    return WorkspaceChapterSnapshot(
        chapter_id=chapter.chapter_id,
        chapter_ref=chapter.template_section_id,
        title=chapter.title,
        position=chapter.position,
        status=effective_status,
        description=chapter.description,
        required=chapter.required,
        user_locked=chapter.user_locked,
        body_markdown=detached.body_markdown,
        missing_information=[
            gap.question for gap in gaps if gap.status in {"open", "processing"}
        ],
        gaps=[
            _snapshot_gap(
                gap, gap_resolutions.get(gap.gap_id), chapter_title=chapter.title
            )
            for gap in gaps
        ],
        confirmed_body_markdown=(confirmed.body_markdown if confirmed else None),
        confirmed_revision_number=(confirmed.revision_number if confirmed else None),
        revision_number=detached.revision_number,
        revision_id=detached.revision_id,
        validation=validation_snapshot,
    )
