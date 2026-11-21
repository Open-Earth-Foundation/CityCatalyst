"""Validate anchored Concept Note edits against document and provenance rules."""

from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Sequence
from typing import Any
from uuid import UUID, uuid4

from app.models.cnb.concept_note_edits import (
    EDIT_CONTEXT_LABELS,
    EditChange,
    EditContextSnapshot,
    EditPlanOutput,
    EditProposalRequest,
    EditProposalResponse,
    EditScope,
    EditSourceSnapshot,
    GapEditBinding,
    PlannedTextChange,
)
from app.persistence.concept_notes.edits import EditOperationError, replace_anchors
from app.persistence.concept_notes.workspace_snapshots import (
    WorkspaceChapterSnapshot,
    WorkspaceGapSnapshot,
)
from app.utils.cnb_gap_edit import (
    GapEditError,
    MarkerTransition,
    estimate_anchor_problem,
    gap_answer_digest,
    intersects_span,
    marker_edit_shape,
    occurrence_spans,
    unambiguous_span,
    validate_marker_transitions,
)
from app.utils.cnb_information_markers import (
    information_marker_key,
    information_needed_markers,
    marker_replacement_text,
)


def bind_answer_gap(
    request: EditProposalRequest, chapters: list[WorkspaceChapterSnapshot]
) -> list[WorkspaceChapterSnapshot]:
    """Check that a gap-form answer names the open gap version it answers.

    The binding only tells the planner which question the form answered. It
    neither hides gaps nor implies a complete answer; the reviewed transition
    decides what each change covers.
    """
    scope = request.scope
    if scope.gap_id is None:
        return chapters
    gap = next(
        (
            gap
            for chapter in chapters
            if chapter.chapter_id == scope.focused_chapter_id
            for gap in chapter.gaps
            if gap.gap_id == scope.gap_id
        ),
        None,
    )
    if gap is None or gap.state not in {"open", "caveat"} or (
        gap.version != scope.gap_version
    ):
        raise EditOperationError(
            "gap_changed",
            "This gap was answered or changed. Reopen it to answer its current version.",
        )
    return chapters


def validate_edit_plan(
    request: EditProposalRequest,
    chapters: list[WorkspaceChapterSnapshot],
    plan: EditPlanOutput,
    run_context: dict[str, Any] | None = None,
    *,
    prior_proposal: EditProposalResponse | None = None,
    recent_messages: list[dict[str, str]] | None = None,
) -> list[EditChange]:
    """Check identities and document integrity without reinterpreting LLM edits."""
    if plan.intent != "edit":
        raise EditOperationError(
            "not_edit_request",
            "This request does not contain a document edit.",
            status_code=422,
        )

    current = {chapter.chapter_id: chapter for chapter in chapters}
    focused_id = request.scope.focused_chapter_id
    if focused_id is not None and focused_id not in current:
        raise EditOperationError(
            "invalid_target",
            "The focused chapter is no longer available.",
            status_code=422,
        )

    prior_inputs = [
        *recent_user_inputs(recent_messages),
        *prior_user_inputs(prior_proposal),
    ]
    affected = {change.chapter_id for change in plan.changes}
    if affected - set(current):
        raise EditOperationError(
            "invalid_target",
            "The planner selected a chapter outside this draft.",
            status_code=422,
        )

    changes = [
        validated_change(
            change,
            current,
            request=request,
            run_context=run_context or {},
            prior_inputs=prior_inputs,
        )
        for change in plan.changes
    ]
    changes = [with_gap_group(change) for change in changes]
    validate_document_integrity(current, changes, affected)
    return sorted(
        changes,
        key=lambda change: (current[change.chapter_id].position, change.start),
    )


