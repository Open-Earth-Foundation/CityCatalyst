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
from app.services.cnb.edit_claims import (
    ClaimDelta,
    claim_words,
    fact_tokens,
)
from app.services.cnb.edit_expansion import (
    PROTECTED_EDIT_PATTERN,
    expand_explicit_global_replacements,
    expand_project_name_opening_replacements,
    is_project_name_first_chapter_request,
)
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
    """Return exact reviewed changes after all deterministic checks pass."""
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
    plan = expand_explicit_global_replacements(request, chapters, plan)
    plan = expand_project_name_opening_replacements(
        chapters,
        plan,
        instructions=[request.instruction, *prior_inputs],
    )
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
    after_bodies = apply_validated_changes(current, changes, affected)
    first_chapter_id = min(
        current.values(), key=lambda chapter: chapter.position
    ).chapter_id
    validate_consistency(
        changes,
        after_bodies,
        instructions=[request.instruction, *prior_inputs],
        first_chapter_id=first_chapter_id,
    )
    ordered = sorted(
        changes,
        key=lambda change: (current[change.chapter_id].position, change.start),
    )
    return bind_consistency_groups(ordered)


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

    delta = ClaimDelta.between(anchored.before, anchored.after)
    if anchored.semantic_support is None:
        raise EditOperationError(
            "invalid_review",
            "The proposal did not receive a complete semantic review.",
            status_code=422,
        )
    if anchored.semantic_support == "preserved" and delta.meaning_changed:
        raise EditOperationError(
            "unsupported_edit",
            "The proposal changed a fact, entity, or commitment during a wording edit.",
            status_code=422,
        )
    factual = (
        anchored.kind == "factual"
        or anchored.semantic_support in {"user", "source"}
        or fills_information_gap
        or delta.meaning_changed
    )
    snapshots = validate_provenance(
        anchored,
        request.instruction,
        run_context,
        factual,
        prior_inputs=prior_inputs,
        delta=delta,
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


def apply_validated_changes(
    chapters: dict[UUID, WorkspaceChapterSnapshot],
    changes: list[EditChange],
    affected: set[UUID],
) -> dict[UUID, str]:
    """Apply replacements in memory and validate resulting chapter structure."""
    after_bodies = {
        chapter_id: chapter.body_markdown or ""
        for chapter_id, chapter in chapters.items()
    }
    changes_by_chapter = {
        chapter_id: [change for change in changes if change.chapter_id == chapter_id]
        for chapter_id in affected
    }
    for chapter_id, chapter_changes in changes_by_chapter.items():
        before = after_bodies[chapter_id]
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
        after_bodies[chapter_id] = after
    return after_bodies


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


def bind_consistency_groups(changes: list[EditChange]) -> list[EditChange]:
    """Join model groups and repeated deterministic factual replacements."""
    parents = list(range(len(changes)))

    def find(index: int) -> int:
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    def union(left: int, right: int) -> None:
        left_root, right_root = find(left), find(right)
        if left_root != right_root:
            parents[right_root] = left_root

    first_by_key: dict[tuple[str, object], int] = {}
    for index, change in enumerate(changes):
        keys: list[tuple[str, object]] = [("group", change.group_id)]
        if change.kind == "factual":
            delta = ClaimDelta.between(change.before, change.after)
            keys.extend(("fact", token) for token in delta.removed_facts)
            keys.append(
                (
                    "replacement",
                    (claim_words(change.before), claim_words(change.after)),
                )
            )
        for key in keys:
            earlier = first_by_key.setdefault(key, index)
            union(earlier, index)

    return [
        change.model_copy(update={"group_id": changes[find(index)].group_id})
        for index, change in enumerate(changes)
    ]


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
    delta: ClaimDelta | None = None,
) -> list[EditSourceSnapshot]:
    """Validate source identity and support for newly stated values."""
    inputs = [instruction, *(prior_inputs or [])]
    source_index = index_sources(context.get("selected_sources", []))
    snapshots: list[EditSourceSnapshot] = []
    supported_text: list[str] = []
    for reference in change.source_refs:
        source = source_index.get(str(reference))
        if source is None:
            raise EditOperationError(
                "invalid_source",
                "The proposal references evidence outside this run.",
                status_code=422,
            )
        snapshots.append(source_snapshot(source))
        supported_text.append(str(source.get("summary", "")))
        supported_text.extend(
            str(excerpt.get("text", "")) for excerpt in source.get("key_excerpts", [])
        )

    if change.user_input_quote is not None:
        if not change.user_input_quote.strip() or not any(
            change.user_input_quote in value for value in inputs
        ):
            raise EditOperationError(
                "invalid_user_input",
                "The proposed factual input was not supplied by the user.",
                status_code=422,
            )
        supported_text.append(change.user_input_quote)
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

    corpus = " ".join(supported_text)
    if not corpus:
        raise EditOperationError(
            "clarification_required",
            "What source or explicit factual value should support this change?",
            status_code=422,
        )
    delta = delta or ClaimDelta.between(change.before, change.after)
    evidence_facts = fact_tokens(corpus)
    if any(
        not any(facts_equivalent(fact, known) for known in evidence_facts)
        for fact in delta.added_facts
    ):
        raise EditOperationError(
            "clarification_required",
            "What evidence supports the new value in this edit?",
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


def facts_equivalent(left: tuple[str, str], right: tuple[str, str]) -> bool:
    """Treat a currency-less value as compatible with the same typed value."""
    return left == right or (left[1] == right[1] and "NUMBER" in {left[0], right[0]})


def validate_consistency(
    changes: list[EditChange],
    after_bodies: dict[UUID, str],
    *,
    instructions: list[str],
    first_chapter_id: UUID,
) -> None:
    """Reject omitted occurrences and contradictory factual replacements."""
    editable_bodies = {
        chapter_id: PROTECTED_EDIT_PATTERN.sub("", body)
        for chapter_id, body in after_bodies.items()
    }
    keep_first_project_name = is_project_name_first_chapter_request(instructions)
    fact_replacements: dict[tuple[str, str], set[tuple[str, str] | None]] = {}
    text_replacements: dict[str, set[str]] = {}

    for change in changes:
        if change.kind != "factual":
            continue
        delta = ClaimDelta.between(change.before, change.after)
        removed = list(delta.removed_facts.elements())
        added = list(delta.added_facts.elements())
        for index, old in enumerate(removed):
            fact_replacements.setdefault(old, set()).add(
                added[index] if index < len(added) else None
            )
        if not removed:
            before, after = claim_words(change.before), claim_words(change.after)
            if before:
                text_replacements.setdefault(before, set()).add(after)
            remaining_bodies = editable_bodies.items()
            if keep_first_project_name and change.start <= 600:
                remaining_bodies = (
                    item for item in remaining_bodies if item[0] != first_chapter_id
                )
            if change.before.strip() and any(
                change.before in body for _, body in remaining_bodies
            ):
                raise EditOperationError(
                    "clarification_required",
                    "The original fact still appears elsewhere. Should those occurrences change too?",
                    status_code=422,
                )

    replacement_sets = [
        *fact_replacements.values(),
        *text_replacements.values(),
    ]
    if any(len(values) > 1 for values in replacement_sets):
        raise EditOperationError(
            "inconsistent_fact",
            "The proposal gives inconsistent replacements for the same fact.",
            status_code=422,
        )

    remaining_facts = {
        token for body in editable_bodies.values() for token in fact_tokens(body)
    }
    for old in fact_replacements:
        equivalent_number = ("NUMBER", old[1])
        if old in remaining_facts or (
            old[0] != "NUMBER" and equivalent_number in remaining_facts
        ):
            raise EditOperationError(
                "clarification_required",
                "The old value also appears elsewhere in the document. Include those "
                "occurrences or clarify which facts should change.",
                status_code=422,
            )
