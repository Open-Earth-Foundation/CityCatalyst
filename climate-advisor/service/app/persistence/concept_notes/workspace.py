"""Persistence for the chapter-by-chapter Concept Note workspace."""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from app.models.cnb.concept_note_draft import (
    ConceptNoteChapterDraftOutput,
    ConceptNoteDraftGapOutput,
)
from app.models.db.cnb_workspace import (
    ConceptNoteChapter,
    ConceptNoteChapterReview,
    ConceptNoteChapterRevision,
    ConceptNoteChapterValidation,
)
from app.persistence.concept_notes.gaps import (
    _chapter_gaps,
    _dropped_unanswered_gaps,
    _gap_from_output,
    _has_blocking_gaps,
    _reconcile_evidence_gaps,
)
from app.persistence.concept_notes.workspace_queries import (
    _active_chapters,
    _evidence_by_chapter,
    _latest_revision,
    _latest_revisions,
)
from app.persistence.concept_notes.workspace_rows import (
    _copy_chapters,
    _copy_gaps,
    _copy_matches,
    _delete_workspace_rows,
    _run_gaps,
    _run_matches,
)
from app.persistence.concept_notes.workspace_snapshots import (
    WorkspaceChapterSnapshot,
    _snapshot_chapters,
)
from app.persistence.concept_notes.workspace_validation import (
    WorkspaceValidationContext,
    WorkspaceValidationInputChangedError,
    WorkspaceValidationSnapshot,
    _load_validation_context,
)
from app.utils.cnb_information_markers import (
    information_marker_key,
    information_needed_markers,
)
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker


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
                # Populate only unset descriptions on pre-existing workspaces. An
                # explicitly cleared description stays empty on every later load.
                for chapter in chapters:
                    await session.execute(
                        update(ConceptNoteChapter)
                        .where(
                            ConceptNoteChapter.run_id == run_id,
                            ConceptNoteChapter.template_section_id
                            == chapter.chapter_ref,
                            ConceptNoteChapter.description.is_(None),
                        )
                        .values(description=chapter.description or "")
                    )
                return

            for position, chapter in enumerate(chapters):
                session.add(
                    ConceptNoteChapter(
                        run_id=run_id,
                        template_section_id=chapter.chapter_ref,
                        title=chapter.title,
                        description=chapter.description or "",
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
            _require_marker_parity(body_markdown, missing_information)

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
        template_fingerprint: str | None = None,
    ) -> list[WorkspaceChapterSnapshot]:
        """Return active chapters in document order with latest Markdown."""
        async with self._session_factory() as session:
            return await _snapshot_chapters(
                session,
                run_id,
                template_fingerprint=template_fingerprint,
            )

    async def load_validation_context(
        self,
        *,
        run_id: UUID,
        chapter_id: UUID,
        template_fingerprint: str,
    ) -> WorkspaceValidationContext:
        """Load the target, full document, gaps, evidence, and input fingerprint."""
        async with self._session_factory() as session:
            return await _load_validation_context(
                session,
                run_id=run_id,
                chapter_id=chapter_id,
                template_fingerprint=template_fingerprint,
            )

    async def upsert_validation(
        self,
        *,
        run_id: UUID,
        chapter_id: UUID,
        template_fingerprint: str,
        expected_fingerprint: str,
        status: str,
        findings: list[dict[str, Any]],
    ) -> WorkspaceValidationSnapshot:
        """Atomically replace a validation if its complete input remains current.

        Raises:
            WorkspaceValidationInputChangedError: If any fingerprinted input changed.
            ValueError: If the chapter or validation status is invalid.
        """
        if status not in {"ready", "needs_review", "incomplete"}:
            raise ValueError(f"Unsupported chapter validation status: {status}")

        async with self._session_factory() as session, session.begin():
            # Lock the active document before checking the post-LLM fingerprint.
            context = await _load_validation_context(
                session,
                run_id=run_id,
                chapter_id=chapter_id,
                template_fingerprint=template_fingerprint,
                lock=True,
            )
            if context.fingerprint != expected_fingerprint:
                raise WorkspaceValidationInputChangedError(
                    "Concept Note validation input changed during evaluation"
                )

            # Replace the one latest result and lifecycle state together.
            stored = await session.scalar(
                select(ConceptNoteChapterValidation)
                .where(ConceptNoteChapterValidation.chapter_id == chapter_id)
                .with_for_update()
            )
            validated_at = datetime.now(UTC)
            if stored is None:
                stored = ConceptNoteChapterValidation(chapter_id=chapter_id)
                session.add(stored)
            stored.validated_revision_id = context.target.revision_id
            stored.validation_input_fingerprint = context.fingerprint
            stored.status = status
            stored.findings = deepcopy(findings)
            stored.validated_at = validated_at

            chapter = await session.get(ConceptNoteChapter, chapter_id)
            if chapter is None:
                raise ValueError(f"Concept Note chapter {chapter_id} was not found")
            if status == "ready":
                chapter.status = "ready"
            elif status == "needs_review":
                chapter.status = "needs_review"
            else:
                chapter.status = (
                    "draft" if context.target.revision_id is not None else "empty"
                )
            chapter.updated_at = validated_at
            await session.flush()

            return WorkspaceValidationSnapshot(
                validation_id=stored.validation_id,
                status=stored.status,
                is_stale=False,
                validated_revision_id=stored.validated_revision_id,
                validated_revision_number=context.target.revision_number,
                validation_input_fingerprint=stored.validation_input_fingerprint,
                validated_at=stored.validated_at,
                findings=deepcopy(stored.findings),
            )

    async def copy_working_copy(
        self,
        *,
        source_run_id: UUID,
        destination_run_id: UUID,
    ) -> WorkspaceCopyResult:
        """Replace a destination with an independent current-state copy."""
        async with self._session_factory() as session, session.begin():
            # Step 1: make retries deterministic and load the source in bulk.
            await _delete_workspace_rows(session, destination_run_id)
            source_chapters = await _active_chapters(session, source_run_id)
            chapter_ids = [chapter.chapter_id for chapter in source_chapters]
            revisions = await _latest_revisions(session, chapter_ids)
            evidence_by_chapter = await _evidence_by_chapter(session, chapter_ids)
            gaps = await _run_gaps(session, source_run_id)
            matches = await _run_matches(session, source_run_id)

            # Step 2: clone chapters first so dependent rows can be remapped.
            chapter_map, completed_chapters = await _copy_chapters(
                session,
                destination_run_id=destination_run_id,
                source_chapters=source_chapters,
                revisions=revisions,
                evidence_by_chapter=evidence_by_chapter,
                gaps=gaps,
            )

            # Step 3: clone run-scoped rows after chapter identities are known.
            await _copy_gaps(session, destination_run_id, gaps, chapter_map)
            _copy_matches(session, destination_run_id, matches)

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

    async def save_revalidated_chapter(
        self,
        *,
        chapter_id: UUID,
        expected_revision_number: int,
        generated: ConceptNoteChapterDraftOutput,
        source_refs: list[str],
        answered_gap_ids: set[UUID],
    ) -> bool:
        """Persist a source-driven proposal while preserving confirmed content.

        ``answered_gap_ids`` are the gaps a successful new-source query answered;
        only those may close.

        Raises:
            WorkspaceConflictError: If markers and gaps disagree, or the redraft
                dropped an unresolved gap the new source did not answer.
        """
        async with self._session_factory() as session, session.begin():
            chapter = await _require_chapter(session, chapter_id, lock=True)
            latest = await _latest_revision(session, chapter_id)
            if latest is None or latest.revision_number != expected_revision_number:
                return False

            # Reject redrafts whose visible unknowns disagree with their gap records.
            _require_marker_parity(
                generated.body_markdown, generated.missing_information
            )
            existing = await _chapter_gaps(session, chapter_id)
            if _dropped_unanswered_gaps(
                existing, generated.missing_information, answered_gap_ids
            ):
                raise WorkspaceConflictError(
                    "Revalidation dropped gaps the new source did not answer"
                )

            # Reconcile evidence-filled and newly reopened gaps before status choice.
            gaps_changed = _reconcile_evidence_gaps(
                session,
                chapter,
                existing,
                generated.missing_information,
                source_refs,
                answered_gap_ids,
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
            chapter.updated_at = datetime.now(UTC)
            return True


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


def _require_marker_parity(
    body_markdown: str,
    missing_information: list[ConceptNoteDraftGapOutput],
) -> None:
    """Raise unless body markers and gap questions match one to one."""
    marker_keys = {
        information_marker_key(marker)
        for marker in information_needed_markers(body_markdown)
    }
    gap_keys = {information_marker_key(gap.question) for gap in missing_information}
    if marker_keys != gap_keys:
        raise WorkspaceConflictError(
            "Missing-information markers must match the generated gaps"
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
