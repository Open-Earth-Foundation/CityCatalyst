"""Persistence for the chapter-by-chapter Concept Note workspace."""

from __future__ import annotations

import json
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import UTC, datetime
from hashlib import sha256
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
    ConceptNoteChapterValidation,
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
from sqlalchemy import delete, func, select
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
    validation: WorkspaceValidationSnapshot | None = None


@dataclass(frozen=True)
class WorkspaceValidationSnapshot:
    """Detached latest validation plus its derived freshness state."""

    validation_id: UUID
    status: str
    is_stale: bool
    validated_revision_id: UUID | None
    validated_revision_number: int | None
    validation_input_fingerprint: str
    validated_at: datetime
    findings: list[dict[str, Any]]


@dataclass(frozen=True)
class WorkspaceValidationChapter:
    """One active chapter and the immutable revision supplied to validation."""

    chapter_id: UUID
    chapter_ref: str | None
    title: str
    position: int
    status: str
    required: bool
    body_markdown: str | None
    revision_id: UUID | None
    revision_number: int | None


@dataclass(frozen=True)
class WorkspaceValidationGap:
    """One open target-chapter gap included in the validation fingerprint."""

    gap_id: UUID
    field_key: str | None
    severity: str
    reason: str


@dataclass(frozen=True)
class WorkspaceValidationEvidence:
    """One target-chapter evidence link included in validation input."""

    evidence_link_id: UUID
    selected_source_label: str
    source_location: str | None
    claim_ref: str | None
    quote_or_summary: str


@dataclass(frozen=True)
class WorkspaceValidationContext:
    """Consistent database input for both chapter-validation passes."""

    target: WorkspaceValidationChapter
    chapters: list[WorkspaceValidationChapter]
    open_gaps: list[WorkspaceValidationGap]
    evidence_links: list[WorkspaceValidationEvidence]
    fingerprint: str


@dataclass(frozen=True)
class WorkspaceCopyResult:
    """Counts needed to publish a duplicated run's draft progress."""

    completed_chapters: int
    total_chapters: int


class WorkspaceValidationInputChangedError(Exception):
    """The persisted validation input changed after LLM evaluation started."""


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


def _validation_chapters(
    chapters: list[ConceptNoteChapter],
    revisions: dict[UUID, ConceptNoteChapterRevision],
) -> list[WorkspaceValidationChapter]:
    """Detach active chapter state for the validator and fingerprint builder."""
    detached: list[WorkspaceValidationChapter] = []
    for chapter in chapters:
        revision = revisions.get(chapter.chapter_id)
        detached.append(
            WorkspaceValidationChapter(
                chapter_id=chapter.chapter_id,
                chapter_ref=chapter.template_section_id,
                title=chapter.title,
                position=chapter.position,
                status=chapter.status,
                required=chapter.required,
                body_markdown=(
                    revision.body_markdown if revision is not None else None
                ),
                revision_id=(revision.revision_id if revision is not None else None),
                revision_number=(
                    revision.revision_number if revision is not None else None
                ),
            )
        )
    return detached


def _validation_gaps(gaps: list[ConceptNoteGap]) -> list[WorkspaceValidationGap]:
    """Detach open gaps from their SQLAlchemy session."""
    return [
        WorkspaceValidationGap(
            gap_id=gap.gap_id,
            field_key=gap.field_key,
            severity=gap.severity,
            reason=gap.question,
        )
        for gap in gaps
    ]


def _validation_evidence(
    evidence_links: list[ConceptNoteEvidenceLink],
) -> list[WorkspaceValidationEvidence]:
    """Detach evidence links from their SQLAlchemy session."""
    return [
        WorkspaceValidationEvidence(
            evidence_link_id=evidence.evidence_link_id,
            selected_source_label=evidence.selected_source_label,
            source_location=evidence.source_location,
            claim_ref=evidence.claim_ref,
            quote_or_summary=evidence.quote_or_summary,
        )
        for evidence in evidence_links
    ]


