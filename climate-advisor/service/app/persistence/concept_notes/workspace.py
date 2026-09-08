"""Persistence for the chapter-by-chapter Concept Note workspace."""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from app.models.cnb.concept_note_draft import (
    ConceptNoteDraftGapOutput,
)
from app.models.db.cnb_edit import ConceptNoteEditApplication, ConceptNoteEditProposal
from app.models.db.cnb_workspace import (
    ConceptNoteChapter,
    ConceptNoteChapterReview,
    ConceptNoteChapterRevision,
    ConceptNoteEvidenceLink,
    ConceptNoteExport,
    ConceptNoteGap,
    ConceptNoteGapResolution,
    ConceptNoteMatchedProject,
)
from app.utils.cnb_information_markers import (
    information_marker_key,
    information_needed_markers,
)
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

LEGACY_GENERIC_GAP_RATIONALE = "This information is required to complete the chapter."


class WorkspaceConflictError(Exception):
    """Raised when a versioned workspace mutation is no longer valid."""


@dataclass(frozen=True)
class WorkspaceTemplateChapter:
    """One normalized template chapter used to seed a run workspace."""

    chapter_ref: str
    description: str | None
    required: bool
    title: str


@dataclass(frozen=True)
class WorkspaceGapResolutionSnapshot:
    """Detached latest resolution event for one gap."""

    resolution_id: UUID
    action: str
    answer: str | None
    actor_user_id: str
    source_refs: list[str]
    created_at: datetime


@dataclass(frozen=True)
class WorkspaceGapSnapshot:
    """Detached structured gap with its latest resolution event."""

    gap_id: UUID
    field_key: str
    question: str
    why_asking: str
    severity: str
    state: str
    suggestions: list[dict[str, Any]]
    source_refs: list[str]
    version: int
    resolution: WorkspaceGapResolutionSnapshot | None
    created_at: datetime
    updated_at: datetime


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
    gaps: list[WorkspaceGapSnapshot] = field(default_factory=list)
    revision_id: UUID | None = None
    revision_number: int | None = None
    confirmed_body_markdown: str | None = None
    confirmed_revision_number: int | None = None
    # Retained for consumers introduced on develop while structured gap
    # snapshots remain the canonical CC-730/CC-732 representation.
    missing_information: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class WorkspaceCopyResult:
    """Counts needed to publish a duplicated run's draft progress."""

    completed_chapters: int
    total_chapters: int


