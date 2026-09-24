"""Snapshot-bound search and replacement proposals; never write draft content."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from app.models.cnb.concept_note_edits import (
    DraftReplacement,
    EditNotice,
    EditPlanOutput,
    EditProposalRequest,
    PlannedTextChange,
)
from app.persistence.concept_notes.edits import EditOperationError
from app.persistence.concept_notes.workspace import WorkspaceChapterSnapshot
from app.services.cnb.edit_validation import (
    is_information_gap_fill,
    validate_document_integrity,
    validate_provenance,
)
from app.utils.cnb_information_markers import (
    INFORMATION_NEEDED_PATTERN,
    removed_information_markers,
)


@dataclass(frozen=True)
class DraftMatch:
    """An occurrence tied to the immutable snapshot used for this proposal."""

    match_id: str
    chapter: WorkspaceChapterSnapshot
    start: int
    text: str


class DraftEditSession:
    """Let an agent select exact matches while Python owns offsets and guards."""

    def __init__(
        self,
        request: EditProposalRequest,
        chapters: list[WorkspaceChapterSnapshot],
        run_context: dict[str, Any],
        prior_inputs: list[str],
        *,
        max_searches: int,
    ) -> None:
        """Capture one run's revisions and human provenance for an isolated loop."""
        self.request = request
        self.chapters = {chapter.position: chapter for chapter in chapters}
        self.run_context = run_context
        self.prior_inputs = prior_inputs
        self.max_searches = max_searches
        self.searches: dict[str, list[DraftMatch]] = {}
        self.plan: EditPlanOutput | None = None

    def search_draft(
        self, text: str, chapter_positions: list[int] | None = None
    ) -> dict[str, Any]:
        """Find literal text and return occurrence IDs, context, and protection flags."""
        # Reject invalid requests before consuming the shared proposal search budget.
        if not text or len(text) > 50_000:
            return {
                "ok": False,
                "code": "invalid_search",
                "message": "Search for 1-50000 literal characters.",
            }
        if len(self.searches) >= self.max_searches:
            return {
                "ok": False,
                "code": "context_limit",
                "message": "Too many searches in one proposal.",
            }
        # Resolve the requested chapter scope before assigning stable match identifiers.
        positions = (
            list(self.chapters) if chapter_positions is None else chapter_positions
        )
        if not positions or set(positions) - self.chapters.keys():
            return {
                "ok": False,
                "code": "invalid_target",
                "message": "Use chapter positions from the catalogue.",
            }

        # IDs address server-owned matches, never model-computed character positions.
        search_id = f"search-{len(self.searches) + 1}"
        matches = []
        for position in sorted(set(positions)):
            chapter = self.chapters[position]
            body = chapter.body_markdown or ""
            start = body.find(text)
            while start >= 0:
                matches.append(
                    DraftMatch(f"{search_id}-{len(matches) + 1}", chapter, start, text)
                )
                start = body.find(text, start + len(text))
        self.searches[search_id] = matches
        return {
            "ok": True,
            "search_id": search_id,
            "total": len(matches),
            "truncated": len(matches) > 100,
            "matches": [self.describe_match(match) for match in matches[:100]],
        }

    def describe_match(self, match: DraftMatch) -> dict[str, Any]:
        """Return bounded context without exposing internal document identities."""
        body = match.chapter.body_markdown or ""
        return {
            "match_id": match.match_id,
            "chapter_position": match.chapter.position,
            "chapter_title": match.chapter.title,
            "revision": match.chapter.revision_number,
            "context": body[
                max(0, match.start - 100) : match.start + len(match.text) + 100
            ],
            "protected": protected_reason(match.chapter, match.start, match.text),
        }

    def propose_edits(self, replacements: list[DraftReplacement]) -> dict[str, Any]:
        """Validate a complete candidate atomically; failed attempts are repairable."""
        # Never let a rejected correction accidentally finalize an older candidate.
        self.plan = None
        changes: list[PlannedTextChange] = []
        exclusions: dict[str, set[tuple[int, int, str]]] = {}
        if not replacements or len(replacements) > 100:
            return {
                "ok": False,
                "code": "invalid_edit",
                "message": "Provide 1-100 replacements for the complete proposal.",
            }
        for index, replacement in enumerate(replacements):
            try:
                matches = self.select_matches(replacement)
                for match in matches:
                    change = resolve_change(match, replacement)
                    reason = protected_reason(
                        match.chapter, change.start, change.before
                    )
                    if reason == "protected_markers" and is_information_gap_fill(
                        change, match.chapter
                    ):
                        reason = None
                    if reason:
                        if not replacement.replace_all:
                            raise EditOperationError(
                                reason,
                                "Use propose_structure to rename a chapter title. Internal template subheadings cannot be changed through text replacements."
                                if reason == "template_headings"
                                else "This match is protected. Preserve it or fill the complete matching information gap.",
                            )
                        exclusions.setdefault(reason, set()).add(
                            (match.chapter.position, match.start, match.text)
                        )
                        continue
                    validate_provenance(
                        change,
                        self.request.instruction,
                        self.run_context,
                        change.kind == "factual",
                        prior_inputs=self.prior_inputs,
                    )
                    changes.append(change)
                if len(changes) > 100:
                    raise EditOperationError(
                        "context_limit",
                        "This proposal exceeds 100 changes; narrow the search scope.",
                    )
            except (EditOperationError, ValueError) as error:
                return {
                    "ok": False,
                    "code": getattr(error, "code", "invalid_edit"),
                    "operation_index": index,
                    "message": str(error),
                    "recovery": "Read the affected chapter or search with more context, then submit the complete corrected proposal.",
                }

        # Check overlaps, template structure, and gap integrity before model review.
        notices = [
            EditNotice(code=code, count=len(items))
            for code, items in exclusions.items()
        ]
        if not changes:
            return {
                "ok": False,
                "code": "no_editable_matches",
                "message": "All selected matches are protected; no draft changes were proposed.",
                "notices": [notice.model_dump() for notice in notices],
            }
        try:
            validate_document_integrity(
                {chapter.chapter_id: chapter for chapter in self.chapters.values()},
                changes,
                {change.chapter_id for change in changes},
            )
        except EditOperationError as error:
            return {
                "ok": False,
                "code": error.code,
                "message": str(error),
                "recovery": "Preserve headings and markers and remove overlapping replacements, then resubmit the complete proposal.",
            }
        self.plan = EditPlanOutput(intent="edit", changes=changes, notices=notices)
        return {
            "ok": True,
            "changes": len(changes),
            "chapters": len({change.chapter_id for change in changes}),
            "notices": [notice.model_dump() for notice in notices],
        }

    def select_matches(self, replacement: DraftReplacement) -> list[DraftMatch]:
        """Reject unknown or ambiguous selections instead of guessing an occurrence."""
        matches = self.searches.get(replacement.search_id)
        if matches is None:
            raise EditOperationError(
                "invalid_search",
                "Search the current draft first and use its search_id.",
            )
        if not matches:
            raise EditOperationError(
                "no_matches",
                "No exact match. Read the chapter and search its actual text.",
            )
        if replacement.replace_all:
            if replacement.match_ids:
                raise EditOperationError(
                    "invalid_selection", "Choose replace_all or match_ids, not both."
                )
            return matches
        if replacement.match_ids:
            ids = set(replacement.match_ids)
            selected = [match for match in matches if match.match_id in ids]
            if len(ids) != len(replacement.match_ids) or len(selected) != len(ids):
                raise EditOperationError(
                    "invalid_selection",
                    "Use distinct match_ids from this search result.",
                )
            return selected
        if len(matches) != 1:
            raise EditOperationError(
                "ambiguous_match",
                f"Found {len(matches)} matches. Supply match_ids, more search context, or explicit replace_all.",
            )
        return matches


