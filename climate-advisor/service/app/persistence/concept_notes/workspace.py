"""Persistence for the chapter-by-chapter Concept Note workspace."""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from app.models.cnb.concept_note_draft import (
    ConceptNoteChapterDraftOutput,
    ConceptNoteDraftGapOutput,
)
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
from sqlalchemy import delete, select
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
    proposed_revision_number: int | None = None
    regeneration_status: str = "idle"
    regeneration_error: str | None = None
    # Retained for consumers introduced on develop while structured gap
    # snapshots remain the canonical CC-730/CC-732 representation.
    missing_information: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class GapResolutionStart:
    """Result of atomically accepting one idempotent gap mutation."""

    chapter_id: UUID
    resolution_id: UUID
    should_regenerate: bool


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
            return [await _snapshot_chapter(session, chapter) for chapter in chapters]

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
                    regeneration_status="idle",
                    regeneration_error=None,
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

    async def prepare_gap_resolution(
        self,
        *,
        run_id: UUID,
        gap_id: UUID,
        action: str,
        answer: str | None,
        expected_version: int,
        idempotency_key: UUID,
        user_id: str,
    ) -> GapResolutionStart:
        """Accept one versioned gap action and mark its chapter for regeneration."""
        async with self._session_factory() as session, session.begin():
            gap = await session.get(ConceptNoteGap, gap_id, with_for_update=True)
            if gap is None or gap.run_id != run_id or gap.chapter_id is None:
                raise WorkspaceConflictError("Concept Note gap is unavailable")
            chapter = await _require_chapter(session, gap.chapter_id, lock=True)

            # Return a replay without creating another event or worker.
            existing = await session.scalar(
                select(ConceptNoteGapResolution).where(
                    ConceptNoteGapResolution.gap_id == gap_id,
                    ConceptNoteGapResolution.idempotency_key == idempotency_key,
                )
            )
            if existing is not None:
                if (
                    existing.action != action
                    or existing.answer != answer
                    or existing.actor_user_id != user_id
                ):
                    raise WorkspaceConflictError(
                        "Concept Note idempotency key was reused with different input"
                    )
                return GapResolutionStart(
                    chapter_id=chapter.chapter_id,
                    resolution_id=existing.resolution_id,
                    should_regenerate=False,
                )

            # Enforce optimistic concurrency and the critical-caveat rule.
            if gap.version != expected_version:
                raise WorkspaceConflictError("Concept Note gap version is stale")
            if chapter.regeneration_status == "processing":
                raise WorkspaceConflictError(
                    "Another gap resolution is already being processed"
                )
            if action == "defer_as_caveat" and gap.severity == "critical":
                raise WorkspaceConflictError("Critical gaps cannot be deferred")
            if action == "correction" and gap.status not in {
                "resolved",
                "dismissed",
                "caveat",
                "processing",
            }:
                raise WorkspaceConflictError(
                    "Only a previous resolution can be corrected"
                )

            resolution = ConceptNoteGapResolution(
                gap_id=gap.gap_id,
                action=action,
                answer=answer,
                actor_user_id=user_id,
                source_refs=_source_refs_for_answer(gap, answer),
                idempotency_key=idempotency_key,
            )
            session.add(resolution)
            await session.flush()
            gap.status = "processing"
            gap.version += 1
            gap.updated_at = datetime.now(UTC)
            chapter.status = "needs_review"
            chapter.regeneration_status = "processing"
            chapter.regeneration_error = None
            chapter.updated_at = datetime.now(UTC)
            return GapResolutionStart(
                chapter_id=chapter.chapter_id,
                resolution_id=resolution.resolution_id,
                should_regenerate=True,
            )

    async def complete_gap_regeneration(
        self,
        *,
        chapter_id: UUID,
        gap_id: UUID,
        resolution_id: UUID,
        generated: ConceptNoteChapterDraftOutput,
    ) -> bool:
        """Commit a regenerated revision if the initiating resolution is current."""
        async with self._session_factory() as session, session.begin():
            chapter = await _require_chapter(session, chapter_id, lock=True)
            gap = await session.get(ConceptNoteGap, gap_id, with_for_update=True)
            latest_resolution = await _latest_resolution(session, gap_id)
            if (
                gap is None
                or latest_resolution is None
                or latest_resolution.resolution_id != resolution_id
            ):
                return False

            # Append the regenerated chapter without mutating prior revisions.
            latest_revision = await _latest_revision(session, chapter_id)
            next_revision = (
                latest_revision.revision_number if latest_revision else 0
            ) + 1
            session.add(
                ConceptNoteChapterRevision(
                    chapter_id=chapter_id,
                    revision_number=next_revision,
                    author_type="agent",
                    change_type="rewrite",
                    body_markdown=generated.body_markdown,
                    patch_summary={
                        "resolved_gap_id": str(gap_id),
                        "resolution_id": str(resolution_id),
                    },
                )
            )

            # Apply the accepted disposition and merge newly discovered gaps.
            gap.status = _state_for_resolution(latest_resolution.action)
            gap.updated_at = datetime.now(UTC)
            await _merge_generated_gaps(
                session,
                chapter,
                generated.missing_information,
                protected_gap_id=gap_id,
            )
            chapter.status = (
                "needs_review"
                if await _has_blocking_gaps(session, chapter_id)
                else "draft"
            )
            chapter.regeneration_status = "idle"
            chapter.regeneration_error = None
            chapter.updated_at = datetime.now(UTC)
            return True

    async def fail_gap_regeneration(
        self,
        *,
        chapter_id: UUID,
        gap_id: UUID,
        resolution_id: UUID,
    ) -> None:
        """Expose a retryable failure without discarding the accepted resolution."""
        async with self._session_factory() as session, session.begin():
            chapter = await _require_chapter(session, chapter_id, lock=True)
            latest_resolution = await _latest_resolution(session, gap_id)
            if (
                latest_resolution is None
                or latest_resolution.resolution_id != resolution_id
            ):
                return
            chapter.status = "needs_review"
            chapter.regeneration_status = "failed"
            chapter.regeneration_error = "chapter_regeneration_failed"
            chapter.updated_at = datetime.now(UTC)

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
            if chapter.regeneration_status != "idle":
                raise WorkspaceConflictError("Chapter regeneration is not complete")
            if await _has_blocking_gaps(session, chapter_id):
                raise WorkspaceConflictError("Open gaps must be resolved before review")

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

    async def save_revalidated_chapter(
        self,
        *,
        chapter_id: UUID,
        expected_revision_number: int,
        generated: ConceptNoteChapterDraftOutput,
        source_refs: list[str],
    ) -> bool:
        """Persist a source-driven proposal while preserving confirmed content."""
        async with self._session_factory() as session, session.begin():
            chapter = await _require_chapter(session, chapter_id, lock=True)
            latest = await _latest_revision(session, chapter_id)
            if latest is None:
                return False
            if (
                latest.revision_number != expected_revision_number
                or chapter.regeneration_status == "processing"
            ):
                return False

            # Reconcile evidence-filled and newly reopened gaps before status choice.
            gaps_changed = await _reconcile_evidence_gaps(
                session,
                chapter,
                generated.missing_information,
                source_refs,
            )
            body_changed = (
                latest.body_markdown.strip() != generated.body_markdown.strip()
            )
            if not body_changed and not gaps_changed:
                return False

            session.add(
                ConceptNoteChapterRevision(
                    chapter_id=chapter_id,
                    revision_number=latest.revision_number + 1,
                    author_type="agent",
                    change_type="rewrite",
                    body_markdown=generated.body_markdown,
                    patch_summary={
                        "source_revalidation": True,
                        "source_refs": source_refs,
                        "confirmed_revision_id": (
                            str(chapter.confirmed_revision_id)
                            if chapter.confirmed_revision_id
                            else None
                        ),
                    },
                )
            )
            chapter.status = (
                "needs_review"
                if await _has_blocking_gaps(session, chapter_id)
                else "draft"
            )
            chapter.regeneration_status = "idle"
            chapter.regeneration_error = None
            chapter.updated_at = datetime.now(UTC)
            return True

    async def begin_gap_impact_regeneration(
        self,
        *,
        chapter_id: UUID,
        expected_revision_number: int,
    ) -> bool:
        """Mark one reviewer-selected chapter as regenerating if still current."""
        async with self._session_factory() as session, session.begin():
            chapter = await _require_chapter(session, chapter_id, lock=True)
            latest = await _latest_revision(session, chapter_id)
            if (
                latest is None
                or latest.revision_number != expected_revision_number
                or chapter.regeneration_status == "processing"
            ):
                return False
            chapter.regeneration_status = "processing"
            chapter.regeneration_error = None
            chapter.updated_at = datetime.now(UTC)
            return True

    async def save_gap_impact_regeneration(
        self,
        *,
        chapter_id: UUID,
        expected_revision_number: int,
        generated: ConceptNoteChapterDraftOutput,
        source_gap_id: UUID,
        source_resolution_id: UUID,
        actor_user_id: str,
        answer: str,
        source_refs: list[str],
    ) -> bool:
        """Append a reviewer-selected rewrite with the user's answer provenance."""
        async with self._session_factory() as session, session.begin():
            chapter = await _require_chapter(session, chapter_id, lock=True)
            latest = await _latest_revision(session, chapter_id)
            if (
                latest is None
                or latest.revision_number != expected_revision_number
                or chapter.regeneration_status != "processing"
            ):
                return False

            gaps_changed = await _reconcile_generated_gaps(
                session,
                chapter,
                generated.missing_information,
                close_action="answer",
                close_answer=answer,
                close_actor_user_id=actor_user_id,
                source_refs=source_refs,
            )
            body_changed = (
                latest.body_markdown.strip() != generated.body_markdown.strip()
            )
            if not body_changed and not gaps_changed:
                chapter.regeneration_status = "idle"
                chapter.regeneration_error = None
                chapter.updated_at = datetime.now(UTC)
                return False

            session.add(
                ConceptNoteChapterRevision(
                    chapter_id=chapter_id,
                    revision_number=latest.revision_number + 1,
                    author_type="agent",
                    change_type="rewrite",
                    body_markdown=generated.body_markdown,
                    patch_summary={
                        "gap_impact_review": True,
                        "source_gap_id": str(source_gap_id),
                        "source_resolution_id": str(source_resolution_id),
                        "confirmed_revision_id": (
                            str(chapter.confirmed_revision_id)
                            if chapter.confirmed_revision_id
                            else None
                        ),
                    },
                )
            )
            chapter.status = (
                "needs_review"
                if await _has_blocking_gaps(session, chapter_id)
                else "draft"
            )
            chapter.regeneration_status = "idle"
            chapter.regeneration_error = None
            chapter.updated_at = datetime.now(UTC)
            return True

    async def fail_gap_impact_regeneration(
        self,
        *,
        chapter_id: UUID,
        expected_revision_number: int,
    ) -> None:
        """Expose a retryable cross-chapter rewrite failure without replacing text."""
        async with self._session_factory() as session, session.begin():
            chapter = await _require_chapter(session, chapter_id, lock=True)
            latest = await _latest_revision(session, chapter_id)
            if (
                latest is None
                or latest.revision_number != expected_revision_number
                or chapter.regeneration_status != "processing"
            ):
                return
            chapter.regeneration_status = "failed"
            chapter.regeneration_error = "gap_impact_regeneration_failed"
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


