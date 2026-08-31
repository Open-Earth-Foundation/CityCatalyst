"""Persistence for the chapter-by-chapter Concept Note workspace."""

from __future__ import annotations

import json
from copy import deepcopy
from dataclasses import dataclass
from datetime import UTC, datetime
from hashlib import sha256
from typing import Any
from uuid import UUID

from app.models.db.cnb_workspace import (
    ConceptNoteChapter,
    ConceptNoteChapterRevision,
    ConceptNoteChapterValidation,
    ConceptNoteEvidenceLink,
    ConceptNoteExport,
    ConceptNoteGap,
    ConceptNoteMatchedProject,
)
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker


@dataclass(frozen=True)
class WorkspaceTemplateChapter:
    """One normalized template chapter used to seed a run workspace."""

    chapter_ref: str
    description: str | None
    required: bool
    title: str


@dataclass(frozen=True)
class WorkspaceChapterSnapshot:
    """Detached chapter metadata plus its latest persisted revision."""

    chapter_id: UUID
    chapter_ref: str | None
    title: str
    position: int
    status: str
    required: bool
    user_locked: bool
    body_markdown: str | None
    missing_information: list[str]
    revision_number: int | None
    revision_id: UUID | None = None
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
    checks: list[dict[str, Any]]
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
        missing_information: list[str],
    ) -> bool:
        """Persist the first agent revision unless the chapter is already drafted."""
        async with self._session_factory() as session, session.begin():
            chapter = await session.get(
                ConceptNoteChapter,
                chapter_id,
                with_for_update=True,
            )
            if chapter is None or chapter.status == "deleted":
                raise ValueError(f"Concept Note chapter {chapter_id} was not found")

            latest = await _latest_revision(session, chapter.chapter_id)
            if latest is not None:
                return False

            session.add(
                ConceptNoteChapterRevision(
                    chapter_id=chapter_id,
                    revision_number=1,
                    author_type="agent",
                    change_type="draft",
                    body_markdown=body_markdown,
                    patch_summary={"missing_information": missing_information},
                )
            )
            await session.execute(
                delete(ConceptNoteGap).where(
                    ConceptNoteGap.chapter_id == chapter_id,
                    ConceptNoteGap.status == "open",
                )
            )
            for missing_item in missing_information:
                session.add(
                    ConceptNoteGap(
                        run_id=chapter.run_id,
                        chapter_id=chapter_id,
                        field_key=None,
                        severity="missing_information",
                        reason=missing_item,
                        status="open",
                    )
                )
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
        checks: list[dict[str, Any]],
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
            stored.checks = deepcopy(checks)
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
                checks=deepcopy(stored.checks),
                findings=deepcopy(stored.findings),
            )

    async def copy_working_copy(
        self,
        *,
        source_run_id: UUID,
        destination_run_id: UUID,
    ) -> WorkspaceCopyResult:
        """Replace a destination with an independent copy of current workspace state."""
        async with self._session_factory() as session, session.begin():
            # Make retries deterministic after any earlier transaction failure.
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
            gaps = list(
                (
                    await session.scalars(
                        select(ConceptNoteGap).where(
                            ConceptNoteGap.run_id == source_run_id
                        )
                    )
                ).all()
            )
            chapters_with_open_gaps = {
                gap.chapter_id
                for gap in gaps
                if gap.chapter_id is not None and gap.status == "open"
            }
            chapter_map: dict[UUID, UUID] = {}
            completed_chapters = 0

            # Copy chapter metadata and only the latest body as revision one.
            for source_chapter in source_chapters:
                latest = await _latest_revision(session, source_chapter.chapter_id)
                if latest is None:
                    destination_status = "empty"
                elif source_chapter.chapter_id in chapters_with_open_gaps:
                    destination_status = "needs_review"
                else:
                    destination_status = "draft"
                destination_chapter = ConceptNoteChapter(
                    run_id=destination_run_id,
                    template_section_id=source_chapter.template_section_id,
                    title=source_chapter.title,
                    position=source_chapter.position,
                    status=destination_status,
                    required=source_chapter.required,
                    user_locked=source_chapter.user_locked,
                )
                session.add(destination_chapter)
                await session.flush()
                chapter_map[source_chapter.chapter_id] = destination_chapter.chapter_id

                if latest is not None:
                    session.add(
                        ConceptNoteChapterRevision(
                            chapter_id=destination_chapter.chapter_id,
                            revision_number=1,
                            author_type="system",
                            change_type="draft",
                            body_markdown=latest.body_markdown,
                            patch_summary={
                                "duplicated_from_revision_id": str(latest.revision_id)
                            },
                        )
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

            # Copy run-scoped gaps and remap any chapter relationship.
            for gap in gaps:
                session.add(
                    ConceptNoteGap(
                        run_id=destination_run_id,
                        chapter_id=(
                            chapter_map.get(gap.chapter_id)
                            if gap.chapter_id is not None
                            else None
                        ),
                        field_key=gap.field_key,
                        severity=gap.severity,
                        reason=gap.reason,
                        status=gap.status,
                    )
                )

            # Copy selected project matches as independent mutable rows.
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


async def _open_gaps_by_chapter(
    session: AsyncSession,
    chapter_ids: list[UUID],
    *,
    lock: bool = False,
) -> dict[UUID, list[ConceptNoteGap]]:
    """Group open gaps for fingerprinting and draft-state presentation."""
    grouped = {chapter_id: [] for chapter_id in chapter_ids}
    if not chapter_ids:
        return grouped
    statement = (
        select(ConceptNoteGap)
        .where(
            ConceptNoteGap.chapter_id.in_(chapter_ids),
            ConceptNoteGap.status == "open",
        )
        .order_by(ConceptNoteGap.created_at.asc(), ConceptNoteGap.gap_id.asc())
    )
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
                body_markdown=(revision.body_markdown if revision is not None else None),
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
            reason=gap.reason,
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
                    str(chapter.revision_id) if chapter.revision_id is not None else None
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
    gap_rows = await _open_gaps_by_chapter(session, [chapter_id], lock=lock)
    evidence_rows = await _evidence_by_chapter(session, [chapter_id], lock=lock)
    validation_chapters = _validation_chapters(chapters, revisions)
    open_gaps = _validation_gaps(gap_rows[chapter_id])
    evidence_links = _validation_evidence(evidence_rows[chapter_id])
    target_snapshot = next(
        chapter
        for chapter in validation_chapters
        if chapter.chapter_id == chapter_id
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
    gaps = await _open_gaps_by_chapter(session, chapter_ids)
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

    # Resolve revision numbers for validations that predate the current revision.
    validated_revision_numbers = {
        revision.revision_id: revision.revision_number
        for revision in revisions.values()
    }
    old_revision_ids = {
        validation.validated_revision_id
        for validation in validations.values()
        if validation.validated_revision_id is not None
        and validation.validated_revision_id not in validated_revision_numbers
    }
    if old_revision_ids:
        old_revisions = (
            await session.execute(
                select(
                    ConceptNoteChapterRevision.revision_id,
                    ConceptNoteChapterRevision.revision_number,
                ).where(ConceptNoteChapterRevision.revision_id.in_(old_revision_ids))
            )
        ).all()
        validated_revision_numbers.update(dict(old_revisions))

    # Compute each target's freshness against the same document snapshot.
    snapshots: list[WorkspaceChapterSnapshot] = []
    for chapter, detached in zip(chapters, validation_chapters, strict=True):
        current_fingerprint = calculate_validation_input_fingerprint(
            chapters=validation_chapters,
            target_chapter_id=chapter.chapter_id,
            open_gaps=_validation_gaps(gaps[chapter.chapter_id]),
            evidence_links=_validation_evidence(evidence[chapter.chapter_id]),
            template_fingerprint=template_fingerprint,
        )
        stored_validation = validations.get(chapter.chapter_id)
        validation_snapshot = None
        if stored_validation is not None:
            is_stale = (
                stored_validation.validation_input_fingerprint
                != current_fingerprint
            )
            validation_snapshot = WorkspaceValidationSnapshot(
                validation_id=stored_validation.validation_id,
                status=stored_validation.status,
                is_stale=is_stale,
                validated_revision_id=stored_validation.validated_revision_id,
                validated_revision_number=validated_revision_numbers.get(
                    stored_validation.validated_revision_id
                ),
                validation_input_fingerprint=(
                    stored_validation.validation_input_fingerprint
                ),
                validated_at=stored_validation.validated_at,
                checks=deepcopy(stored_validation.checks),
                findings=deepcopy(stored_validation.findings),
            )
        effective_status = chapter.status
        if (
            validation_snapshot is not None
            and validation_snapshot.is_stale
            and effective_status == "ready"
        ):
            effective_status = "needs_review"
        snapshots.append(
            WorkspaceChapterSnapshot(
                chapter_id=chapter.chapter_id,
                chapter_ref=chapter.template_section_id,
                title=chapter.title,
                position=chapter.position,
                status=effective_status,
                required=chapter.required,
                user_locked=chapter.user_locked,
                body_markdown=detached.body_markdown,
                missing_information=[gap.reason for gap in gaps[chapter.chapter_id]],
                revision_number=detached.revision_number,
                revision_id=detached.revision_id,
                validation=validation_snapshot,
            )
        )
    return snapshots


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
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None
