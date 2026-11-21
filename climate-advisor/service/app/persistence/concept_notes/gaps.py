"""Structured gap persistence for the Concept Note workspace."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from app.models.cnb.concept_note_draft import (
    ConceptNoteChapterDraftOutput,
    ConceptNoteDraftGapOutput,
)
from app.models.db.cnb_workspace import (
    ConceptNoteChapter,
    ConceptNoteGap,
    ConceptNoteGapResolution,
)
from app.utils.cnb_information_markers import (
    information_marker_key,
    marker_replacement_text,
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
    gap_version: int | None = None


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
    # Partial answers saved for the current open version (see save_partial_answer).
    answered_so_far: str | None = None
    # Set once an accepted narrowing has occurred; the original scope and the
    # reviewed passages written so far for this gap, in version order.
    original_question: str | None = None
    accepted_passages: tuple[str, ...] = ()


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
    session: AsyncSession, gap_ids: list[UUID], *, partial: bool
) -> dict[UUID, ConceptNoteGapResolution]:
    """Load one batched latest event per gap.

    Non-partial events give the gap's resolution. Partial answers count only at
    the gap's current version, so answers saved on an earlier version never show.
    """
    if not gap_ids:
        return {}
    ranked_query = select(ConceptNoteGapResolution.resolution_id).select_from(
        ConceptNoteGapResolution
    )
    if partial:
        ranked_query = ranked_query.join(
            ConceptNoteGap,
            (ConceptNoteGap.gap_id == ConceptNoteGapResolution.gap_id)
            & (ConceptNoteGap.version == ConceptNoteGapResolution.gap_version),
        ).where(ConceptNoteGapResolution.action == "partial_answer")
    else:
        ranked_query = ranked_query.where(
            ConceptNoteGapResolution.action != "partial_answer"
        )
    ranked = (
        ranked_query.add_columns(
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
    partial_answer: ConceptNoteGapResolution | None,
    *,
    chapter_title: str,
) -> WorkspaceGapSnapshot:
    """Detach one gap, its latest non-partial resolution and its saved answers."""
    resolution_snapshot = (
        WorkspaceGapResolutionSnapshot(
            resolution_id=resolution.resolution_id,
            action=resolution.action,
            answer=resolution.answer,
            actor_user_id=resolution.actor_user_id,
            source_refs=list(resolution.source_refs or []),
            created_at=resolution.created_at,
            gap_version=resolution.gap_version,
        )
        if resolution is not None
        else None
    )
    # Saved answers count only while the gap is open or an estimate awaits
    # confirmation at their version; a clear row exposes null.
    answered_so_far = (
        partial_answer.answer
        if partial_answer is not None and gap.status in {"open", "processing", "caveat"}
        else None
    )
    progress = gap.answer_progress if isinstance(gap.answer_progress, dict) else {}
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
        answered_so_far=answered_so_far,
        original_question=progress.get("original_question"),
        accepted_passages=tuple(
            str(passage) for passage in progress.get("accepted_passages") or ()
        ),
    )


async def latest_partial_answer(
    session: AsyncSession,
    *,
    gap_id: UUID,
    gap_version: int,
) -> ConceptNoteGapResolution | None:
    """Return the newest saved partial answer for one gap version.

    Ordering matches the workspace read: created_at, then resolution_id.
    """
    return await session.scalar(
        select(ConceptNoteGapResolution)
        .where(
            ConceptNoteGapResolution.gap_id == gap_id,
            ConceptNoteGapResolution.action == "partial_answer",
            ConceptNoteGapResolution.gap_version == gap_version,
        )
        .order_by(
            ConceptNoteGapResolution.created_at.desc(),
            ConceptNoteGapResolution.resolution_id.desc(),
        )
        .limit(1)
    )


async def save_partial_answer(
    session: AsyncSession,
    *,
    run_id: UUID,
    gap_id: UUID,
    gap_version: int,
    answer: str,
    expected_previous: str | None,
    user_id: str,
) -> bool:
    """Save a gap's answers so far as its newest event; empty text clears them.

    Each save holds every answer given so far, so the newest one replaces the
    rest. Returns False when the gap is not open at that version, or when its
    saved answers are not the text the form last saw, so a stale form cannot
    attach answers to a changed or closed gap or overwrite newer answers.
    """
    gap = await session.get(ConceptNoteGap, gap_id, with_for_update=True)
    if (
        gap is None
        or gap.run_id != run_id
        or gap.status not in {"open", "processing", "caveat"}
        or gap.version != gap_version
    ):
        return False
    # The gap row lock serializes saves, so this latest event is current.
    previous = await latest_partial_answer(
        session, gap_id=gap_id, gap_version=gap_version
    )
    if _saved_text(previous.answer if previous else None) != _saved_text(
        expected_previous
    ):
        return False
    # Postgres now() is the transaction start, so use the wall clock and keep
    # this save after the one it follows.
    created_at = datetime.now(UTC)
    if previous is not None:
        previous_at = previous.created_at
        if previous_at.tzinfo is None:
            previous_at = previous_at.replace(tzinfo=UTC)
        created_at = max(created_at, previous_at + timedelta(microseconds=1))
    session.add(
        ConceptNoteGapResolution(
            gap_id=gap_id,
            action="partial_answer",
            answer=answer.strip() or None,
            gap_version=gap_version,
            actor_user_id=user_id,
            idempotency_key=uuid4(),
            created_at=created_at,
        )
    )
    return True


async def carry_forward_saved_answer(
    session: AsyncSession,
    *,
    gap: ConceptNoteGap,
    previous_version: int,
) -> bool:
    """Copy the saved answers of the previous version onto the gap's new version.

    The caller applies an accepted narrowing: it holds the gap row lock and has
    already moved ``gap.version`` to the new version. The new partial_answer event
    keeps the saved text and the actor of the newest saved event, with its own
    idempotency key, and creates no non-partial resolution. An empty or missing
    saved answer leaves the gap clear. Returns True when an event was added.
    """
    previous = await latest_partial_answer(
        session, gap_id=gap.gap_id, gap_version=previous_version
    )
    if previous is None or _saved_text(previous.answer) is None:
        return False
    session.add(
        ConceptNoteGapResolution(
            gap_id=gap.gap_id,
            action="partial_answer",
            answer=previous.answer,
            gap_version=gap.version,
            actor_user_id=previous.actor_user_id,
            idempotency_key=uuid4(),
            created_at=datetime.now(UTC),
        )
    )
    return True


def record_accepted_narrowing(
    gap: ConceptNoteGap,
    *,
    previous_question: str,
    passage: str,
) -> None:
    """Record one reviewed accepted passage and keep the original scope.

    The original question is the first scope narrowed and is kept afterward.
    The passage has its markers removed, and an exact duplicate is not added
    again. The mapping is replaced as a whole so JSONB change tracking sees it.
    """
    progress = gap.answer_progress if isinstance(gap.answer_progress, dict) else {}
    passages = [str(item) for item in progress.get("accepted_passages") or ()]
    text = marker_replacement_text(passage)
    if text and text not in passages:
        passages.append(text)
    gap.answer_progress = {
        "original_question": progress.get("original_question") or previous_question,
        "accepted_passages": passages,
    }


def _saved_text(text: str | None) -> str | None:
    """Compare saved answers as trimmed text, where empty means no answers."""
    return (text or "").strip() or None


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


def _restore_dropped_gaps(
    generated: ConceptNoteChapterDraftOutput,
    dropped: list[ConceptNoteGap],
) -> ConceptNoteChapterDraftOutput:
    """Keep a redraft, but put back each unanswered gap it left out.

    Each dropped question is appended to the chapter as its marker and kept in
    the gap list, so the gap stays open and visible instead of losing the
    whole redraft.
    """
    markers = "\n\n".join(f"[Information needed: {gap.question}]" for gap in dropped)
    return ConceptNoteChapterDraftOutput.model_validate(
        {
            "body_markdown": f"{generated.body_markdown.rstrip()}\n\n{markers}",
            "missing_information": [
                *generated.missing_information,
                *(
                    ConceptNoteDraftGapOutput.model_validate(
                        {
                            "field_key": gap.field_key,
                            "question": gap.question,
                            "why_asking": gap.why_asking,
                            "severity": gap.severity,
                            "suggestions": gap.suggestions or [],
                        }
                    )
                    for gap in dropped
                ),
            ],
        }
    )


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
            # A reopened gap is a new scope, so its accepted lineage restarts.
            gap.answer_progress = None
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
    # Only a changed normalized question starts a new specification, so
    # presentation-only redrafts keep the accepted lineage.
    if information_marker_key(gap.question) != information_marker_key(output.question):
        gap.answer_progress = None
    gap.question = output.question
    gap.why_asking = output.why_asking
    gap.severity = output.severity
    gap.suggestions = suggestions
    gap.source_refs = source_refs
    gap.updated_at = datetime.now(UTC)
    return True
