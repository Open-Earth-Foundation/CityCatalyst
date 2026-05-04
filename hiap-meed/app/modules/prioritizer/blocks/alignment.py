"""
Alignment block that scores how well each action matches city priorities.

How the score is built (0..1):
- Policy component: uses `policy_support_score` from policy signals.
- Sector component: checks whether the action's emissions sector overlaps with
  requested city preference sectors (`1.0` for overlap, else `0.0`).
- Other-preference component: direct co-benefit selections from the request,
  then normalization of the selected co-benefit `impact_numeric` values into
  `0..1` (`0.5` is neutral, `<0.5` is harmful, `>0.5` is beneficial).

Final alignment score per action:
- `(policy_weight * policy_component_value)`
- `+ (sector_weight * sector_component_value)`
- `+ (other_weight * other_component_value)`
- `+ (timeframe_weight * timeframe_component_value)`
"""

from __future__ import annotations

import logging

from app.modules.prioritizer.config import (
    ALIGNMENT_WEIGHT_OTHER,
    ALIGNMENT_WEIGHT_POLICY,
    ALIGNMENT_WEIGHT_SECTOR,
    ALIGNMENT_WEIGHT_TIMEFRAME,
    validate_block_component_weights,
)
from app.modules.prioritizer.internal_models import Action, BlockScoreResult
from app.modules.prioritizer.models import PolicySignalByAction
from app.modules.prioritizer.services import co_benefit_mapping
from app.modules.prioritizer.utils.co_benefit_taxonomy import ALLOWED_CO_BENEFIT_KEYS
from app.modules.prioritizer.utils.sector_mapping import (
    resolve_action_sector_tags,
    normalize_sector_tags,
)

ACTION_TIMELINE_BUCKET_TO_PREFERENCE: dict[str, str] = {
    "<5 years": "short",
    "5-10 years": "medium",
    ">10 years": "long",
}

TIMEFRAME_ORDER: dict[str, int] = {
    "short": 0,
    "medium": 1,
    "long": 2,
}


logger = logging.getLogger(__name__)


def _normalize_timeframe_preferences(
    city_preference_timeframes: list[str],
) -> list[str]:
    """Normalize timeframe preference labels for alignment scoring."""
    normalized_preferences: list[str] = []
    for timeframe in city_preference_timeframes:
        normalized_timeframe = timeframe.strip().lower()
        if normalized_timeframe:
            normalized_preferences.append(normalized_timeframe)
    return list(dict.fromkeys(normalized_preferences))


def _resolve_action_timeframe_label(action_timeline: str | None) -> str | None:
    """Map an action timeline bucket to the comparable city preference label."""
    if action_timeline is None:
        return None
    return ACTION_TIMELINE_BUCKET_TO_PREFERENCE.get(action_timeline)


def _normalize_selected_co_benefit_keys(
    *,
    city_preference_co_benefit_keys: list[str],
    available_co_benefit_keys: list[str],
) -> list[str]:
    """Keep only supported co-benefit keys and return them in stable order."""
    available_key_set = set(available_co_benefit_keys)
    return sorted(
        {
            key
            for key in city_preference_co_benefit_keys
            if key in available_key_set
        }
    )


def _score_timeframe_preference_match(
    *, city_preference_timeframes: list[str], action_timeline: str | None
) -> float:
    """Score how well an action timeline matches the city's preferred timeframe."""
    if not city_preference_timeframes:
        return 0.5
    if city_preference_timeframes == ["no_preference"]:
        return 0.5

    action_timeframe = _resolve_action_timeframe_label(action_timeline)
    if action_timeframe is None:
        return 0.5

    action_position = TIMEFRAME_ORDER[action_timeframe]
    best_score = 0.0
    for preference in city_preference_timeframes:
        preference_position = TIMEFRAME_ORDER.get(preference)
        if preference_position is None:
            continue
        distance = abs(preference_position - action_position)
        if distance == 0:
            score = 1.0
        elif distance == 1:
            score = 0.5
        else:
            score = 0.0
        best_score = max(best_score, score)
    return best_score


