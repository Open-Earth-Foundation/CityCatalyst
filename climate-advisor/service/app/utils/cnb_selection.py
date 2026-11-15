"""Compute and enforce revision-bound selection edit intervals in Unicode codepoints."""

from __future__ import annotations

import bisect
import re
from uuid import UUID

from app.models.cnb.concept_note_edits import EditScope, SelectionWindow

SELECTION_WINDOW_KEY = "_selection_window"
SELECTION_FORMATTING_KEY = "_selection_formatting"
MAX_NEIGHBOR_CONTEXT = 2_000
SENTENCE_BOUNDARY = re.compile(r"[.!?](?:</span>|\*\*|__|[*_\"')\]])*\s+|\n\s*\n")


def selection_window(
    scope: EditScope, chapter_id: UUID, revision: int, body: str
) -> SelectionWindow:
    """Validate exact immutable anchors and include at most one neighboring sentence.

    Sentence boundaries use punctuation followed by whitespace or a paragraph
    break. Long neighboring sentences are capped at 2,000 codepoints per side.
    The selection itself may span sentences and is never guessed by text search.
    """
    if (
        scope.kind != "selection"
        or scope.chapter_id != chapter_id
        or scope.base_revision != revision
    ):
        raise ValueError(
            "The selected chapter revision changed. Select the text again."
        )
    start, end = scope.start, scope.end
    if start is None or end is None or body[start:end] != scope.selected_markdown:
        raise ValueError("The exact selected markdown changed. Select the text again.")
    for token in re.finditer(r"</?span\b[^>]*>", body):
        if token.start() < start < token.end() or token.start() < end < token.end():
            raise ValueError(
                "Select rendered text or complete formatting wrappers, not partial markup"
            )
    boundaries = sorted(
        {0, len(body), *(match.end() for match in SENTENCE_BOUNDARY.finditer(body))}
    )
    first = max(0, bisect.bisect_right(boundaries, start) - 1)
    last = min(len(boundaries) - 1, bisect.bisect_left(boundaries, end))
    return SelectionWindow(
        start=max(boundaries[max(0, first - 1)], start - MAX_NEIGHBOR_CONTEXT),
        end=min(
            boundaries[min(len(boundaries) - 1, last + 1)], end + MAX_NEIGHBOR_CONTEXT
        ),
    )


def require_selection_change(
    scope: EditScope,
    chapter_id: UUID,
    revision: int,
    body: str,
    start: int,
    before: str,
    *,
    formatting: bool = False,
) -> SelectionWindow:
    """Reject cross-chapter, stale, mismatched or out-of-window replacement anchors."""
    window = selection_window(scope, chapter_id, revision, body)
    low, high = (scope.start, scope.end) if formatting else (window.start, window.end)
    if (
        start < low
        or start + len(before) > high
        or body[start : start + len(before)] != before
    ):
        raise ValueError(
            "A selected-text edit cannot change text outside its permitted sentence window."
        )
    return window
