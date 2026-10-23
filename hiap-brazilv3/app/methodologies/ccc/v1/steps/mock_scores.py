"""Scaffold helper: read fictitious pillar scores attached to items by the region adapter."""

from app.shared.contracts import RankableItem

MOCK_SCORES_KEY = "mockScores"


def read_mock_pillar_scores(items: list[RankableItem], pillar: str) -> dict[str, float]:
    """Return the mock score of `pillar` for each item.

    Args:
        items: Items carrying `metadata["mockScores"][pillar]`.
        pillar: Pillar name, e.g. `impact`.

    Returns:
        Score per item id.

    Raises:
        ValueError: If an item has no mock score for the pillar.
    """
    scores: dict[str, float] = {}
    for item in items:
        pillar_scores = item.metadata.get(MOCK_SCORES_KEY, {})
        if pillar not in pillar_scores:
            raise ValueError(f"item {item.id} has no mock score for pillar {pillar}")
        scores[item.id] = float(pillar_scores[pillar])
    return scores