def validated_change(
    change: PlannedTextChange,
    chapters: dict[UUID, WorkspaceChapterSnapshot],
    *,
    request: EditProposalRequest,
    run_context: dict[str, Any],
    prior_inputs: list[str],
) -> EditChange:
    """Bind one planned replacement to its current chapter and provenance."""
    chapter = chapters.get(change.chapter_id)
    if (
        chapter is None
        or chapter.revision_number is None
        or chapter.body_markdown is None
        or chapter.user_locked
    ):
        raise EditOperationError(
            "invalid_target",
            "The selected chapter is unavailable or locked.",
            status_code=422,
        )

    anchored = anchor_change(change, chapter.body_markdown)
    bindings = gap_bindings_for_change(anchored, chapter, request.scope)
    if anchored.semantic_support is None:
        raise EditOperationError(
            "invalid_review",
            "The proposal did not receive a complete semantic review.",
            status_code=422,
        )
    # A complete confirmation aimed at a gap whose recorded estimate is gone cannot bind.
    if (
        anchored.reviewed_gap_coverage == "complete"
        and not bindings
        and estimate_missing_for_scope(request.scope, chapter)
    ):
        raise EditOperationError(
            "invalid_target",
            "The estimate recorded for this gap is no longer in the draft. Reopen the gap to answer its current text.",
            status_code=422,
        )
    # Only the independent review's coverage can match the transition's shape.
    if (anchored.reviewed_gap_coverage or "none") != expected_gap_coverage(bindings):
        raise EditOperationError(
            "invalid_review",
            "The proposal did not receive a semantic review matching its gap transition.",
            status_code=422,
        )
    factual = (
        anchored.kind == "factual"
        or anchored.estimate
        or anchored.semantic_support in {"user", "source", "context"}
        or bool(bindings)
    )
    snapshots, context_snapshots = validate_provenance(
        anchored,
        request.instruction,
        run_context,
        factual,
        prior_inputs=[*prior_inputs, *gap_evidence_inputs(bindings, chapter)],
    )
    return EditChange(
        **{
            **anchored.model_dump(),
            "kind": "factual" if factual else "wording",
        },
        change_id=uuid4(),
        chapter_title=chapter.title,
        base_revision=chapter.revision_number,
        source_snapshots=snapshots,
        context_snapshots=context_snapshots,
        gap_bindings=bindings,
    )


def validate_document_integrity(
    chapters: dict[UUID, WorkspaceChapterSnapshot],
    changes: Sequence[PlannedTextChange],
    affected: set[UUID],
) -> None:
    """Apply replacements in memory and validate resulting chapter structure."""
    changes_by_chapter = {
        chapter_id: [change for change in changes if change.chapter_id == chapter_id]
        for chapter_id in affected
    }
    for chapter_id, chapter_changes in changes_by_chapter.items():
        before = chapters[chapter_id].body_markdown or ""
        after = replace_anchors(before, chapter_changes)
        try:
            validate_marker_transitions(before, after, chapter_changes)
        except GapEditError as error:
            raise EditOperationError(
                "marker_changed", str(error), status_code=422
            ) from None
        if estimate_anchor_problem(
            before,
            after,
            [
                marker_replacement_text(change.after)
                for change in chapter_changes
                if change.estimate
            ],
            caveat_estimates(chapters[chapter_id]),
        ):
            raise EditOperationError(
                "ambiguous_gap",
                "Keep one uniquely identifiable estimate passage for this gap. Remove identical repetitions and resubmit the candidate.",
                status_code=422,
            )
        heading_pattern = r"^#{1,6} .+$"
        if re.findall(heading_pattern, before, re.MULTILINE) != re.findall(
            heading_pattern, after, re.MULTILINE
        ):
            raise EditOperationError(
                "structure_changed",
                "Use a structural proposal or the Structure tab to rename a chapter. Internal template subheadings are protected from body-text replacements.",
                status_code=422,
            )


def gap_bindings_for_change(
    change: PlannedTextChange,
    chapter: WorkspaceChapterSnapshot,
    scope: EditScope,
) -> list[GapEditBinding]:
    """Derive the exact gap identities a change transitions, from the current snapshot.

    A marker transition binds to its unique open gap with the same question key.
    A marker-free factual change binds to the caveat estimates it overlaps.
    """
    try:
        transition = marker_edit_shape(change.before, change.after)
    except GapEditError as error:
        raise EditOperationError(
            "marker_changed", str(error), status_code=422
        ) from None
    if transition is not None:
        return [marker_binding(transition, chapter)]
    return estimate_bindings(change, chapter, scope)


def marker_binding(
    transition: MarkerTransition, chapter: WorkspaceChapterSnapshot
) -> GapEditBinding:
    """Bind a marker transition to one open gap; a narrowing needs an unclaimed question."""
    key = information_marker_key(transition.old_marker)
    matches = [
        gap
        for gap in chapter.gaps
        if gap.state == "open" and information_marker_key(gap.question) == key
    ]
    if len(matches) != 1:
        raise EditOperationError(
            "marker_changed",
            "This missing-information marker does not match exactly one open gap. Read the chapter again.",
            status_code=422,
        )
    gap = matches[0]
    if transition.mode == "narrow":
        new_key = information_marker_key(transition.new_marker or "")
        claimed = any(
            information_marker_key(other.question) == new_key for other in chapter.gaps
        ) or any(
            information_marker_key(marker) == new_key
            for marker in information_needed_markers(chapter.body_markdown or "")
        )
        if claimed:
            raise EditOperationError(
                "marker_changed",
                "The narrowed question already has a gap or marker in this chapter.",
                status_code=422,
            )
    return gap_binding(gap, transition.mode)