async def _latest_resolution(
    session: AsyncSession,
    gap_id: UUID,
) -> ConceptNoteGapResolution | None:
    """Load the newest append-only resolution event for a gap."""
    return await session.scalar(
        select(ConceptNoteGapResolution)
        .where(ConceptNoteGapResolution.gap_id == gap_id)
        .order_by(
            ConceptNoteGapResolution.created_at.desc(),
            ConceptNoteGapResolution.resolution_id.desc(),
        )
        .limit(1)
    )


async def _snapshot_chapter(
    session: AsyncSession,
    chapter: ConceptNoteChapter,
) -> WorkspaceChapterSnapshot:
    """Assemble one detached chapter and its gap provenance."""
    latest = await _latest_revision(session, chapter.chapter_id)
    gaps = list(
        (
            await session.scalars(
                select(ConceptNoteGap)
                .where(ConceptNoteGap.chapter_id == chapter.chapter_id)
                .order_by(ConceptNoteGap.created_at.asc(), ConceptNoteGap.gap_id.asc())
            )
        ).all()
    )
    gap_snapshots = [
        await _snapshot_gap(session, gap, chapter_title=chapter.title) for gap in gaps
    ]
    confirmed: ConceptNoteChapterRevision | None = None
    confirmed_number = None
    if chapter.confirmed_revision_id is not None:
        confirmed = await session.get(
            ConceptNoteChapterRevision,
            chapter.confirmed_revision_id,
        )
        confirmed_number = confirmed.revision_number if confirmed is not None else None
    proposed_number = (
        latest.revision_number
        if latest is not None
        and confirmed_number is not None
        and latest.revision_number != confirmed_number
        else None
    )
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
        proposed_revision_number=proposed_number,
        regeneration_status=chapter.regeneration_status,
        regeneration_error=chapter.regeneration_error,
        missing_information=[
            gap.question for gap in gap_snapshots if gap.state == "open"
        ],
    )