class ConceptNoteWorkspaceRepository:
    """Read and write chapters in the managed CNB database."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        self._session_factory = session_factory

    async def ensure_template_chapters(
        self,
        *,
        run_id: UUID,
        chapters: list[WorkspaceTemplateChapter],
    ) -> None:
        """Materialize the reviewed template order once for a run."""
        async with self._session_factory() as session, session.begin():
            existing = await session.scalar(
                select(ConceptNoteChapter.chapter_id)
                .where(
                    ConceptNoteChapter.run_id == run_id,
                    ConceptNoteChapter.status != "deleted",
                )
                .limit(1)
            )
            if existing is not None:
                return

            for position, chapter in enumerate(chapters):
                session.add(
                    ConceptNoteChapter(
                        run_id=run_id,
                        template_section_id=chapter.chapter_ref,
                        title=chapter.title,
                        position=position,
                        status="empty",
                        required=chapter.required,
                    )
                )

    async def save_generated_chapter(
        self,
        *,
        chapter_id: UUID,
        body_markdown: str,
        missing_information: list[ConceptNoteDraftGapOutput],
    ) -> bool:
        """Persist the first agent revision unless the chapter is already drafted."""
        async with self._session_factory() as session, session.begin():
            chapter = await _require_chapter(session, chapter_id, lock=True)
            latest = await _latest_revision(session, chapter.chapter_id)
            if latest is not None:
                return False

            # Never persist a draft whose visible unknowns disagree with its gap records.
            marker_keys = {
                information_marker_key(marker)
                for marker in information_needed_markers(body_markdown)
            }
            gap_keys = {
                information_marker_key(gap.question) for gap in missing_information
            }
            if marker_keys != gap_keys:
                raise WorkspaceConflictError(
                    "Missing-information markers must match the generated gaps"
                )

            # Persist the immutable draft and its initial structured gaps.
            session.add(
                ConceptNoteChapterRevision(
                    chapter_id=chapter_id,
                    revision_number=1,
                    author_type="agent",
                    change_type="draft",
                    body_markdown=body_markdown,
                    patch_summary={
                        "gap_field_keys": [
                            item.field_key for item in missing_information
                        ]
                    },
                )
            )
            for item in missing_information:
                session.add(_gap_from_output(chapter, item))
            chapter.status = "needs_review" if missing_information else "draft"
            chapter.updated_at = datetime.now(UTC)
            return True

    async def list_chapters(
        self,
        *,
        run_id: UUID,
    ) -> list[WorkspaceChapterSnapshot]:
        """Return active chapters in document order with latest Markdown."""
        async with self._session_factory() as session:
            chapters = list(
                (
                    await session.scalars(
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
                ).all()
            )
            if not chapters:
                return []
            chapter_ids = [chapter.chapter_id for chapter in chapters]
            # Rank per chapter; confirmed revisions may precede the current revision.
            ranked = (
                select(
                    ConceptNoteChapterRevision.revision_id,
                    func.row_number()
                    .over(
                        partition_by=ConceptNoteChapterRevision.chapter_id,
                        order_by=ConceptNoteChapterRevision.revision_number.desc(),
                    )
                    .label("rank"),
                )
                .where(ConceptNoteChapterRevision.chapter_id.in_(chapter_ids))
                .subquery()
            )
            revisions = list(
                await session.scalars(
                    select(ConceptNoteChapterRevision).where(
                        or_(
                            ConceptNoteChapterRevision.revision_id.in_(
                                select(ranked.c.revision_id).where(ranked.c.rank == 1)
                            ),
                            ConceptNoteChapterRevision.revision_id.in_(
                                [
                                    c.confirmed_revision_id
                                    for c in chapters
                                    if c.confirmed_revision_id
                                ]
                            ),
                        )
                    )
                )
            )
            by_id = {revision.revision_id: revision for revision in revisions}
            latest = {}
            for revision in revisions:
                current = latest.get(revision.chapter_id)
                if (
                    current is None
                    or revision.revision_number > current.revision_number
                ):
                    latest[revision.chapter_id] = revision
            gaps = list(
                await session.scalars(
                    select(ConceptNoteGap)
                    .where(ConceptNoteGap.chapter_id.in_(chapter_ids))
                    .order_by(ConceptNoteGap.created_at, ConceptNoteGap.gap_id)
                )
            )
            resolved = (
                select(
                    ConceptNoteGapResolution.resolution_id,
                    func.row_number()
                    .over(
                        partition_by=ConceptNoteGapResolution.gap_id,
                        order_by=(
                            ConceptNoteGapResolution.created_at.desc(),
                            ConceptNoteGapResolution.resolution_id.desc(),
                        ),
                    )
                    .label("rank"),
                )
                .where(
                    ConceptNoteGapResolution.gap_id.in_([gap.gap_id for gap in gaps])
                )
                .subquery()
            )
            resolutions = (
                {
                    r.gap_id: r
                    for r in await session.scalars(
                        select(ConceptNoteGapResolution).where(
                            ConceptNoteGapResolution.resolution_id.in_(
                                select(resolved.c.resolution_id).where(
                                    resolved.c.rank == 1
                                )
                            )
                        )
                    )
                }
                if gaps
                else {}
            )
            by_chapter: dict[UUID, list[ConceptNoteGap]] = {}
            for gap in gaps:
                by_chapter.setdefault(gap.chapter_id, []).append(gap)
            return [
                _snapshot_chapter(
                    chapter,
                    latest.get(chapter.chapter_id),
                    by_id.get(chapter.confirmed_revision_id),
                    [
                        _snapshot_gap(
                            gap,
                            resolutions.get(gap.gap_id),
                            chapter_title=chapter.title,
                        )
                        for gap in by_chapter.get(chapter.chapter_id, [])
                    ],
                )
                for chapter in chapters
            ]

    async def copy_working_copy(
        self,
        *,
        source_run_id: UUID,
        destination_run_id: UUID,
    ) -> WorkspaceCopyResult:
        """Replace a destination with an independent current-state copy."""
        async with self._session_factory() as session, session.begin():
            # Make retries deterministic without carrying proposals or history.
            await _delete_workspace_rows(session, destination_run_id)
            source_chapters = list(
                (
                    await session.scalars(
                        select(ConceptNoteChapter)
                        .where(
                            ConceptNoteChapter.run_id == source_run_id,
                            ConceptNoteChapter.status != "deleted",
                        )
                        .order_by(
                            ConceptNoteChapter.position.asc(),
                            ConceptNoteChapter.chapter_id.asc(),
                        )
                    )
                ).all()
            )
            chapter_map: dict[UUID, UUID] = {}
            completed_chapters = 0

            # Copy each latest body as revision one and preserve confirmation safely.
            for source_chapter in source_chapters:
                destination_chapter = ConceptNoteChapter(
                    run_id=destination_run_id,
                    template_section_id=source_chapter.template_section_id,
                    title=source_chapter.title,
                    position=source_chapter.position,
                    status=source_chapter.status,
                    required=source_chapter.required,
                    user_locked=source_chapter.user_locked,
                )
                session.add(destination_chapter)
                await session.flush()
                chapter_map[source_chapter.chapter_id] = destination_chapter.chapter_id

                latest = await _latest_revision(session, source_chapter.chapter_id)
                if latest is not None:
                    destination_revision = ConceptNoteChapterRevision(
                        chapter_id=destination_chapter.chapter_id,
                        revision_number=1,
                        author_type="system",
                        change_type="draft",
                        body_markdown=latest.body_markdown,
                        patch_summary={
                            "duplicated_from_revision_id": str(latest.revision_id)
                        },
                    )
                    session.add(destination_revision)
                    await session.flush()
                    if source_chapter.confirmed_revision_id == latest.revision_id:
                        destination_chapter.confirmed_revision_id = (
                            destination_revision.revision_id
                        )
                    completed_chapters += 1

                evidence_links = list(
                    (
                        await session.scalars(
                            select(ConceptNoteEvidenceLink).where(
                                ConceptNoteEvidenceLink.chapter_id
                                == source_chapter.chapter_id
                            )
                        )
                    ).all()
                )
                for evidence in evidence_links:
                    session.add(
                        ConceptNoteEvidenceLink(
                            chapter_id=destination_chapter.chapter_id,
                            selected_source_label=evidence.selected_source_label,
                            source_location=evidence.source_location,
                            claim_ref=evidence.claim_ref,
                            quote_or_summary=evidence.quote_or_summary,
                        )
                    )

            # Copy structured gaps and their append-only resolution history.
            gaps = list(
                (
                    await session.scalars(
                        select(ConceptNoteGap).where(
                            ConceptNoteGap.run_id == source_run_id
                        )
                    )
                ).all()
            )
            for gap in gaps:
                if gap.chapter_id is not None and gap.chapter_id not in chapter_map:
                    continue
                destination_gap = ConceptNoteGap(
                    run_id=destination_run_id,
                    chapter_id=(
                        chapter_map.get(gap.chapter_id)
                        if gap.chapter_id is not None
                        else None
                    ),
                    field_key=gap.field_key,
                    severity=gap.severity,
                    question=gap.question,
                    why_asking=gap.why_asking,
                    suggestions=deepcopy(gap.suggestions),
                    source_refs=deepcopy(gap.source_refs),
                    status=gap.status,
                    version=gap.version,
                    created_at=gap.created_at,
                    updated_at=gap.updated_at,
                )
                session.add(destination_gap)
                await session.flush()
                resolutions = list(
                    (
                        await session.scalars(
                            select(ConceptNoteGapResolution)
                            .where(ConceptNoteGapResolution.gap_id == gap.gap_id)
                            .order_by(ConceptNoteGapResolution.created_at.asc())
                        )
                    ).all()
                )
                for resolution in resolutions:
                    session.add(
                        ConceptNoteGapResolution(
                            gap_id=destination_gap.gap_id,
                            action=resolution.action,
                            answer=resolution.answer,
                            actor_user_id=resolution.actor_user_id,
                            source_refs=deepcopy(resolution.source_refs),
                            idempotency_key=resolution.idempotency_key,
                            created_at=resolution.created_at,
                        )
                    )

            # Project matches are independent mutable rows for the new run.
            matches = list(
                (
                    await session.scalars(
                        select(ConceptNoteMatchedProject).where(
                            ConceptNoteMatchedProject.run_id == source_run_id
                        )
                    )
                ).all()
            )
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

            return WorkspaceCopyResult(
                completed_chapters=completed_chapters,
                total_chapters=len(source_chapters),
            )

    async def delete_run(self, *, run_id: UUID) -> None:
        """Delete every managed workspace row owned by one CA run."""
        async with self._session_factory() as session, session.begin():
            await _delete_workspace_rows(session, run_id)

    async def confirm_chapter(
        self,
        *,
        run_id: UUID,
        chapter_id: UUID,
        expected_revision: int,
        idempotency_key: UUID,
        user_id: str,
    ) -> None:
        """Confirm one exact gap-free revision and append its review record."""
        async with self._session_factory() as session, session.begin():
            chapter = await _require_chapter(session, chapter_id, lock=True)
            if chapter.run_id != run_id:
                raise WorkspaceConflictError("Concept Note chapter is unavailable")
            existing = await session.scalar(
                select(ConceptNoteChapterReview).where(
                    ConceptNoteChapterReview.chapter_id == chapter_id,
                    ConceptNoteChapterReview.idempotency_key == idempotency_key,
                )
            )
            if existing is not None:
                confirmed = await session.get(
                    ConceptNoteChapterRevision,
                    existing.revision_id,
                )
                if (
                    existing.user_id != user_id
                    or confirmed is None
                    or confirmed.revision_number != expected_revision
                ):
                    raise WorkspaceConflictError(
                        "Concept Note idempotency key was reused with different input"
                    )
                return

            # Confirm only the currently visible, successfully generated revision.
            latest = await _latest_revision(session, chapter_id)
            if latest is None or latest.revision_number != expected_revision:
                raise WorkspaceConflictError("Concept Note chapter revision is stale")
            if await _has_blocking_gaps(session, chapter_id):
                raise WorkspaceConflictError("Open gaps must be resolved before review")
            if information_needed_markers(latest.body_markdown):
                raise WorkspaceConflictError(
                    "Missing-information markers must be resolved before review"
                )

            session.add(
                ConceptNoteChapterReview(
                    chapter_id=chapter_id,
                    revision_id=latest.revision_id,
                    user_id=user_id,
                    idempotency_key=idempotency_key,
                )
            )
            chapter.confirmed_revision_id = latest.revision_id
            chapter.status = "ready"
            chapter.updated_at = datetime.now(UTC)


async def _require_chapter(
    session: AsyncSession,
    chapter_id: UUID,
    *,
    lock: bool,
) -> ConceptNoteChapter:
    """Load one active chapter or raise a stable workspace conflict."""
    chapter = await session.get(ConceptNoteChapter, chapter_id, with_for_update=lock)
    if chapter is None or chapter.status == "deleted":
        raise WorkspaceConflictError(f"Concept Note chapter {chapter_id} was not found")
    return chapter


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


def _snapshot_chapter(
    chapter: ConceptNoteChapter,
    latest: ConceptNoteChapterRevision | None,
    confirmed: ConceptNoteChapterRevision | None,
    gap_snapshots: list[WorkspaceGapSnapshot],
) -> WorkspaceChapterSnapshot:
    """Detach a chapter from its batch-loaded current and confirmed revisions."""
    confirmed_number = confirmed.revision_number if confirmed is not None else None
    return WorkspaceChapterSnapshot(
        chapter_id=chapter.chapter_id,
        chapter_ref=chapter.template_section_id,
        title=chapter.title,
        position=chapter.position,
        status=chapter.status,
        required=chapter.required,
        user_locked=chapter.user_locked,
        body_markdown=latest.body_markdown if latest is not None else None,
        gaps=gap_snapshots,
        revision_id=latest.revision_id if latest is not None else None,
        revision_number=latest.revision_number if latest is not None else None,
        confirmed_body_markdown=(
            confirmed.body_markdown if confirmed is not None else None
        ),
        confirmed_revision_number=confirmed_number,
        missing_information=[
            gap.question for gap in gap_snapshots if gap.state == "open"
        ],
    )


def _snapshot_gap(
    gap: ConceptNoteGap,
    resolution: ConceptNoteGapResolution | None,
    *,
    chapter_title: str,
) -> WorkspaceGapSnapshot:
    """Detach one gap and its latest resolution."""
    resolution_snapshot = (
        WorkspaceGapResolutionSnapshot(
            resolution_id=resolution.resolution_id,
            action=resolution.action,
            answer=resolution.answer,
            actor_user_id=resolution.actor_user_id,
            source_refs=list(resolution.source_refs or []),
            created_at=resolution.created_at,
        )
        if resolution is not None
        else None
    )
    return WorkspaceGapSnapshot(
        gap_id=gap.gap_id,
        field_key=gap.field_key,
        question=gap.question,
        why_asking=_specific_gap_rationale(
            question=gap.question,
            rationale=gap.why_asking,
            chapter_title=chapter_title,
        ),
        severity=gap.severity,
        state=gap.status,
        suggestions=list(gap.suggestions or []),
        source_refs=list(gap.source_refs or []),
        version=gap.version,
        resolution=resolution_snapshot,
        created_at=gap.created_at,
        updated_at=gap.updated_at,
    )


def _specific_gap_rationale(
    *,
    question: str,
    rationale: str,
    chapter_title: str,
) -> str:
    """Replace the legacy migration sentinel with a gap-specific rationale."""
    if rationale.strip() != LEGACY_GENERIC_GAP_RATIONALE:
        return rationale
    missing_fact = question.strip().rstrip(".")
    return (
        "The available context does not provide grounded evidence for "
        f"“{missing_fact}”. Confirm it so Clima can update the {chapter_title} "
        "chapter without inventing this detail."
    )


def _gap_from_output(
    chapter: ConceptNoteChapter,
    output: ConceptNoteDraftGapOutput,
) -> ConceptNoteGap:
    """Create a persisted structured gap from validated model output."""
    suggestions = [item.model_dump(mode="json") for item in output.suggestions]
    return ConceptNoteGap(
        run_id=chapter.run_id,
        chapter_id=chapter.chapter_id,
        field_key=output.field_key,
        severity=output.severity,
        question=output.question,
        why_asking=output.why_asking,
        suggestions=suggestions,
        source_refs=_suggestion_source_refs(suggestions),
        status="open",
    )


async def _has_blocking_gaps(session: AsyncSession, chapter_id: UUID) -> bool:
    """Return whether the chapter still has an unresolved or processing gap."""
    return (
        await session.scalar(
            select(ConceptNoteGap.gap_id)
            .where(
                ConceptNoteGap.chapter_id == chapter_id,
                ConceptNoteGap.status.in_(("open", "processing")),
            )
            .limit(1)
        )
        is not None
    )


def _suggestion_source_refs(suggestions: list[dict[str, Any]]) -> list[str]:
    """Flatten unique suggestion citations in stable display order."""
    refs: list[str] = []
    for suggestion in suggestions:
        for value in suggestion.get("source_refs", []):
            ref = str(value).strip()
            if ref and ref not in refs:
                refs.append(ref)
    return refs


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


def normalize_template_chapters(
    chapter_schema: list[dict[str, Any]],
) -> list[WorkspaceTemplateChapter]:
    """Coerce reviewed template JSON into deterministic workspace rows."""
    normalized: list[WorkspaceTemplateChapter] = []
    seen_refs: set[str] = set()
    for index, chapter in enumerate(chapter_schema):
        title = str(chapter.get("title") or "").strip() or f"Chapter {index + 1}"
        chapter_ref = (
            str(chapter.get("chapter_ref") or "").strip() or f"chapter-{index + 1}"
        )
        if chapter_ref in seen_refs:
            raise ValueError(f"Duplicate template chapter_ref: {chapter_ref}")
        seen_refs.add(chapter_ref)
        normalized.append(
            WorkspaceTemplateChapter(
                chapter_ref=chapter_ref,
                description=_normalize_optional_text(chapter.get("description")),
                required=chapter.get("required") is True,
                title=title,
            )
        )
    return normalized


def _normalize_optional_text(value: Any) -> str | None:
    """Return stripped optional text without placeholder empty strings."""
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None
