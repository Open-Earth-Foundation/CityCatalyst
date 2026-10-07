"""Structured gap persistence for the Concept Note workspace."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from app.models.cnb.concept_note_draft import ConceptNoteDraftGapOutput
from app.models.db.cnb_workspace import (
    ConceptNoteChapter,
    ConceptNoteGap,
    ConceptNoteGapResolution,
)
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

LEGACY_GENERIC_GAP_RATIONALE = "This information is required to complete the chapter."


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


async def _chapter_gaps(
    session: AsyncSession, chapter_id: UUID
) -> list[ConceptNoteGap]:
    """Return every gap row for one chapter."""
    return list(
        (
            await session.scalars(
                select(ConceptNoteGap).where(ConceptNoteGap.chapter_id == chapter_id)
            )
        ).all()
    )


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


def _dropped_unanswered_gaps(
    existing: list[ConceptNoteGap],
    outputs: list[ConceptNoteDraftGapOutput],
    answered_gap_ids: set[UUID],
) -> list[ConceptNoteGap]:
    """Return unresolved gaps a redraft omitted without new-source evidence."""
    output_keys = {output.field_key for output in outputs}
    return [
        gap
        for gap in existing
        if gap.status in {"open", "processing"}
        and gap.field_key not in output_keys
        and gap.gap_id not in answered_gap_ids
    ]


def _reconcile_evidence_gaps(
    session: AsyncSession,
    chapter: ConceptNoteChapter,
    existing: list[ConceptNoteGap],
    outputs: list[ConceptNoteDraftGapOutput],
    source_refs: list[str],
    answered_gap_ids: set[UUID],
) -> bool:
    """Resolve evidence-answered gaps and reopen contradicted ones with history.

    Only gaps in ``answered_gap_ids`` (backed by a successful new-source query)
    can close. Caveat gaps are user decisions and are never closed here.
    """
    by_key = {gap.field_key: gap for gap in existing}
    output_by_key = {output.field_key: output for output in outputs}
    changed = False

    # Close unresolved gaps the new evidence answered and the redraft dropped.
    for gap in existing:
        if (
            gap.gap_id in answered_gap_ids
            and gap.field_key not in output_by_key
            and gap.status in {"open", "processing"}
        ):
            gap.status = "resolved"
            gap.version += 1
            gap.updated_at = datetime.now(UTC)
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
