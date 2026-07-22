"""Deterministic normalization for reviewed Concept Note Builder project tags."""

from __future__ import annotations

import re
from typing import Sequence


_NON_ALNUM_PATTERN = re.compile(r"[^0-9a-z]+")


def normalize_project_tag(tag: str) -> str:
    """Normalize one curated tag without inferring new categories or weights."""
    normalized = _NON_ALNUM_PATTERN.sub("-", tag.strip().lower()).strip("-")
    return normalized


def normalize_project_tags(tags: Sequence[str]) -> list[str]:
    """Normalize, drop blanks, and deduplicate tags while preserving order."""
    normalized_tags: list[str] = []
    seen: set[str] = set()

    for tag in tags:
        normalized = normalize_project_tag(tag)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        normalized_tags.append(normalized)

    return normalized_tags
