"""Configuration and validation for prioritization scoring."""

from __future__ import annotations

import logging
from math import isclose
from typing import Mapping


logger = logging.getLogger(__name__)

DEFAULT_WEIGHTS: dict[str, float] = {
    "impact": 0.55,
    "alignment": 0.22,
    "feasibility": 0.23,
}

REQUIRED_WEIGHT_KEYS: set[str] = set(DEFAULT_WEIGHTS.keys())


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