def estimate_bindings(
    change: PlannedTextChange,
    chapter: WorkspaceChapterSnapshot,
    scope: EditScope,
) -> list[GapEditBinding]:
    """Bind a factual change to the caveat estimates its text overlaps.

    Duplicate caveats with the same question and estimate bind together. When
    estimates for different questions overlap, only the form's gap may bind.
    """
    body = chapter.body_markdown or ""
    start, end = change.start, change.start + len(change.before)
    # A repeated estimate cannot be bound, so no change may touch one copy silently.
    for gap in chapter.gaps:
        if gap.state != "caveat" or gap.resolution is None:
            continue
        spans = occurrence_spans(body, gap.resolution.answer or "")
        if len(spans) > 1 and any(intersects_span(span, start, end) for span in spans):
            raise EditOperationError(
                "ambiguous_gap",
                "This passage repeats a stored estimate. Keep one uniquely identifiable copy of it and resubmit the change.",
                status_code=422,
            )
    if change.kind != "factual" or not change.before.strip():
        return []
    overlapping = []
    for gap in chapter.gaps:
        if gap.state != "caveat" or gap.resolution is None:
            continue
        span = unambiguous_span(body, gap.resolution.answer or "")
        if span is not None and intersects_span(span, start, end):
            overlapping.append(gap)
    if not overlapping:
        return []
    keys = {information_marker_key(gap.question) for gap in overlapping}
    if scope.gap_id is not None and any(
        gap.gap_id == scope.gap_id for gap in overlapping
    ):
        chosen = information_marker_key(
            next(gap for gap in overlapping if gap.gap_id == scope.gap_id).question
        )
    elif len(keys) == 1:
        chosen = keys.pop()
    else:
        raise EditOperationError(
            "ambiguous_gap",
            "This edit matches the estimates for several gaps. Answer one gap at a time.",
            status_code=422,
        )
    return [
        gap_binding(gap, "confirm_estimate")
        for gap in overlapping
        if information_marker_key(gap.question) == chosen
    ]


def caveat_estimates(chapter: WorkspaceChapterSnapshot) -> list[str]:
    """Return the estimate text each caveat gap in the chapter currently states."""
    return [
        gap.resolution.answer
        for gap in chapter.gaps
        if gap.state == "caveat" and gap.resolution and gap.resolution.answer
    ]


def estimate_missing_for_scope(
    scope: EditScope, chapter: WorkspaceChapterSnapshot
) -> bool:
    """Return whether the form's caveat gap no longer has its recorded estimate in the chapter."""
    if scope.gap_id is None or scope.focused_chapter_id != chapter.chapter_id:
        return False
    body = chapter.body_markdown or ""
    return any(
        gap.gap_id == scope.gap_id
        and gap.state == "caveat"
        and gap.resolution is not None
        and gap.resolution.answer
        and not occurrence_spans(body, gap.resolution.answer)
        for gap in chapter.gaps
    )


def gap_binding(gap: WorkspaceGapSnapshot, mode: str) -> GapEditBinding:
    """Stamp one gap's identity, version and current saved-answer digest."""
    return GapEditBinding(
        gap_id=gap.gap_id,
        gap_version=gap.version,
        mode=mode,
        saved_answers_digest=gap_answer_digest(gap.answered_so_far),
    )


def expected_gap_coverage(bindings: list[GapEditBinding]) -> str:
    """Name the coverage a reviewer must report for a derived transition."""
    if not bindings:
        return "none"
    if any(binding.mode == "narrow" for binding in bindings):
        return "partial"
    return "complete"


def gap_evidence_inputs(
    bindings: list[GapEditBinding], chapter: WorkspaceChapterSnapshot
) -> list[str]:
    """Return human and accepted evidence for the bound gaps only, never other gaps."""
    gaps = {gap.gap_id: gap for gap in chapter.gaps}
    values: list[str] = []
    for binding in bindings:
        gap = gaps.get(binding.gap_id)
        if gap is None:
            continue
        values.extend(
            value for value in (gap.answered_so_far, *gap.accepted_passages) if value
        )
    return values


def with_gap_group(change: EditChange) -> EditChange:
    """Give each gap's transitions their own consistency group, never the planner's."""
    if not change.gap_bindings:
        return change
    gap_id = min(binding.gap_id for binding in change.gap_bindings)
    return change.model_copy(update={"group_id": f"gap-{gap_id.hex[:20]}"})


