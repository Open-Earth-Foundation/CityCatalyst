"""
Alignment block that scores how well each action matches city priorities.

How the score is built (0..1):
- Policy component: uses `policy_support_score` from policy signals.
- Sector component: checks whether the action's emissions sector overlaps with
  requested city preference sectors (`1.0` for overlap, else `0.0`).
- Other-preference component: placeholder for free-text matching (currently `0.0`).

Final alignment score per action:
- `(policy_weight * policy_component_value)`
- `+ (sector_weight * sector_component_value)`
- `+ (other_weight * other_component_value)`
"""

from __future__ import annotations

from app.modules.prioritizer.config import (
    ALIGNMENT_WEIGHT_OTHER,
    ALIGNMENT_WEIGHT_POLICY,
    ALIGNMENT_WEIGHT_SECTOR,
    validate_block_component_weights,
)
from app.modules.prioritizer.internal_models import Action, BlockScoreResult
from app.modules.prioritizer.models import PolicySignalByAction

SECTOR_NUMBER_TO_TAG: dict[str, str] = {
    "I": "stationary_energy",
    "II": "transportation",
    "III": "waste",
    "IV": "ippu",
    "V": "afolu",
}


def _score_other_preference_alignment_stub(
    *, actions: list[Action], city_preference_other_text: str | None
) -> dict[str, float]:
    """
    Return free-text strategic-preference component values by action ID.

    This is intentionally a placeholder in the current release: every action gets
    `0.0` for this component, so the final alignment score is driven by policy
    and sector components only.

    Intended future behavior:
    - Use an LLM to compare `city_preference_other_text` against action
      attributes (e.g. description, timeline, and co-benefit fields
      in `Action.co_benefits` such as air_quality / housing).
    - Produce an interpretable score in 0..1 per action plus evidence explaining
      what parts of the action match the city's free-text preferences.
    """

    _ = city_preference_other_text
    return {action.action_id: 0.0 for action in actions}


def _normalize_preference_sectors(city_preference_sectors: list[str]) -> set[str]:
    """Normalize city strategic preference sector labels."""
    return {sector.strip().lower() for sector in city_preference_sectors if sector.strip()}


def run(
    actions: list[Action],
    *,
    policy_signals_by_action_id: dict[str, PolicySignalByAction],
    city_preference_sectors: list[str],
    city_preference_other_text: str | None,
) -> BlockScoreResult:
    """
    Compute alignment block scores and explainability evidence per action.

    Inputs:
    - `actions`: Actions that passed hard filtering.
    - `policy_signals_by_action_id`: Policy support scores and policy signal evidence.
    - `city_preference_sectors`: City strategic sectors from request payload.
    - `city_preference_other_text`: Free-text strategic preference.

    Output:
    - `score_by_action_id`: Final alignment score per action in `[0,1]`.
    - `evidence_by_action_id`: Component values, weights, contributions, and
      matching diagnostics used to explain each score.
    """
    validate_block_component_weights()

    # Block 1: Pre-compute shared lookup inputs for all actions.
    preferred_sectors = _normalize_preference_sectors(city_preference_sectors)
    other_component_value_by_action_id = _score_other_preference_alignment_stub(
        actions=actions,
        city_preference_other_text=city_preference_other_text,
    )

    score_by_action_id: dict[str, float] = {}
    evidence_by_action_id: dict[str, dict[str, object]] = {}

    for action in actions:
        # Block 2: Compute policy component from policy signals payload.
        policy_payload = policy_signals_by_action_id.get(action.action_id)
        policy_component_value = 0.0
        policy_signals_count = 0
        if policy_payload is not None:
            policy_component_value = float(policy_payload.policy_support_score or 0.0)
            policy_signals_count = len(policy_payload.policy_signals)

        # Block 3: Compute binary sector-match component from configured mapping.
        sector_number = str(action.emissions.get("sector_number", "")).strip().upper()
        mapped_sector_tag = SECTOR_NUMBER_TO_TAG.get(sector_number)
        sector_component_value = 0.0
        if mapped_sector_tag is not None and mapped_sector_tag in preferred_sectors:
            sector_component_value = 1.0

        # Block 4: Load free-text "other preference" component (placeholder today).
        other_component_value = other_component_value_by_action_id[action.action_id]

        # Block 5: Apply weights and assemble final alignment score.
        policy_contribution = ALIGNMENT_WEIGHT_POLICY * policy_component_value
        sector_contribution = ALIGNMENT_WEIGHT_SECTOR * sector_component_value
        other_contribution = ALIGNMENT_WEIGHT_OTHER * other_component_value
        alignment_score = policy_contribution + sector_contribution + other_contribution

        # Block 6: Store explainability evidence and final score for this action.
        evidence_by_action_id[action.action_id] = {
            "policy_component_value": policy_component_value,
            "sector_component_value": sector_component_value,
            "other_component_value": other_component_value,
            "other_component_is_stub": True,
            "policy_weight": ALIGNMENT_WEIGHT_POLICY,
            "sector_weight": ALIGNMENT_WEIGHT_SECTOR,
            "other_weight": ALIGNMENT_WEIGHT_OTHER,
            "policy_contribution": policy_contribution,
            "sector_contribution": sector_contribution,
            "other_contribution": other_contribution,
            "alignment_score": alignment_score,
            "action_sector_number": sector_number or None,
            "mapped_sector_tag": mapped_sector_tag,
            "city_preference_sectors": sorted(preferred_sectors),
            "sector_match": sector_component_value == 1.0,
            "policy_signals_count": policy_signals_count,
            "policy_support_score_present": policy_payload is not None
            and policy_payload.policy_support_score is not None,
            "policy_signal_summaries": (
                [
                    {
                        "signal_type": signal.signal_type,
                        "signal_relation": signal.signal_relation,
                        "signal_strength": signal.signal_strength,
                        "location_scope": signal.location_scope,
                        "location_name": signal.location_name,
                        "evidence_count": signal.evidence_count,
                    }
                    for signal in policy_payload.policy_signals
                ]
                if policy_payload is not None
                else []
            ),
        }
        score_by_action_id[action.action_id] = alignment_score

    return BlockScoreResult(
        score_by_action_id=score_by_action_id,
        evidence_by_action_id=evidence_by_action_id,
    )
