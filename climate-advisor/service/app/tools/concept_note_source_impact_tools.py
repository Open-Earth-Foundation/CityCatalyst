"""Strict output tool for review-only Concept Note source impact selection."""

from __future__ import annotations

import json
from collections.abc import Sequence

from agents import function_tool


def build_concept_note_source_impact_tools(
    *,
    allowed_chapter_numbers: set[int],
) -> Sequence[object]:
    """Build the sole tool available to one bounded source-impact review call."""

    @function_tool
    async def select_chapters_to_update(chapter_numbers: list[int]) -> str:
        """Return only valid chapter numbers that the new source affects.

        Args:
            chapter_numbers: Distinct supplied chapter numbers requiring a redraft.
        """
        selected = sorted(set(chapter_numbers))
        invalid = set(selected) - allowed_chapter_numbers
        if invalid:
            raise ValueError(f"Unknown chapter numbers: {sorted(invalid)}")
        return json.dumps(selected)

    return [select_chapters_to_update]