def run(
    actions: list[Action],
    *,
    policy_signals_by_action_id: dict[str, PolicySignalByAction],
    city_preference_sectors: list[str],
    city_preference_timeframes: list[str],
    city_preference_co_benefit_keys: list[str],
) -> BlockScoreResult:
    """
    Compute alignment block scores and explainability evidence per action.

    Inputs:
    - `actions`: Actions that passed hard filtering.
    - `policy_signals_by_action_id`: Policy support scores and policy signal evidence.
    - `city_preference_sectors`: City strategic sectors from request payload.
    - `city_preference_timeframes`: City strategic timeframe preferences from request.
    - `city_preference_co_benefit_keys`: Selected co-benefit preference keys.

    Output:
    - `score_by_action_id`: Final alignment score per action in `[0,1]`.
    - `evidence_by_action_id`: Component values, weights, contributions, and
      matching diagnostics used to explain each score.
    """
    validate_block_component_weights()

    # Block 1: Pre-compute shared lookup inputs for all actions.
    preferred_sectors = normalize_sector_tags(city_preference_sectors)
    preferred_timeframes = _normalize_timeframe_preferences(city_preference_timeframes)
    available_co_benefit_keys = list(ALLOWED_CO_BENEFIT_KEYS)
    resolved_preferred_co_benefits = _normalize_selected_co_benefit_keys(
        city_preference_co_benefit_keys=city_preference_co_benefit_keys,
        available_co_benefit_keys=available_co_benefit_keys,
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
        mapped_sector_tags = sorted(resolve_action_sector_tags(action))
        mapped_sector_tag = mapped_sector_tags[0] if mapped_sector_tags else None
        sector_component_value = 0.0
        if mapped_sector_tags and preferred_sectors.intersection(mapped_sector_tags):
            sector_component_value = 1.0

        # Block 4: Score selected co-benefit impacts against action co-benefits.
        action_co_benefit_keys = sorted(action.co_benefits.keys())
        other_component_value, matched_preferred_co_benefits = (
            co_benefit_mapping.score_action_other_preference_component(
                action_co_benefits=action.co_benefits,
                resolved_preferred_co_benefits=resolved_preferred_co_benefits,
            )
        )

        # Block 5: Score action timeline against the city's preferred timeframe.
        action_timeframe_label = _resolve_action_timeframe_label(
            action.implementation_timeline
        )
        timeframe_component_value = _score_timeframe_preference_match(
            city_preference_timeframes=preferred_timeframes,
            action_timeline=action.implementation_timeline,
        )

        # Block 6: Apply weights and assemble final alignment score.
        policy_contribution = ALIGNMENT_WEIGHT_POLICY * policy_component_value
        sector_contribution = ALIGNMENT_WEIGHT_SECTOR * sector_component_value
        other_contribution = ALIGNMENT_WEIGHT_OTHER * other_component_value
        timeframe_contribution = (
            ALIGNMENT_WEIGHT_TIMEFRAME * timeframe_component_value
        )
        alignment_score = (
            policy_contribution
            + sector_contribution
            + other_contribution
            + timeframe_contribution
        )

        # Block 7: Store explainability evidence and final score for this action.
        evidence_by_action_id[action.action_id] = {
            "policy_component_value": policy_component_value,
            "sector_component_value": sector_component_value,
            "other_component_value": other_component_value,
            "timeframe_component_value": timeframe_component_value,
            "other_preference_input_present": bool(city_preference_co_benefit_keys),
            "city_preference_co_benefit_keys": sorted(
                set(city_preference_co_benefit_keys)
            ),
            "available_co_benefit_keys": available_co_benefit_keys,
            "resolved_preferred_co_benefits": resolved_preferred_co_benefits,
            "resolved_preferred_co_benefits_count": len(resolved_preferred_co_benefits),
            "action_co_benefit_keys": action_co_benefit_keys,
            "matched_preferred_co_benefits": matched_preferred_co_benefits,
            "policy_weight": ALIGNMENT_WEIGHT_POLICY,
            "sector_weight": ALIGNMENT_WEIGHT_SECTOR,
            "other_weight": ALIGNMENT_WEIGHT_OTHER,
            "timeframe_weight": ALIGNMENT_WEIGHT_TIMEFRAME,
            "policy_contribution": policy_contribution,
            "sector_contribution": sector_contribution,
            "other_contribution": other_contribution,
            "timeframe_contribution": timeframe_contribution,
            "alignment_score": alignment_score,
            "action_sector_number": sector_number or None,
            "mapped_sector_tag": mapped_sector_tag,
            "mapped_sector_tags": mapped_sector_tags,
            "city_preference_sectors": sorted(preferred_sectors),
            "city_preference_timeframes": preferred_timeframes,
            "action_timeline_bucket": action.implementation_timeline,
            "action_timeframe_label": action_timeframe_label,
            "action_timeline_known": action_timeframe_label is not None,
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
