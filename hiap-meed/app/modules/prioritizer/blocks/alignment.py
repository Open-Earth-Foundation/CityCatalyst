"""
Alignment block that scores how well each action matches city priorities.

How the score is built (0..1):
- Policy component: uses `policy_support_score` from action policy scores.
- Sector component: checks whether the action's emissions sector overlaps with
  requested city preference sectors (`1.0` for overlap, else `0.0`).
- Other-preference component: direct co-benefit selections from the request,
  then normalization of the selected co-benefit `impact_numeric` values into
  `0..1` (`0.5` is neutral, `<0.5` is harmful, `>0.5` is beneficial).

Final alignment score per action:
- `(policy_weight * policy_component_score)`
- `+ (sector_weight * sector_component_score)`
- `+ (co_benefit_weight * co_benefit_component_score)`
- `+ (timeframe_weight * timeframe_component_score)`
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
from app.modules.prioritizer.internal_models import (
    Action,
    ActionPolicyScoreRecord,
    BlockScoreResult,
)
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


def _timeframe_match_label(
    *, city_preference_timeframes: list[str], action_timeline: str | None
) -> str:
    """Return a human-readable label for the timeframe matching rule used."""
    if not city_preference_timeframes:
        return "neutral_no_preference"
    if city_preference_timeframes == ["no_preference"]:
        return "neutral_no_preference"

    action_timeframe = _resolve_action_timeframe_label(action_timeline)
    if action_timeframe is None:
        return "neutral_unknown_action_timeline"

    action_position = TIMEFRAME_ORDER[action_timeframe]
    best_distance: int | None = None
    for preference in city_preference_timeframes:
        preference_position = TIMEFRAME_ORDER.get(preference)
        if preference_position is None:
            continue
        distance = abs(preference_position - action_position)
        if best_distance is None or distance < best_distance:
            best_distance = distance

    if best_distance is None:
        return "neutral_no_supported_preference"
    if best_distance == 0:
        return "exact_match"
    if best_distance == 1:
        return "adjacent_match"
    return "mismatch"


def _normalized_co_benefit_score(impact_numeric: float) -> float:
    """Map raw co-benefit impact from `-2..2` to the alignment block's `0..1` scale."""
    return (impact_numeric + 2.0) / 4.0


def _co_benefit_effect_label(impact_numeric: float | None, *, present: bool) -> str:
    """Return a human-readable effect label for one selected co-benefit."""
    if not present:
        return "not_provided"
    if impact_numeric is None:
        return "unknown"
    if impact_numeric > 0:
        return "beneficial"
    if impact_numeric < 0:
        return "harmful"
    return "neutral"


def _co_benefit_score_source(impact_numeric: float | None, *, present: bool) -> str:
    """Explain whether the normalized score came from a real value or a missing fallback."""
    if not present:
        return "missing_co_benefit"
    if impact_numeric is None:
        return "missing_impact_numeric"
    return "derived_from_value"


def _build_selected_co_benefit_match_details(
    *,
    action_co_benefits: dict[str, dict[str, object]],
    resolved_preferred_co_benefits: list[str],
) -> list[dict[str, object]]:
    """Describe how each selected city co-benefit affected the action score."""
    rows: list[dict[str, object]] = []
    for key in resolved_preferred_co_benefits:
        raw_benefit = action_co_benefits.get(key)
        benefit = raw_benefit if isinstance(raw_benefit, dict) else None
        impact_numeric_raw = benefit.get("impact_numeric") if benefit is not None else None
        impact_numeric = (
            float(impact_numeric_raw)
            if isinstance(impact_numeric_raw, int | float)
            else None
        )
        rows.append(
            {
                "co_benefit_key": key,
                "selected_by_city": True,
                "action_has_co_benefit": benefit is not None,
                "impact_numeric": impact_numeric,
                "impact_relationship": (
                    benefit.get("impact_relationship") if benefit is not None else None
                ),
                "impact_text": benefit.get("impact_text") if benefit is not None else None,
                "normalized_preference_score": (
                    _normalized_co_benefit_score(impact_numeric)
                    if impact_numeric is not None
                    else 0.5
                ),
                "score_source": _co_benefit_score_source(
                    impact_numeric,
                    present=benefit is not None,
                ),
                "effect_label": _co_benefit_effect_label(
                    impact_numeric,
                    present=benefit is not None,
                ),
            }
        )
    return rows


