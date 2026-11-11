"""Final scoring step: combine pillar scores with the shared kernel."""

from app.shared.contracts import RankedItem, ScoreVector
from app.shared.scoring.aggregation import rank_items


def rank_by_pillars(
    pillar_scores: dict[str, dict[str, float]],
    weights: dict[str, float],
    top_n: int | None,
) -> list[RankedItem]:
    """Rank items from per-pillar scores.

    Args:
        pillar_scores: Score per item id, keyed by pillar name.
        weights: Weight per pillar name.
        top_n: Optional cap on ranked items.

    Returns:
        Ranked items, highest final score first.
    """
    # Step 1: regroup pillar -> item scores into one vector per item
    item_ids = sorted({item_id for scores in pillar_scores.values() for item_id in scores})
    vectors = {
        item_id: ScoreVector(
            scores={
                pillar: scores[item_id]
                for pillar, scores in pillar_scores.items()
                if item_id in scores
            }
        )
        for item_id in item_ids
    }

    # Step 2: weighted sum + deterministic ranking
    return rank_items(vectors, weights, top_n)
