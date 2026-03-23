"""Feasibility block scoring (stub)."""

from __future__ import annotations

from app.modules.prioritizer.internal_models import Action, BlockScoreResult, CityData


def run(actions: list[Action], city: CityData) -> BlockScoreResult:
    """
    Compute stub feasibility scores.

    Inputs:
    - `actions`: Actions that passed hard filtering.
    - `city`: CityData for future feasibility inputs (unused in stub).
    """

    _ = city  # Unused in stub implementation.

    score_by_action_id: dict[str, float] = {}

    for action in actions:
        score_by_action_id[action.action_id] = 0.0

    return BlockScoreResult(
        score_by_action_id=score_by_action_id,
        evidence_by_action_id=None,
    )
