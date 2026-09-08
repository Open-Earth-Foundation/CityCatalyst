"""Parse and compare Concept Note missing-information markers."""

from __future__ import annotations

import re
from collections import Counter

INFORMATION_NEEDED_PATTERN = re.compile(
    r"\[Information needed:\s*([^\]]+)\]", re.IGNORECASE
)


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
    """Normalize a marker or structured-gap question for exact semantic matching."""
    match = INFORMATION_NEEDED_PATTERN.fullmatch(value.strip())
    question = match.group(1) if match else value
    question = re.sub(r"^[`*_~\s]+|[`*_~\s]+$", "", question)
    return " ".join(re.findall(r"\w+", question.casefold()))


def marker_replacement_text(value: str) -> str:
    """Remove review markers and return the substantive replacement text."""
    return INFORMATION_NEEDED_PATTERN.sub("", value).strip()
