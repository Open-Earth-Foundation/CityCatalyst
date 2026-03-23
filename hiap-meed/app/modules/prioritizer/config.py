"""Configuration and validation for prioritization scoring."""

from __future__ import annotations

import logging
import os
from math import isclose
from typing import Mapping


logger = logging.getLogger(__name__)

DEFAULT_WEIGHTS: dict[str, float] = {
    "impact": 0.55,
    "alignment": 0.22,
    "feasibility": 0.23,
}

REQUIRED_WEIGHT_KEYS: set[str] = set(DEFAULT_WEIGHTS.keys())
DEFAULT_TOP_N = 20
DEFAULT_TIMELINE_SCORE = 0.0

IMPACT_TEXT_TO_MULTIPLIER: dict[str, float] = {
    "very low": 0.2,
    "low": 0.4,
    "medium": 0.6,
    "high": 0.8,
    "very high": 1.0,
}

TIMELINE_TO_SCORE: dict[str, float] = {
    "<5 years": 1.0,
    "5-10 years": 0.5,
    ">10 years": 0.0,
}


def validate_weights(weights: Mapping[str, float] | None) -> dict[str, float]:
    """
    Validate scoring weights.

    Inputs:
    - `weights`: Optional override map for impact/alignment/feasibility.

    Returns:
    - Validated weights keyed by required dimensions.

    Raises:
    - ValueError when keys are missing/unknown, values are negative, or sum is not 1.0.
    """

    resolved: dict[str, float] = dict(DEFAULT_WEIGHTS)
    if weights:
        resolved.update(weights)

    missing = REQUIRED_WEIGHT_KEYS - set(resolved.keys())
    unknown = set(resolved.keys()) - REQUIRED_WEIGHT_KEYS

    if missing:
        raise ValueError(f"Missing weight keys: {sorted(missing)}")
    if unknown:
        raise ValueError(f"Unknown weight keys: {sorted(unknown)}")

    for key, value in resolved.items():
        if value < 0:
            raise ValueError(f"Weight `{key}` must be >= 0")

    total = sum(resolved.values())
    if total <= 0:
        raise ValueError("Weight sum must be greater than zero")

    if not isclose(total, 1.0, rel_tol=1e-9, abs_tol=1e-9):
        logger.error("Invalid weight sum=%s. Expected exactly 1.0", total)
        raise ValueError(f"Weight sum must be 1.0, got {total}")

    return resolved


def _parse_top_n(value: str, *, source_label: str) -> int:
    """Parse and validate a positive integer top_n setting."""
    try:
        parsed = int(value)
    except ValueError as error:
        raise ValueError(f"{source_label} must be an integer, got `{value}`") from error
    if parsed <= 0:
        raise ValueError(f"{source_label} must be > 0, got {parsed}")
    return parsed


def get_default_top_n() -> int:
    """
    Return configured default top_n for prioritization output size.

    Reads `HIAP_MEED_TOP_N` from environment and defaults to 20 when unset.
    """
    raw_value = os.getenv("HIAP_MEED_TOP_N")
    if raw_value is None or not raw_value.strip():
        return DEFAULT_TOP_N
    return _parse_top_n(raw_value.strip(), source_label="HIAP_MEED_TOP_N")


def resolve_top_n(top_n_override: int | None) -> int:
    """Resolve effective top_n from optional request override and env default."""
    if top_n_override is not None:
        if top_n_override <= 0:
            raise ValueError(f"topN must be > 0, got {top_n_override}")
        return top_n_override
    return get_default_top_n()


def normalize_impact_text_label(value: str) -> str:
    """Normalize impact band labels for dictionary lookups."""
    return " ".join(value.strip().lower().replace("_", " ").split())


def resolve_impact_text_multiplier(impact_text: str) -> float:
    """Resolve configured multiplier for a mitigation impact text label."""
    normalized = normalize_impact_text_label(impact_text)
    if normalized not in IMPACT_TEXT_TO_MULTIPLIER:
        raise ValueError(
            "Unknown mitigation impact_text value "
            f"`{impact_text}` (normalized: `{normalized}`)"
        )
    return IMPACT_TEXT_TO_MULTIPLIER[normalized]


def resolve_timeline_score(timeline: str | None) -> float:
    """Resolve timeline score from configured mapping, defaulting to 0.0."""
    if timeline is None:
        return DEFAULT_TIMELINE_SCORE
    return TIMELINE_TO_SCORE.get(timeline, DEFAULT_TIMELINE_SCORE)
