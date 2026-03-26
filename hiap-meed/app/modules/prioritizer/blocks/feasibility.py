"""
Feasibility block that scores how practical each action is for the city context.

Approach:
- Legal support component: checks how many soft legal requirements
  (`recommended`/`optional`) are aligned for the action.
- Socioeconomic component: evaluates whether city indicator buckets support or
  constrain the action, based on action-defined indicator rules.
- Combine both components with fixed weights into one Feasibility score.

Final score formula per action:
- `feasibility_score = (legal_weight * soft_legal_component_value)`
- `+ (socioeconomic_indicators_weight * socioeconomic_indicators_component_value)`
"""

from __future__ import annotations

import logging

from app.modules.prioritizer.config import (
    FEASIBILITY_WEIGHT_LEGAL,
    FEASIBILITY_WEIGHT_SOCIO,
    validate_block_component_weights,
)
from app.modules.prioritizer.internal_models import (
    Action,
    BlockScoreResult,
    CityData,
    LegalRequirementRecord,
)

logger = logging.getLogger(__name__)

SOCIO_BUCKET_TO_SCORE: dict[str, int] = {
    "very_low": -2,
    "low": -1,
    "medium": 0,
    "high": 1,
    "very_high": 2,
}
SOFT_REQUIREMENT_STRENGTHS = {"recommended", "optional"}
INFORMATIONAL_REQUIREMENT_STRENGTH = "informational"
CANONICAL_CITY_SOCIOECONOMIC_INDICATORS = (
    "unemployment_rate",
    "renter_share",
    "transport_logistics_employment",
    "electricity_access",
    "industry_construction_employment",
    "median_household_income",
    "public_transport_share",
    "poverty_rate",
    "home_ownership",
)


def _normalize_socioeconomic_bucket_label(value: str | None) -> str | None:
    """Normalize socioeconomic bucket labels for deterministic score mapping."""
    if value is None:
        return None
    normalized = value.strip().lower().replace("-", "_").replace(" ", "_")
    if not normalized:
        return None
    return normalized


def _extract_city_socioeconomic_indicator_buckets(city: CityData) -> dict[str, str]:
    """Extract city socioeconomic indicator buckets keyed by socioeconomic indicator name."""
    socioeconomic_indicator_buckets: dict[str, str] = {}
    for socioeconomic_indicator_key in CANONICAL_CITY_SOCIOECONOMIC_INDICATORS:
        raw_socioeconomic_indicator = city.raw.get(socioeconomic_indicator_key)
        if not isinstance(raw_socioeconomic_indicator, dict):
            continue
        socioeconomic_bucket_label = _normalize_socioeconomic_bucket_label(
            raw_socioeconomic_indicator.get("attribute_category")
        )
        if socioeconomic_bucket_label is None:
            continue
        socioeconomic_indicator_buckets[socioeconomic_indicator_key] = (
            socioeconomic_bucket_label
        )
    return socioeconomic_indicator_buckets


def _build_legal_counts(
    requirements: list[LegalRequirementRecord],
) -> tuple[dict[str, int], dict[str, int]]:
    """Build legal requirement counters by strength and alignment status."""
    strength_counts: dict[str, int] = {}
    status_counts: dict[str, int] = {}
    for requirement in requirements:
        strength_key = requirement.strength.strip().lower()
        status_key = requirement.alignment_status.strip().lower()
        strength_counts[strength_key] = strength_counts.get(strength_key, 0) + 1
        status_counts[status_key] = status_counts.get(status_key, 0) + 1
    return strength_counts, status_counts


