"""Chapter-validation input snapshots and their freshness fingerprint."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime
from hashlib import sha256
from typing import Any
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.db.cnb_workspace import (
    ConceptNoteChapter,
    ConceptNoteChapterRevision,
    ConceptNoteChapterValidation,
    ConceptNoteEvidenceLink,
    ConceptNoteGap,
)
from app.models.db.document_workspace import (
    DocumentCandidate,
    DocumentPoint,
    DocumentPointRevision,
    DocumentWorkspaceState,
)
from app.persistence.concept_notes.source_provenance import (
    merge_provenance,
    revision_provenance,
    sources_provenance,
)
from app.persistence.concept_notes.validation_sources import (
    ValidationSourceAuthority,
    ValidationSourceSnapshot,
    load_validation_source_snapshot,
    resolve_validation_source_authority,
)
from app.persistence.concept_notes.workspace_queries import (
    _active_chapters,
    _evidence_by_chapter,
    _gaps_by_chapter,
    _latest_revisions,
)
from app.utils.document_point_values import accepted_point_reason


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
    description: str | None = None
    source_provenance: dict[str, Any] | None = None


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
    canonical_points: list[dict[str, Any]] = field(default_factory=list)
    source_authority: ValidationSourceAuthority | None = None


class WorkspaceValidationInputChangedError(Exception):
    """The persisted validation input changed after LLM evaluation started."""


async def has_current_ready_validation(
    session: AsyncSession,
    *,
    run_id: UUID,
    chapter_id: UUID,
    template_fingerprint: str,
    lock: bool = False,
    workflow_session_factory: async_sessionmaker[AsyncSession] | None = None,
    source_snapshot: ValidationSourceSnapshot | None = None,
) -> bool:
    """Require validation of the exact current prose, canonical answers and policy."""
    context = await _load_validation_context(
        session,
        run_id=run_id,
        chapter_id=chapter_id,
        template_fingerprint=template_fingerprint,
        lock=lock,
        workflow_session_factory=workflow_session_factory,
        source_snapshot=source_snapshot,
    )
    stored = await session.scalar(
        select(ConceptNoteChapterValidation).where(
            ConceptNoteChapterValidation.chapter_id == chapter_id
        )
    )
    return bool(
        stored is not None
        and context.source_authority is not None
        and context.source_authority.ready
        and stored.status == "ready"
        and stored.validated_revision_id == context.target.revision_id
        and stored.validation_input_fingerprint == context.fingerprint
    )


async def _load_validation_points(
    session: AsyncSession, run_id: UUID
) -> list[dict[str, Any]]:
    """Capture current policy and immutable accepted reasons for freshness checks."""
    rows = (
        await session.execute(
            select(DocumentPoint, DocumentPointRevision.snapshot)
            .outerjoin(
                DocumentPointRevision,
                and_(
                    DocumentPointRevision.point_id == DocumentPoint.point_id,
                    DocumentPointRevision.version == DocumentPoint.accepted_version,
                ),
            )
            .where(DocumentPoint.run_id == run_id, DocumentPoint.active.is_(True))
            .order_by(DocumentPoint.semantic_key)
        )
    ).all()
    result = []
    candidate_ids = []
    for _, accepted in rows:
        if accepted and accepted.get("candidate_id"):
            try:
                candidate_ids.append(UUID(accepted["candidate_id"]))
            except (ValueError, TypeError):
                pass
    candidates = (
        {
            str(candidate.candidate_id): candidate
            for candidate in await session.scalars(
                select(DocumentCandidate).where(
                    DocumentCandidate.candidate_id.in_(candidate_ids)
                )
            )
        }
        if candidate_ids
        else {}
    )
    for point, accepted in rows:
        snapshot = accepted or {}
        accepted_state = point.accepted_version > 0 and point.disposition in {
            "answered",
            "assumption",
            "not_applicable",
        }
        candidate_id = snapshot.get("candidate_id")
        candidate = candidates.get(str(candidate_id)) if candidate_id else None
        provenance = (
            sources_provenance([candidate.source_identity])
            if candidate is not None
            else merge_provenance(None)
            if accepted_state and (not accepted or candidate_id)
            else sources_provenance([])
        )
        result.append(
            {
                **point.definition,
                "key": point.semantic_key,
                "point_id": str(point.point_id),
                "version": point.version,
                "accepted_version": point.accepted_version,
                "status": point.disposition if accepted_state else "missing",
                "value": snapshot.get("value", point.value) if accepted_state else None,
                "reason": accepted_point_reason(snapshot) if accepted_state else None,
                "source_provenance": provenance,
            }
        )
    return result


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
                description=chapter.description,
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
                source_provenance=revision_provenance(revision),
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
    canonical_points: list[dict[str, Any]] | None = None,
    source_authority: ValidationSourceAuthority | None = None,
) -> str:
    """Hash all document, target, and template inputs supplied to validation."""
    payload = {
        "chapters": [
            {
                "chapter_id": str(chapter.chapter_id),
                "chapter_ref": chapter.chapter_ref,
                "description": chapter.description,
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
    # Legacy runs without point setup keep their existing validation identity.
    if canonical_points:
        payload["canonical_points"] = canonical_points
    if source_authority is not None:
        payload["source_authority"] = source_authority.fingerprint_input()
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
    workflow_session_factory: async_sessionmaker[AsyncSession] | None = None,
    source_snapshot: ValidationSourceSnapshot | None = None,
) -> WorkspaceValidationContext:
    """Build one validation input snapshot from the managed CNB database."""
    # Match point writers' state-before-chapters order for the final race check.
    if lock:
        await session.scalar(
            select(DocumentWorkspaceState)
            .where(
                DocumentWorkspaceState.run_id == run_id,
            )
            .with_for_update()
        )
    canonical_points = await _load_validation_points(session, run_id)
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
    source_authority = await _validation_source_authority(
        validation_chapters,
        canonical_points,
        run_id,
        workflow_session_factory=workflow_session_factory,
        source_snapshot=source_snapshot,
    )
    target_snapshot = next(
        chapter for chapter in validation_chapters if chapter.chapter_id == chapter_id
    )
    fingerprint = calculate_validation_input_fingerprint(
        chapters=validation_chapters,
        target_chapter_id=chapter_id,
        open_gaps=open_gaps,
        evidence_links=evidence_links,
        template_fingerprint=template_fingerprint,
        canonical_points=canonical_points,
        source_authority=source_authority,
    )
    return WorkspaceValidationContext(
        target=target_snapshot,
        chapters=validation_chapters,
        open_gaps=open_gaps,
        evidence_links=evidence_links,
        fingerprint=fingerprint,
        canonical_points=canonical_points,
        source_authority=source_authority,
    )


async def _validation_source_authority(
    chapters: list[WorkspaceValidationChapter],
    points: list[dict[str, Any]],
    run_id: UUID,
    *,
    workflow_session_factory: async_sessionmaker[AsyncSession] | None,
    source_snapshot: ValidationSourceSnapshot | None = None,
) -> ValidationSourceAuthority:
    """Resolve every body and applicable accepted point supplied to consistency."""
    refs = {chapter.chapter_ref for chapter in chapters}
    provenance = merge_provenance(
        sources_provenance([]),
        *(
            chapter.source_provenance
            for chapter in chapters
            if chapter.body_markdown is not None
        ),
        *(
            point.get("source_provenance")
            for point in points
            if point.get("status") in {"answered", "assumption", "not_applicable"}
            and (
                not point.get("chapter_refs")
                or refs.intersection(point["chapter_refs"])
            )
        ),
    )
    snapshot = source_snapshot
    if snapshot is None:
        snapshot = await load_validation_source_snapshot(
            workflow_session_factory, run_id
        )
    return resolve_validation_source_authority(provenance, snapshot)
