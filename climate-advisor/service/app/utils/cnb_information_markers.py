"""Parse and compare Concept Note missing-information markers.

The app mirrors ``INFORMATION_NEEDED_PATTERN`` and ``information_marker_key`` in
``app/src/components/ConceptNoteWorkspace/draft-markdown.ts`` so both sides pair
the same marker with the same gap record. Change them together.
"""

from __future__ import annotations

import re
from collections import Counter

# A marker may wrap over several lines; it ends at the first closing bracket.
INFORMATION_NEEDED_PATTERN = re.compile(
    r"\[Information needed:\s*([^\]]+)\]", re.IGNORECASE
)
_MARKER_PREFIX = re.compile(r"^\s*\[?\s*information needed:", re.IGNORECASE)


def information_needed_markers(markdown: str) -> list[str]:
    """Return complete missing-information markers in document order."""
    return [match.group(0) for match in INFORMATION_NEEDED_PATTERN.finditer(markdown)]


def removed_information_markers(before: str, after: str) -> list[str]:
    """Return marker occurrences removed by a replacement, retaining duplicates."""
    before_markers = information_needed_markers(before)
    remaining = Counter(information_needed_markers(after))
    removed: list[str] = []
    for marker in before_markers:
        if remaining[marker] > 0:
            remaining[marker] -= 1
        else:
            removed.append(marker)
    return removed


def information_marker_key(value: str) -> str:
    """Normalize a marker or gap question so formatting never splits a pair.

    Drops the marker wrapper or an "Information needed:" prefix, then keeps only
    the lowercased runs of letters and digits. Markdown emphasis, straight or
    curly quotes and apostrophes, punctuation, spacing and line breaks are
    ignored, so "[Information needed: **Who signs?**]" pairs with "Who signs".
    """
    question = _MARKER_PREFIX.sub("", value)
    return " ".join(re.findall(r"[^\W_]+", question.lower()))


def find_information_marker(markdown: str, question: str) -> int:
    """Return where the marker pairing with ``question`` starts, or -1."""
    key = information_marker_key(question)
    return next(
        (
            match.start()
            for match in INFORMATION_NEEDED_PATTERN.finditer(markdown)
            if information_marker_key(match.group(0)) == key
        ),
        -1,
    )


def marker_replacement_text(value: str) -> str:
    """Remove review markers and return the substantive replacement text."""
    return INFORMATION_NEEDED_PATTERN.sub("", value).strip()
