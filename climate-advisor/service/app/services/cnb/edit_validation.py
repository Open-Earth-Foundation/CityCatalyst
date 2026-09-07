"""Validate anchored Concept Note edits against document and provenance rules."""

from __future__ import annotations

import re
from typing import Any
from uuid import UUID, uuid4

from app.models.cnb.concept_note_edits import (
    EditChange,
    EditPlanOutput,
    EditProposalRequest,
    EditProposalResponse,
    EditSourceSnapshot,
    PlannedTextChange,
)
from app.persistence.concept_notes.edits import EditOperationError, replace_anchors
from app.persistence.concept_notes.workspace import WorkspaceChapterSnapshot
from app.utils.cnb_information_markers import (
    information_marker_key,
    information_needed_markers,
    marker_replacement_text,
    removed_information_markers,
)


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
    fills_information_gap = is_information_gap_fill(anchored, chapter)
    if (
        removed_information_markers(anchored.before, anchored.after)
        and not fills_information_gap
    ):
        raise EditOperationError(
            "marker_changed",
            "Replace a missing-information marker only with content that fills its matching open gap.",
            status_code=422,
        )

    if anchored.semantic_support is None:
        raise EditOperationError(
            "invalid_review",
            "The proposal did not receive a complete semantic review.",
            status_code=422,
        )
    factual = (
        anchored.kind == "factual"
        or anchored.semantic_support in {"user", "source"}
        or fills_information_gap
    )
    snapshots = validate_provenance(
        anchored,
        request.instruction,
        run_context,
        factual,
        prior_inputs=prior_inputs,
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
    )


def validate_document_integrity(
    chapters: dict[UUID, WorkspaceChapterSnapshot],
    changes: list[EditChange],
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
        if not valid_information_marker_result(
            chapters[chapter_id], before, after, chapter_changes
        ):
            raise EditOperationError(
                "marker_changed",
                "Replace a missing-information marker only with content that fills its matching open gap.",
                status_code=422,
            )
        heading_pattern = r"^#{1,6} .+$"
        if re.findall(heading_pattern, before, re.MULTILINE) != re.findall(
            heading_pattern, after, re.MULTILINE
        ):
            raise EditOperationError(
                "structure_changed",
                "Edits must preserve template headings.",
                status_code=422,
            )


def is_information_gap_fill(
    change: PlannedTextChange,
    chapter: WorkspaceChapterSnapshot,
) -> bool:
    """Allow replacement only when it supplies a matching open gap."""
    removed = removed_information_markers(change.before, change.after)
    if not removed or not marker_replacement_text(change.after):
        return False
    if information_needed_markers(change.after):
        return False
    open_gap_keys = {
        information_marker_key(gap.question)
        for gap in chapter.gaps
        if gap.state in {"open", "caveat"}
    }
    return all(information_marker_key(marker) in open_gap_keys for marker in removed)


def valid_information_marker_result(
    chapter: WorkspaceChapterSnapshot,
    before: str,
    after: str,
    changes: list[EditChange],
) -> bool:
    """Preserve marker order while permitting validated gap-filling removals."""
    before_markers = information_needed_markers(before)
    next_before = 0
    for marker in information_needed_markers(after):
        while (
            next_before < len(before_markers) and before_markers[next_before] != marker
        ):
            next_before += 1
        if next_before == len(before_markers):
            return False
        next_before += 1
    return all(
        any(
            marker in change.before
            and marker not in change.after
            and is_information_gap_fill(change, chapter)
            for change in changes
        )
        for marker in removed_information_markers(before, after)
    )


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
) -> list[EditSourceSnapshot]:
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

    if change.user_input_quote is not None:
        if not change.user_input_quote.strip() or not any(
            change.user_input_quote in value for value in inputs
        ):
            raise EditOperationError(
                "invalid_user_input",
                "The proposed factual input was not supplied by the user.",
                status_code=422,
            )
    if not factual:
        return snapshots

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

    if not (snapshots or change.user_input_quote):
        raise EditOperationError(
            "clarification_required",
            "What source or explicit factual value should support this change?",
            status_code=422,
        )
    return snapshots


def index_sources(sources: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Index selected sources once by both immutable ID and visible label."""
    result = {}
    for source in sources:
        for key in (source.get("upload_id"), source.get("source_label")):
            if key is not None:
                result[str(key)] = source
    return result


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
