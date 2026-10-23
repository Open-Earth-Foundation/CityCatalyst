"""Weight validation for weighted-sum scoring."""

import math

WEIGHT_SUM_TOLERANCE = 1e-6


def validate_weights(weights: dict[str, float]) -> dict[str, float]:
    """Return `weights` unchanged after checking they form a valid set.

    Args:
        weights: Weight per pillar name.

    Returns:
        The same mapping, so callers can validate inline.

    Raises:
        ValueError: If empty, any weight is negative or not finite, or the
            weights do not sum to 1 within `WEIGHT_SUM_TOLERANCE`.
    """
    # Step 1: structural checks
    if not weights:
        raise ValueError("weights must not be empty")
    for name, weight in weights.items():
        if not math.isfinite(weight) or weight < 0:
            raise ValueError(f"weight for {name} must be a finite non-negative number")

    # Step 2: weights must be a proper convex combination
    total = sum(weights.values())
    if abs(total - 1.0) > WEIGHT_SUM_TOLERANCE:
        raise ValueError(f"weights must sum to 1.0, got {total}")
    return weights
