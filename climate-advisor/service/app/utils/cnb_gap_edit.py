"""Side-effect-free checks for exact missing-information marker transitions.

Planning, tool-time validation and acceptance all judge a gap change with these
helpers, so a change that passes one check cannot be reinterpreted by another.
"""

from __future__ import annotations

import hashlib
import re
from collections import Counter, defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal, Protocol

from app.utils.cnb_information_markers import (
    INFORMATION_NEEDED_PATTERN,
    information_marker_key,
    information_needed_markers,
    marker_replacement_text,
    removed_information_markers,
)

MAX_GAP_QUESTION_CHARS = 2_000
_MARKER_PREFIX = re.compile(r"information\s+needed\s*:", re.IGNORECASE)


class GapEditError(ValueError):
    """A gap transition the server cannot prove exact; the message is user-safe."""


@dataclass(frozen=True)
class MarkerTransition:
    """One whole marker removed by a replacement: filled, or narrowed to a new question."""

    mode: Literal["fill", "narrow"]
    old_marker: str
    new_marker: str | None = None


class TextEdit(Protocol):
    """Any replacement anchored at a character offset of the chapter body."""

    start: int
    before: str
    after: str


def gap_answer_digest(saved_answer: str | None) -> str:
    """Fingerprint saved answers by their trimmed text; no saved text is the empty string."""
    return hashlib.sha256((saved_answer or "").strip().encode()).hexdigest()


def marker_question(marker: str) -> str:
    """Return the question a complete marker asks, without its wrapper."""
    match = INFORMATION_NEEDED_PATTERN.search(marker)
    if match is None:
        raise GapEditError("A missing-information marker is malformed.")
    return match.group(1).strip()


def unambiguous_span(body: str, text: str) -> tuple[int, int] | None:
    """Locate estimate text only when it occurs exactly once in the chapter."""
    if not text.strip() or body.count(text) != 1:
        return None
    start = body.index(text)
    return start, start + len(text)


def marker_edit_shape(before: str, after: str) -> MarkerTransition | None:
    """Classify one replacement as a marker fill, a marker narrowing, or neither.

    Returns None when no marker is removed. Raises GapEditError for any marker
    change that is not an exact fill or narrowing.
    """
    for text in (before, after):
        if len(_MARKER_PREFIX.findall(text)) != len(information_needed_markers(text)):
            raise GapEditError("A missing-information marker is malformed.")
    removed = removed_information_markers(before, after)
    remaining = information_needed_markers(after)
    if not removed:
        if remaining:
            raise GapEditError(
                "A replacement may not add a missing-information marker."
            )
        return None
    if len(removed) != 1:
        raise GapEditError("A gap change must remove exactly one whole marker.")
    if not marker_replacement_text(after):
        raise GapEditError(
            "A gap change must state factual text outside its missing-information marker."
        )
    old = removed[0]
    if not remaining:
        return MarkerTransition("fill", old)
    if len(remaining) != 1:
        raise GapEditError(
            "A partial answer keeps exactly one missing-information marker."
        )
    if before != old:
        raise GapEditError("A narrowed marker must be replaced as a whole.")
    new = remaining[0]
    new_key = information_marker_key(new)
    if not new_key or new_key == information_marker_key(old):
        raise GapEditError("A narrowed marker must ask a different question.")
    if len(marker_question(new)) > MAX_GAP_QUESTION_CHARS:
        raise GapEditError(
            "A missing-information question may be at most 2,000 characters."
        )
    return MarkerTransition("narrow", old, new)


def validate_marker_transitions(
    before_body: str, after_body: str, edits: Sequence[TextEdit]
) -> None:
    """Require the reconstructed chapter to hold exactly the reviewed marker sequence.

    Untouched markers stay byte-for-byte, a filled marker disappears, and a
    narrowed marker becomes its new marker at the same point. Every occurrence of
    a repeated question must change together, with one consistent transition.
    """
    # Every edit must be well formed and may not add a marker, even outside a gap.
    for edit in edits:
        marker_edit_shape(edit.before, edit.after)
    occurrences = [
        (match.start(), match.end(), match.group(0))
        for match in INFORMATION_NEEDED_PATTERN.finditer(before_body)
    ]
    expected: list[str] = []
    touched: dict[str, list[MarkerTransition]] = defaultdict(list)
    for start, end, marker in occurrences:
        overlapping = [
            edit
            for edit in edits
            if edit.start < end and edit.start + len(edit.before) > start
        ]
        if not overlapping:
            expected.append(marker)
            continue
        edit = overlapping[0]
        if (
            len(overlapping) != 1
            or edit.start > start
            or edit.start + len(edit.before) < end
        ):
            raise GapEditError(
                "A replacement must contain each missing-information marker it changes."
            )
        shape = marker_edit_shape(edit.before, edit.after)
        if shape is None:
            raise GapEditError(
                "Change a missing-information marker only by filling or narrowing it."
            )
        if shape.mode == "narrow":
            expected.append(shape.new_marker)
        touched[information_marker_key(marker)].append(shape)

    occurrence_counts = Counter(
        information_marker_key(marker) for *_, marker in occurrences
    )
    for key, shapes in touched.items():
        if len(shapes) != occurrence_counts[key]:
            raise GapEditError(
                "Every occurrence of a repeated missing-information question must change together."
            )
        if len({(shape.mode, shape.new_marker) for shape in shapes}) != 1:
            raise GapEditError(
                "Repeated missing-information occurrences need one consistent transition."
            )

    # Markers added or moved elsewhere by any edit surface in this comparison.
    actual = [
        match.group(0) for match in INFORMATION_NEEDED_PATTERN.finditer(after_body)
    ]
    if actual != expected:
        raise GapEditError(
            "Missing-information markers changed outside the reviewed transitions."
        )
