"""Alignment block for strategy fit placeholders."""

from __future__ import annotations

from app.modules.prioritizer.internal_models import Action, BlockScoreResult, CityData


def run(actions: list[Action], city: CityData) -> BlockScoreResult:
    """
    Compute stub alignment scores and lightweight attribute-presence evidence.

    Inputs:
    - `actions`: Actions that passed hard filtering.
    - `city`: City context for current prioritization request.
    """

    del city  # Placeholder for future city-strategy overlays.

    score_by_action_id: dict[str, float] = {}
    evidence_by_action_id: dict[str, dict[str, object]] = {}

    for action in actions:
        evidence_by_action_id[action.action_id] = {
            "has_action_type": action.action_type is not None,
            "has_action_category": action.action_category is not None,
            "has_action_subcategory": action.action_subcategory is not None,
        }
        score_by_action_id[action.action_id] = 0.0

    return BlockScoreResult(
        score_by_action_id=score_by_action_id,
        evidence_by_action_id=evidence_by_action_id,
    )