def run(
    actions: list[Action],
    *,
    city: CityData,
    legal_requirements_by_action_id: dict[str, list[LegalRequirementRecord]],
) -> BlockScoreResult:
    """
    Compute Feasibility scores and explainability evidence for candidate actions.

    Inputs:
    - `actions`: Actions that passed hard filtering.
    - `city`: CityData for socioeconomic fit lookups.
    - `legal_requirements_by_action_id`: Legal requirement evidence keyed by action ID.

    Output:
    - `score_by_action_id`: final Feasibility score per action in `[0,1]`.
    - `evidence_by_action_id`: legal/socio component values, weighted
      contributions, and per-indicator diagnostics for explainability.
    """
    # Block 1: Validate scoring configuration and pre-compute city lookups.
    validate_block_component_weights()
    city_socioeconomic_indicator_buckets = (
        _extract_city_socioeconomic_indicator_buckets(city)
    )

    score_by_action_id: dict[str, float] = {}
    evidence_by_action_id: dict[str, dict[str, object]] = {}

    for action in actions:
        # Block 2: Compute soft-legal component from recommended/optional requirements.
        requirements = legal_requirements_by_action_id.get(action.action_id, [])
        soft_requirements = [
            requirement
            for requirement in requirements
            if requirement.strength.strip().lower() in SOFT_REQUIREMENT_STRENGTHS
        ]
        aligned_soft_count = sum(
            1
            for requirement in soft_requirements
            if requirement.alignment_status.strip().lower() == "aligns"
        )
        total_soft_count = len(soft_requirements)
        feasibility_soft_legal_component = (
            aligned_soft_count / total_soft_count if total_soft_count > 0 else 0.0
        )

        # Block 3: Compute socioeconomic component from action rules + city buckets.
        socioeconomic_indicator_rows: list[dict[str, object]] = []
        socio_weighted_sum = 0.0
        total_socioeconomic_indicator_weight = 0.0
        missing_socioeconomic_indicator_keys: list[str] = []
        for socioeconomic_indicator in action.socioeconomic_indicators:
            action_socioeconomic_indicator_key = str(
                socioeconomic_indicator.get("indicator_key", "")
            ).strip()
            direction = str(
                socioeconomic_indicator.get("direction", "supportive")
            ).strip().lower()
            socioeconomic_indicator_weight = float(
                socioeconomic_indicator.get("weight", 0.0)
            )
            city_socioeconomic_bucket_label = city_socioeconomic_indicator_buckets.get(
                action_socioeconomic_indicator_key
            )
            mapped_socioeconomic_bucket_score = (
                SOCIO_BUCKET_TO_SCORE[city_socioeconomic_bucket_label]
                if city_socioeconomic_bucket_label in SOCIO_BUCKET_TO_SCORE
                else 0
            )
            adjusted_score = (
                mapped_socioeconomic_bucket_score
                if direction == "supportive"
                else -mapped_socioeconomic_bucket_score
            )
            weighted_contribution = socioeconomic_indicator_weight * adjusted_score
            socio_weighted_sum += weighted_contribution
            total_socioeconomic_indicator_weight += socioeconomic_indicator_weight
            if city_socioeconomic_bucket_label is None:
                missing_socioeconomic_indicator_keys.append(
                    action_socioeconomic_indicator_key
                )
                logger.warning(
                    "Missing city socioeconomic indicator for key `%s` action_id=%s",
                    action_socioeconomic_indicator_key,
                    action.action_id,
                )
            socioeconomic_indicator_rows.append(
                {
                    "action_socioeconomic_indicator_key": action_socioeconomic_indicator_key,
                    "city_socioeconomic_bucket_label": city_socioeconomic_bucket_label,
                    "mapped_socioeconomic_bucket_score": mapped_socioeconomic_bucket_score,
                    "direction": direction,
                    "adjusted_score": adjusted_score,
                    "socioeconomic_indicator_weight": socioeconomic_indicator_weight,
                    "weighted_contribution": weighted_contribution,
                    "rationale": socioeconomic_indicator.get("rationale"),
                }
            )
        socio_avg = (
            socio_weighted_sum / total_socioeconomic_indicator_weight
            if total_socioeconomic_indicator_weight > 0.0
            else 0.0
        )
        feasibility_socio_component = (socio_avg + 2.0) / 4.0

        # Block 4: Combine weighted components into final Feasibility score.
        soft_legal_contribution = (
            FEASIBILITY_WEIGHT_LEGAL * feasibility_soft_legal_component
        )
        socioeconomic_indicators_contribution = (
            FEASIBILITY_WEIGHT_SOCIO * feasibility_socio_component
        )
        feasibility_score = (
            soft_legal_contribution + socioeconomic_indicators_contribution
        )
        score_by_action_id[action.action_id] = feasibility_score

        # Block 5: Build legal summary diagnostics for explainability.
        strength_counts, status_counts = _build_legal_counts(requirements)
        informational_requirements = [
            {
                "signal_code": requirement.signal_code,
                "signal_name": requirement.signal_name,
                "alignment_status": requirement.alignment_status,
                "location_scope": requirement.location_scope,
                "location_name": requirement.location_name,
                "evidence_count": requirement.evidence_count,
            }
            for requirement in requirements
            if requirement.strength.strip().lower()
            == INFORMATIONAL_REQUIREMENT_STRENGTH
        ]

        # Block 6: Store action-level explainability payload.
        evidence_by_action_id[action.action_id] = {
            "counts_by_strength": strength_counts,
            "counts_by_status": status_counts,
            "soft_legal_component_value": feasibility_soft_legal_component,
            "soft_legal_weight": FEASIBILITY_WEIGHT_LEGAL,
            "soft_legal_contribution": soft_legal_contribution,
            "soft_legal_aligned_count": aligned_soft_count,
            "soft_legal_total_count": total_soft_count,
            "socioeconomic_indicators_component_value": feasibility_socio_component,
            "socioeconomic_indicators_weight": FEASIBILITY_WEIGHT_SOCIO,
            "socioeconomic_indicators_contribution": socioeconomic_indicators_contribution,
            "socioeconomic_indicators_weighted_sum": socio_weighted_sum,
            "total_socioeconomic_indicator_weight": total_socioeconomic_indicator_weight,
            "socioeconomic_indicators_avg": socio_avg,
            "socioeconomic_indicator_rows": socioeconomic_indicator_rows,
            "missing_city_socioeconomic_indicator_keys": sorted(
                set(missing_socioeconomic_indicator_keys)
            ),
            "informational_requirements": informational_requirements,
            "feasibility_score": feasibility_score,
        }

    return BlockScoreResult(
        score_by_action_id=score_by_action_id,
        evidence_by_action_id=evidence_by_action_id,
    )
