"""Alignment block for strategy fit placeholders."""

from __future__ import annotations

from app.modules.prioritizer.internal_models import Action, BlockScoreResult, CityData


def _score_other_preference_alignment_stub(
    *, actions: list[Action], city_strategic_preference_other: str | None
) -> dict[str, float]:
    """
    Compute per-action alignment signals from free-text strategic preferences.

    This is a deliberate stub (no-op) mirroring the hard-filter free-text
    exclusion stub. It returns 0.0 for every action and does not influence
    alignment scoring yet.

    Intended future behavior:
    - Use an LLM to compare `city_strategic_preference_other` against action
      attributes (e.g. description, timeline, and co-benefit-like impact fields
      in `Action.mitigation_impact` such as air_quality / housing).
    - Produce an interpretable score in 0..1 per action plus evidence explaining
      what parts of the action match the city's free-text preferences.
    """

    _ = city_strategic_preference_other
    return {action.action_id: 0.0 for action in actions}


def run(actions: list[Action], city: CityData) -> BlockScoreResult:
    """
    Compute stub alignment scores and lightweight attribute-presence evidence.

    Inputs:
    - `actions`: Actions that passed hard filtering.
    - `city`: City context for current prioritization request.
    """

    _ = city  # Placeholder for future city-strategy overlays.

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