def run(
    actions: list[Action],
    *,
    action_policy_scores_by_action_id: dict[str, ActionPolicyScoreRecord],
    city_preference_sectors: list[str],
    city_preference_timeframes: list[str],
    city_preference_co_benefit_keys: list[str],
) -> BlockScoreResult:
    """
    Compute alignment block scores and explainability evidence per action.

    Inputs:
    - `actions`: Actions that passed hard filtering.
    - `action_policy_scores_by_action_id`: Policy support scores and evidence.
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
        # Block 2: Compute policy component from action policy scores payload.
        policy_payload = action_policy_scores_by_action_id.get(action.action_id)
        policy_component_value = 0.0
        if policy_payload is not None:
            policy_component_value = float(policy_payload.policy_support_score or 0.0)

        # Block 3: Compute binary sector-match component from configured mapping.
        sector_number = str(action.emissions.get("sector_number", "")).strip().upper()
        mapped_sector_tags = sorted(resolve_action_sector_tags(action))
        mapped_sector_tag = mapped_sector_tags[0] if mapped_sector_tags else None
        sector_component_value = 0.0
        if mapped_sector_tags and preferred_sectors.intersection(mapped_sector_tags):
            sector_component_value = 1.0

        # Block 4: Score selected co-benefit impacts against action co-benefits.
        action_co_benefit_keys = sorted(action.co_benefits.keys())
        co_benefit_component_score, matched_preferred_co_benefits = (
            co_benefit_mapping.score_action_other_preference_component(
                action_co_benefits=action.co_benefits,
                resolved_preferred_co_benefits=resolved_preferred_co_benefits,
            )
        )
        selected_co_benefit_match_details = _build_selected_co_benefit_match_details(
            action_co_benefits=action.co_benefits,
            resolved_preferred_co_benefits=resolved_preferred_co_benefits,
        )
        unmatched_preferred_co_benefits = sorted(
            key
            for key in resolved_preferred_co_benefits
            if key not in matched_preferred_co_benefits
        )

        # Block 5: Score action timeline against the city's preferred timeframe.
        action_timeframe_label = _resolve_action_timeframe_label(
            action.implementation_timeline
        )
        timeframe_component_score = _score_timeframe_preference_match(
            city_preference_timeframes=preferred_timeframes,
            action_timeline=action.implementation_timeline,
        )

        # Block 6: Apply weights and assemble final alignment score.
        policy_contribution = ALIGNMENT_WEIGHT_POLICY * policy_component_value
        sector_contribution = ALIGNMENT_WEIGHT_SECTOR * sector_component_value
        co_benefit_contribution = ALIGNMENT_WEIGHT_OTHER * co_benefit_component_score
        timeframe_contribution = ALIGNMENT_WEIGHT_TIMEFRAME * timeframe_component_score
        alignment_score = (
            policy_contribution
            + sector_contribution
            + co_benefit_contribution
            + timeframe_contribution
        )

        # Block 7: Store explainability evidence and final score for this action.
        evidence_by_action_id[action.action_id] = {
            "policy_component_score": policy_component_value,
            "sector_component_score": sector_component_value,
            "co_benefit_component_score": co_benefit_component_score,
            "timeframe_component_score": timeframe_component_score,
            "city_selected_co_benefits_present": bool(city_preference_co_benefit_keys),
            "city_preference_co_benefit_keys": sorted(
                set(city_preference_co_benefit_keys)
            ),
            "available_co_benefit_keys": available_co_benefit_keys,
            "scored_city_co_benefit_keys": resolved_preferred_co_benefits,
            "scored_city_co_benefit_keys_count": len(resolved_preferred_co_benefits),
            "action_co_benefit_keys": action_co_benefit_keys,
            "matched_preferred_co_benefits": matched_preferred_co_benefits,
            "matched_preferred_co_benefits_count": len(matched_preferred_co_benefits),
            "unmatched_preferred_co_benefits": unmatched_preferred_co_benefits,
            "selected_co_benefit_match_details": selected_co_benefit_match_details,
            "policy_weight": ALIGNMENT_WEIGHT_POLICY,
            "sector_weight": ALIGNMENT_WEIGHT_SECTOR,
            "co_benefit_weight": ALIGNMENT_WEIGHT_OTHER,
            "timeframe_weight": ALIGNMENT_WEIGHT_TIMEFRAME,
            "policy_contribution": policy_contribution,
            "sector_contribution": sector_contribution,
            "co_benefit_contribution": co_benefit_contribution,
            "timeframe_contribution": timeframe_contribution,
            "alignment_score": alignment_score,
            "action_sector_number": sector_number or None,
            "mapped_sector_tag": mapped_sector_tag,
            "mapped_sector_tags": mapped_sector_tags,
            "city_preference_sectors": sorted(preferred_sectors),
            "city_preference_timeframes": preferred_timeframes,
            "action_timeline_bucket": action.implementation_timeline,
            "action_timeframe_label": action_timeframe_label,
            "timeframe_match_label": _timeframe_match_label(
                city_preference_timeframes=preferred_timeframes,
                action_timeline=action.implementation_timeline,
            ),
            "action_timeline_known": action_timeframe_label is not None,
            "sector_match": sector_component_value == 1.0,
            "sector_match_label": (
                "match" if sector_component_value == 1.0 else "no_match"
            ),
            "policy_score_present": policy_payload is not None
            and policy_payload.policy_support_score is not None,
            "policy_support_score": (
                policy_payload.policy_support_score
                if policy_payload is not None
                else None
            ),
            "policy_support_category": (
                policy_payload.policy_support_category
                if policy_payload is not None
                else None
            ),
            "best_relevance": (
                policy_payload.best_relevance if policy_payload is not None else None
            ),
            "n_findings": (
                policy_payload.n_findings if policy_payload is not None else None
            ),
            "n_docs": policy_payload.n_docs if policy_payload is not None else None,
            "sum_strength": (
                policy_payload.sum_strength if policy_payload is not None else None
            ),
            "policy_evidence": (
                policy_payload.policy_evidence if policy_payload is not None else []
            ),
        }
        score_by_action_id[action.action_id] = alignment_score
    return BlockScoreResult(
        score_by_action_id=score_by_action_id,
        evidence_by_action_id=evidence_by_action_id,
    )