async def _snapshot_gap(
    session: AsyncSession,
    gap: ConceptNoteGap,
    *,
    chapter_title: str,
) -> WorkspaceGapSnapshot:
    """Detach one gap and its latest resolution."""
    resolution = await _latest_resolution(session, gap.gap_id)
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


async def _merge_generated_gaps(
    session: AsyncSession,
    chapter: ConceptNoteChapter,
    outputs: list[ConceptNoteDraftGapOutput],
    *,
    protected_gap_id: UUID,
) -> None:
    """Update still-open gaps and add newly discovered ones after a user answer."""
    existing = list(
        (
            await session.scalars(
                select(ConceptNoteGap).where(
                    ConceptNoteGap.chapter_id == chapter.chapter_id
                )
            )
        ).all()
    )
    by_key = {gap.field_key: gap for gap in existing}
    for output in outputs:
        gap = by_key.get(output.field_key)
        if gap is None:
            session.add(_gap_from_output(chapter, output))
            continue
        if gap.gap_id == protected_gap_id or gap.status in {
            "resolved",
            "dismissed",
            "caveat",
        }:
            continue
        if _update_gap_from_output(gap, output):
            gap.version += 1


async def _reconcile_evidence_gaps(
    session: AsyncSession,
    chapter: ConceptNoteChapter,
    outputs: list[ConceptNoteDraftGapOutput],
    source_refs: list[str],
) -> bool:
    """Resolve filled gaps and reopen evidence-backed gaps without losing history."""
    return await _reconcile_generated_gaps(
        session,
        chapter,
        outputs,
        close_action="evidence_update",
        close_answer=None,
        close_actor_user_id="system",
        source_refs=source_refs,
    )