def anchor_change(change: PlannedTextChange, body: str) -> PlannedTextChange:
    """Recover a model offset only from one unique exact quote in its chapter."""
    start = change.start
    if body[start : start + len(change.before)] != change.before:
        if body.count(change.before) != 1:
            raise EditOperationError(
                "invalid_anchor",
                "A proposed passage does not have a unique exact draft anchor.",
                status_code=422,
            )
        start = body.index(change.before)
    return change.model_copy(update={"start": start})


def prior_user_inputs(proposal: EditProposalResponse | None) -> list[str]:
    """Carry verified human instructions and quotes, never proposed model text."""
    if proposal is None:
        return []
    values = [
        proposal.instruction,
        *[
            change.user_input_quote
            for change in proposal.changes
            if change.user_input_quote
        ],
    ]
    return list(dict.fromkeys(values))


def recent_user_inputs(messages: list[dict[str, str]] | None) -> list[str]:
    """Return bounded human chat text; assistant messages never authorize edits."""
    return list(
        dict.fromkeys(
            message["content"]
            for message in (messages or [])[-3:]
            if message.get("role") == "user"
            and isinstance(message.get("content"), str)
            and message["content"].strip()
        )
    )


def validate_provenance(
    change: PlannedTextChange,
    instruction: str,
    context: dict[str, Any],
    factual: bool,
    *,
    prior_inputs: list[str] | None = None,
) -> tuple[list[EditSourceSnapshot], list[EditContextSnapshot]]:
    """Verify provenance identities and exact user quotes; the LLM judges support."""
    inputs = [instruction, *(prior_inputs or [])]
    source_index = index_sources(context.get("selected_sources", []))
    snapshots: list[EditSourceSnapshot] = []
    for reference in change.source_refs:
        source = source_index.get(str(reference))
        if source is None:
            raise EditOperationError(
                "invalid_source",
                "The proposal references evidence outside this run.",
                status_code=422,
            )
        snapshots.append(source_snapshot(source))

    # Run context counts as evidence only when this run actually holds it.
    context_snapshots: list[EditContextSnapshot] = []
    for section in dict.fromkeys(change.context_refs):
        snapshot = context_snapshot(context, section)
        if snapshot is None:
            raise EditOperationError(
                "invalid_context",
                "The proposal cites run context that this concept note does not have.",
                status_code=422,
            )
        context_snapshots.append(snapshot)

    if change.user_input_quote is not None and (
        not change.user_input_quote.strip()
        or not any(change.user_input_quote in value for value in inputs)
    ):
        raise EditOperationError(
            "invalid_user_input",
            "The proposed factual input was not supplied by the user.",
            status_code=422,
        )
    if not factual:
        return snapshots, context_snapshots

    if change.semantic_support == "user" and not change.user_input_quote:
        raise EditOperationError(
            "invalid_user_input",
            "The reviewed edit has no user instruction quote.",
            status_code=422,
        )
    if change.semantic_support == "source" and not snapshots:
        raise EditOperationError(
            "invalid_source",
            "The reviewed edit has no selected source.",
            status_code=422,
        )

    if change.semantic_support == "context" and not context_snapshots:
        raise EditOperationError(
            "invalid_context",
            "The reviewed edit has no cited run context.",
            status_code=422,
        )

    if not (snapshots or context_snapshots or change.user_input_quote):
        raise EditOperationError(
            "clarification_required",
            "What source or explicit factual value should support this change?",
            status_code=422,
        )
    return snapshots, context_snapshots


def context_snapshot(
    context: dict[str, Any], section: str
) -> EditContextSnapshot | None:
    """Fingerprint one non-empty run context section so later changes mark edits stale."""
    value = (
        context.get("manual_population")
        if section == "manual_population"
        else (context.get("cc_context") or {}).get(section)
    )
    if not value:
        return None
    canonical = json.dumps(value, sort_keys=True, separators=(",", ":"))
    return EditContextSnapshot(
        section=section,
        label=EDIT_CONTEXT_LABELS[section],
        sha256=hashlib.sha256(canonical.encode()).hexdigest(),
    )


def index_sources(sources: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Resolve only one-based model indices; labels and upload IDs are not references."""
    return {str(index): source for index, source in enumerate(sources, start=1)}


def source_snapshot(source: dict[str, Any]) -> EditSourceSnapshot:
    """Build an immutable source identity or return a controlled edit error."""
    try:
        return EditSourceSnapshot.model_validate(
            {key: source[key] for key in ("upload_id", "source_label", "sha256")}
        )
    except (KeyError, ValueError):
        raise EditOperationError(
            "invalid_source",
            "The selected source has no verified immutable identity.",
            status_code=422,
        ) from None