def protected_reason(
    chapter: WorkspaceChapterSnapshot, start: int, text: str
) -> str | None:
    """Identify locked content and structural spans intersecting a replacement."""
    if chapter.user_locked:
        return "locked_chapters"
    body = chapter.body_markdown or ""
    end = start + len(text)
    for marker in INFORMATION_NEEDED_PATTERN.finditer(body):
        if start < marker.end() and end > marker.start():
            return "protected_markers"
    for heading in re.finditer(r"^#{1,6} .+$", body, re.MULTILINE):
        if start < heading.end() and end > heading.start():
            return "template_headings"
    return None


def resolve_change(
    match: DraftMatch, replacement: DraftReplacement
) -> PlannedTextChange:
    """Compute the smallest changed span, keeping complete gap-fill anchors intact."""
    before, after = match.text, replacement.replacement
    if before == after:
        raise EditOperationError(
            "no_change", "The replacement must differ from the matched text."
        )
    start = match.start
    if not removed_information_markers(before, after):
        # Context is for matching; unchanged context does not belong in the inline diff.
        prefix = 0
        while prefix < min(len(before), len(after)) and before[prefix] == after[prefix]:
            prefix += 1
        suffix = 0
        while (
            suffix < min(len(before), len(after)) - prefix
            and before[-suffix - 1] == after[-suffix - 1]
        ):
            suffix += 1
        # Keep complete words/numbers readable in the review, even with shared letters.
        while (
            prefix
            and before[prefix - 1].isalnum()
            and (
                before[prefix : prefix + 1].isalnum()
                or after[prefix : prefix + 1].isalnum()
            )
        ):
            prefix -= 1
        while (
            suffix
            and before[-suffix].isalnum()
            and (
                before[-suffix - 1 : -suffix].isalnum()
                or after[-suffix - 1 : -suffix].isalnum()
            )
        ):
            suffix -= 1
        # The persisted contract requires a nonempty before anchor for insertions.
        if prefix + suffix == len(before):
            if prefix:
                prefix -= 1
            elif suffix:
                suffix -= 1
        start += prefix
        before = before[prefix : len(before) - suffix if suffix else None]
        after = after[prefix : len(after) - suffix if suffix else None]
    return PlannedTextChange(
        chapter_id=match.chapter.chapter_id,
        start=start,
        before=before,
        after=after,
        kind=replacement.kind,
        group_id=replacement.group_id,
        source_refs=replacement.source_refs,
        user_input_quote=replacement.user_input_quote,
        context_refs=replacement.context_refs,
    )