async def _reconcile_generated_gaps(
    session: AsyncSession,
    chapter: ConceptNoteChapter,
    outputs: list[ConceptNoteDraftGapOutput],
    *,
    close_action: str,
    close_answer: str | None,
    close_actor_user_id: str,
    source_refs: list[str],
) -> bool:
    """Reconcile one generated gap set while retaining append-only provenance."""
    existing = list(
        (
            await session.scalars(
                select(ConceptNoteGap).where(
                    ConceptNoteGap.chapter_id == chapter.chapter_id
                )
            )
        ).all()
    )
    by_key = {gap.field_key: gap for gap in existing}
    output_by_key = {output.field_key: output for output in outputs}
    changed = False

    # Close open or caveat gaps that the new evidence now answers.
    for gap in existing:
        output = output_by_key.get(gap.field_key)
        if output is None and gap.status in {"open", "caveat", "processing"}:
            gap.status = "resolved"
            gap.version += 1
            gap.updated_at = datetime.now(UTC)
            session.add(
                ConceptNoteGapResolution(
                    gap_id=gap.gap_id,
                    action=close_action,
                    answer=close_answer,
                    actor_user_id=close_actor_user_id,
                    source_refs=source_refs,
                    idempotency_key=uuid4(),
                )
            )
            changed = True

    # Update current gaps, reopen prior answers, and add newly revealed gaps.
    for field_key, output in output_by_key.items():
        gap = by_key.get(field_key)
        if gap is None:
            session.add(_gap_from_output(chapter, output))
            changed = True
            continue
        if gap.status == "dismissed":
            continue
        presentation_changed = _update_gap_from_output(gap, output)
        reopened = gap.status == "resolved"
        if reopened:
            gap.status = "open"
            session.add(
                ConceptNoteGapResolution(
                    gap_id=gap.gap_id,
                    action="evidence_update",
                    answer=None,
                    actor_user_id="system",
                    source_refs=source_refs,
                    idempotency_key=uuid4(),
                )
            )
        if presentation_changed or reopened:
            gap.version += 1
            gap.updated_at = datetime.now(UTC)
            changed = True
    return changed


def _update_gap_from_output(
    gap: ConceptNoteGap,
    output: ConceptNoteDraftGapOutput,
) -> bool:
    """Refresh mutable gap presentation fields while preserving its identity."""
    suggestions = [item.model_dump(mode="json") for item in output.suggestions]
    source_refs = _suggestion_source_refs(suggestions)
    changed = (
        gap.question,
        gap.why_asking,
        gap.severity,
        gap.suggestions,
        gap.source_refs,
    ) != (
        output.question,
        output.why_asking,
        output.severity,
        suggestions,
        source_refs,
    )
    if not changed:
        return False
    gap.question = output.question
    gap.why_asking = output.why_asking
    gap.severity = output.severity
    gap.suggestions = suggestions
    gap.source_refs = source_refs
    gap.updated_at = datetime.now(UTC)
    return True


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


def _state_for_resolution(action: str) -> str:
    """Map an accepted resolution action to its persisted terminal gap state."""
    if action == "not_a_gap":
        return "dismissed"
    if action == "defer_as_caveat":
        return "caveat"
    return "resolved"


def _suggestion_source_refs(suggestions: list[dict[str, Any]]) -> list[str]:
    """Flatten unique suggestion citations in stable display order."""
    refs: list[str] = []
    for suggestion in suggestions:
        for value in suggestion.get("source_refs", []):
            ref = str(value).strip()
            if ref and ref not in refs:
                refs.append(ref)
    return refs


def _source_refs_for_answer(
    gap: ConceptNoteGap,
    answer: str | None,
) -> list[str]:
    """Retain provenance only when the submitted answer matches a suggestion."""
    if answer is None:
        return []
    submitted = answer.strip()
    for suggestion in gap.suggestions or []:
        if str(suggestion.get("value") or "").strip() == submitted:
            return _suggestion_source_refs([suggestion])
    return []


async def _delete_workspace_rows(session: AsyncSession, run_id: UUID) -> None:
    """Delete one run's workspace in explicit dependency order."""
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
