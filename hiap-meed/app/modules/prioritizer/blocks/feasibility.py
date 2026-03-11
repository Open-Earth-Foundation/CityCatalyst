"""Feasibility block using city context row counts (stub)."""

from __future__ import annotations

from app.modules.prioritizer.internal_models import Action, BlockScoreResult, CityData


def run(actions: list[Action], city: CityData) -> BlockScoreResult:
    """
    Compute stub feasibility scores and city-context evidence.

    Inputs:
    - `actions`: Actions that passed hard filtering.
    - `city`: CityData with `city_context` rows.
    """

    context_rows = len(city.city_context)

    score_by_action_id: dict[str, float] = {}
    evidence_by_action_id: dict[str, dict[str, object]] = {}

    for action in actions:
        evidence_by_action_id[action.action_id] = {"city_context_rows": context_rows}
        score_by_action_id[action.action_id] = 0.0

    return BlockScoreResult(
        score_by_action_id=score_by_action_id,
        evidence_by_action_id=evidence_by_action_id,
    )
