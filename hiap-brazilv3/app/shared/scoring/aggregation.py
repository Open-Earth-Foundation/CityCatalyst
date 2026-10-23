"""Weighted aggregation and deterministic ranking."""

from app.shared.contracts import RankedItem, ScoreVector
from app.shared.scoring.weights import validate_weights


def weighted_sum(score_vector: ScoreVector, weights: dict[str, float]) -> float:
    """Combine pillar scores into one final score.

    Args:
        score_vector: Scores per pillar; must contain every weighted pillar.
        weights: Weight per pillar name.

    Returns:
        The weighted sum of the pillar scores.

    Raises:
        ValueError: If a weighted pillar has no score.
    """
    missing = [name for name in weights if name not in score_vector.scores]
    if missing:
        raise ValueError(f"missing scores for pillars: {sorted(missing)}")
    return sum(score_vector.scores[name] * weight for name, weight in weights.items())


def rank_items(
    score_vectors: dict[str, ScoreVector],
    weights: dict[str, float],
    top_n: int | None = None,
) -> list[RankedItem]:
    """Rank items by final score, highest first.

    Ties are broken by item id (ascending) so the order is deterministic.

    Args:
        score_vectors: Score vector per item id.
        weights: Weight per pillar name; validated here.
        top_n: Optional cap on returned items; must be positive when given.

    Returns:
        Ranked items with consecutive 1-based ranks.

    Raises:
        ValueError: If weights are invalid, scores are missing, or `top_n` is not positive.
    """
    # Step 1: validate inputs
    validate_weights(weights)
    if top_n is not None and top_n < 1:
        raise ValueError("top_n must be positive")

    # Step 2: score every item
    scored = [
        (item_id, weighted_sum(vector, weights), vector)
        for item_id, vector in score_vectors.items()
    ]

    # Step 3: sort by score desc, then id asc for deterministic ties
    scored.sort(key=lambda entry: (-entry[1], entry[0]))
    if top_n is not None:
        scored = scored[:top_n]

    return [
        RankedItem(item_id=item_id, rank=position, final_score=score, score_vector=vector)
        for position, (item_id, score, vector) in enumerate(scored, start=1)
    ]
