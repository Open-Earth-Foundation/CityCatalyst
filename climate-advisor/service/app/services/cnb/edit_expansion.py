"""Deterministically expand explicit repeated Concept Note edits."""

from __future__ import annotations

import re
from collections.abc import Iterable, Iterator

from app.models.cnb.concept_note_edits import (
    EditPlanOutput,
    EditProposalRequest,
    PlannedTextChange,
)
from app.persistence.concept_notes.edits import EditOperationError
from app.persistence.concept_notes.workspace import WorkspaceChapterSnapshot

PROTECTED_EDIT_PATTERN = re.compile(
    r"\[Information needed:[^\]]*\]|^#{1,6} .+$", re.MULTILINE
)
PROJECT_NAME_TARGET_PATTERN = re.compile(
    r"\b(?:project(?:'s)?\s+(?:full\s+)?(?:name|title)|"
    r"(?:name|title)\s+of\s+(?:the\s+)?project)\b",
    re.IGNORECASE,
)
PROJECT_NAME_REMOVAL_PATTERN = re.compile(
    r"\b(?:remove|delete|omit|drop|replace|rewrite|change|"
    r"neutral(?:ize|ise|\s+(?:wording|openings?))|"
    r"get\s+rid\s+(?:of|off)|(?:do\s+not|don't|not)\s+"
    r"(?:have|use|repeat|include))\b",
    re.IGNORECASE,
)
FIRST_CHAPTER_EXCEPTION_PATTERN = re.compile(
    r"\b(?:except|besides|other\s+than)\s+(?:the\s+)?(?:first|chapter\s*1)\b|"
    r"\bonly\s+(?:in|at)\s+(?:the\s+)?(?:first|chapter\s*1)\b|"
    r"\b(?:keep|retain)\b[^.!?\n]{0,120}\b(?:first\s+chapter|chapter\s*1)\b|"
    r"\b(?:first\s+chapter|chapter\s*1)\b[^.!?\n]{0,120}\b(?:keep|retain)s?\b",
    re.IGNORECASE,
)


def is_project_name_first_chapter_request(instructions: list[str]) -> bool:
    """Recognize requests to neutralize later openings but keep Chapter 1."""
    return any(
        PROJECT_NAME_TARGET_PATTERN.search(instruction)
        and PROJECT_NAME_REMOVAL_PATTERN.search(instruction)
        and FIRST_CHAPTER_EXCEPTION_PATTERN.search(instruction)
        for instruction in instructions
    )


def expand_explicit_global_replacements(
    request: EditProposalRequest,
    chapters: list[WorkspaceChapterSnapshot],
    plan: EditPlanOutput,
) -> EditPlanOutput:
    """Complete literal all-occurrence requests without trusting model offsets."""
    if plan.intent != "edit" or not re.search(
        r"\b(?:all|each|every|everywhere|throughout)\b",
        request.instruction,
        re.IGNORECASE,
    ):
        return plan

    pairs: dict[tuple[str, str], PlannedTextChange] = {}
    for change in plan.changes:
        if change.before in request.instruction and change.after in request.instruction:
            pairs.setdefault((change.before, change.after), change)
    if not pairs:
        return plan

    retained = [
        change for change in plan.changes if (change.before, change.after) not in pairs
    ]
    expanded = list(retained)
    for (before, after), exemplar in pairs.items():
        expanded.extend(
            replacements_for_occurrences(
                chapters,
                exemplar,
                before=before,
                after=after,
                user_input_quote=request.instruction,
                existing=retained,
            )
        )
    return with_expanded_changes(plan, expanded)


def expand_project_name_opening_replacements(
    chapters: list[WorkspaceChapterSnapshot],
    plan: EditPlanOutput,
    *,
    instructions: list[str],
) -> EditPlanOutput:
    """Fill omitted later-chapter openings from the model's chosen replacement."""
    if plan.intent != "edit" or not is_project_name_first_chapter_request(instructions):
        return plan

    later_chapters = sorted(chapters, key=lambda chapter: chapter.position)[1:]
    later_ids = {chapter.chapter_id for chapter in later_chapters}
    candidates = [
        change
        for change in plan.changes
        if change.chapter_id in later_ids
        and change.start <= 600
        and len(change.before.strip()) >= 12
    ]
    if not candidates:
        return plan

    exemplar = candidates[0]
    additions = replacements_for_occurrences(
        later_chapters,
        exemplar,
        before=exemplar.before,
        after=exemplar.after,
        limit=600,
        existing=plan.changes,
    )
    return with_expanded_changes(plan, [*plan.changes, *additions])


def replacements_for_occurrences(
    chapters: Iterable[WorkspaceChapterSnapshot],
    exemplar: PlannedTextChange,
    *,
    before: str,
    after: str,
    limit: int | None = None,
    user_input_quote: str | None = None,
    existing: list[PlannedTextChange] | None = None,
) -> list[PlannedTextChange]:
    """Copy one reviewed replacement to every allowed exact occurrence."""
    replacements = []
    for chapter in chapters:
        for start in literal_occurrences(chapter, before, limit=limit):
            if any(
                change.chapter_id == chapter.chapter_id
                and change.start < start + len(before)
                and change.start + len(change.before) > start
                for change in existing or []
            ):
                continue
            update = {
                "chapter_id": chapter.chapter_id,
                "start": start,
                "before": before,
                "after": after,
            }
            if user_input_quote is not None:
                update["user_input_quote"] = user_input_quote
            replacements.append(exemplar.model_copy(update=update))
    return replacements


def literal_occurrences(
    chapter: WorkspaceChapterSnapshot,
    before: str,
    *,
    limit: int | None = None,
) -> Iterator[int]:
    """Yield exact anchors outside locked text and protected markup."""
    if chapter.user_locked or not chapter.body_markdown or not before:
        return
    body = chapter.body_markdown[:limit]
    protected = [match.span() for match in PROTECTED_EDIT_PATTERN.finditer(body)]
    start = 0
    while (found := body.find(before, start)) >= 0:
        start = found + len(before)
        if not any(found < end and start > begin for begin, end in protected):
            yield found


def with_expanded_changes(
    plan: EditPlanOutput,
    expanded: list[PlannedTextChange],
) -> EditPlanOutput:
    """Apply one shared document-wide expansion limit."""
    if len(expanded) > 100:
        raise EditOperationError(
            "context_limit",
            "This request affects more than 100 exact passages. Split it into smaller edits.",
            status_code=422,
        )
    return plan.model_copy(update={"changes": expanded})