def calculate_validation_input_fingerprint(
    *,
    chapters: list[WorkspaceValidationChapter],
    target_chapter_id: UUID,
    open_gaps: list[WorkspaceValidationGap],
    evidence_links: list[WorkspaceValidationEvidence],
    template_fingerprint: str | None,
) -> str:
    """Hash all document, target, and template inputs supplied to validation."""
    payload = {
        "chapters": [
            {
                "chapter_id": str(chapter.chapter_id),
                "chapter_ref": chapter.chapter_ref,
                "title": chapter.title,
                "position": chapter.position,
                "required": chapter.required,
                "revision_id": (
                    str(chapter.revision_id)
                    if chapter.revision_id is not None
                    else None
                ),
            }
            for chapter in chapters
        ],
        "target": {
            "chapter_id": str(target_chapter_id),
            "open_gaps": [
                {
                    "gap_id": str(gap.gap_id),
                    "field_key": gap.field_key,
                    "severity": gap.severity,
                    "reason": gap.reason,
                }
                for gap in open_gaps
            ],
            "evidence_links": [
                {
                    "evidence_link_id": str(evidence.evidence_link_id),
                    "selected_source_label": evidence.selected_source_label,
                    "source_location": evidence.source_location,
                    "claim_ref": evidence.claim_ref,
                    "quote_or_summary": evidence.quote_or_summary,
                }
                for evidence in evidence_links
            ],
        },
        "template_fingerprint": template_fingerprint,
    }
    canonical = json.dumps(
        payload,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )
    return sha256(canonical.encode("utf-8")).hexdigest()


async def _load_validation_context(
    session: AsyncSession,
    *,
    run_id: UUID,
    chapter_id: UUID,
    template_fingerprint: str,
    lock: bool = False,
) -> WorkspaceValidationContext:
    """Build one validation input snapshot from the managed CNB database."""
    # Load and optionally lock the whole active document for the final race check.
    chapters = await _active_chapters(session, run_id, lock=lock)
    target = next(
        (chapter for chapter in chapters if chapter.chapter_id == chapter_id),
        None,
    )
    if target is None:
        raise ValueError(f"Concept Note chapter {chapter_id} was not found")

    # Detach target-specific gaps and evidence alongside every current revision.
    chapter_ids = [chapter.chapter_id for chapter in chapters]
    revisions = await _latest_revisions(session, chapter_ids)
    gap_rows = await _gaps_by_chapter(session, [chapter_id], lock=lock)
    evidence_rows = await _evidence_by_chapter(session, [chapter_id], lock=lock)
    validation_chapters = _validation_chapters(chapters, revisions)
    open_gaps = _validation_gaps(gap_rows[chapter_id])
    evidence_links = _validation_evidence(evidence_rows[chapter_id])
    target_snapshot = next(
        chapter for chapter in validation_chapters if chapter.chapter_id == chapter_id
    )
    fingerprint = calculate_validation_input_fingerprint(
        chapters=validation_chapters,
        target_chapter_id=chapter_id,
        open_gaps=open_gaps,
        evidence_links=evidence_links,
        template_fingerprint=template_fingerprint,
    )
    return WorkspaceValidationContext(
        target=target_snapshot,
        chapters=validation_chapters,
        open_gaps=open_gaps,
        evidence_links=evidence_links,
        fingerprint=fingerprint,
    )


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


async def _latest_gap_resolutions(
    session: AsyncSession, gap_ids: list[UUID]
) -> dict[UUID, ConceptNoteGapResolution]:
    """Load the latest resolution for each visible gap in one query."""
    if not gap_ids:
        return {}
    ranked = (
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
        .where(ConceptNoteGapResolution.gap_id.in_(gap_ids))
        .subquery()
    )
    resolutions = await session.scalars(
        select(ConceptNoteGapResolution).where(
            ConceptNoteGapResolution.resolution_id.in_(
                select(ranked.c.resolution_id).where(ranked.c.rank == 1)
            )
        )
    )
    return {resolution.gap_id: resolution for resolution in resolutions}


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
