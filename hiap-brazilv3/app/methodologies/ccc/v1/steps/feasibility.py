"""Feasibility pillar (scaffold stub backed by mock scores)."""

from app.methodologies.ccc.v1.steps.mock_scores import read_mock_pillar_scores
from app.shared.contracts import RankableItem


def score_feasibility(items: list[RankableItem]) -> dict[str, float]:
    """Return the feasibility score per item id (mock data, not methodology)."""
    return read_mock_pillar_scores(items, "feasibility")
