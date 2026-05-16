"""
Feasibility block that scores how practical each action is for the city context.

Approach:
- Legal component: uses the lawyer-provided `verdict_score` when available.
- Socioeconomic component: evaluates whether city indicator buckets support or
  constrain the action, based on action-defined indicator rules.
- Combine both components with fixed weights into one Feasibility score.

Final score formula per action:
- `feasibility_score = (legal_weight * legal_component_score)`
- `+ (socioeconomic_weight * socioeconomic_component_score)`
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
    LegalAssessmentRecord,
)

logger = logging.getLogger(__name__)

SOCIO_BUCKET_TO_SCORE: dict[str, int] = {
    "very_low": -2,
    "low": -1,
    "medium": 0,
    "high": 1,
    "very_high": 2,
}
NEUTRAL_LEGAL_COMPONENT_SCORE = 0.5
CANONICAL_CITY_SOCIOECONOMIC_INDICATORS = (
    "unemployment_rate",
    "renter_share",
    "employment_in_transport_and_logistics",
    "electricity_access_rate",
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


def run(
    actions: list[Action],
    *,
    city: CityData,
    legal_assessments_by_action_id: dict[str, LegalAssessmentRecord],
) -> BlockScoreResult:
    """
    Compute Feasibility scores and explainability evidence for candidate actions.

    Inputs:
    - `actions`: Actions that passed hard filtering.
    - `city`: CityData for socioeconomic fit lookups.
    - `legal_assessments_by_action_id`: Legal assessment evidence keyed by action ID.

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
        # Block 2: Use the flat legal verdict score with a neutral fallback.
        assessment = legal_assessments_by_action_id.get(action.action_id)
        legal_component_score = (
            assessment.verdict_score
            if assessment is not None and assessment.verdict_score is not None
            else NEUTRAL_LEGAL_COMPONENT_SCORE
        )
        legal_component_source = (
            "verdict_score"
            if assessment is not None and assessment.verdict_score is not None
            else "neutral_fallback"
        )
        legal_assessment_present = assessment is not None
        legal_verdict_category = (
            assessment.verdict_category if assessment is not None else None
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
            direction = (
                str(socioeconomic_indicator.get("direction", "supportive"))
                .strip()
                .lower()
            )
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
        legal_contribution = FEASIBILITY_WEIGHT_LEGAL * legal_component_score
        socioeconomic_indicators_contribution = (
            FEASIBILITY_WEIGHT_SOCIO * feasibility_socio_component
        )
        feasibility_score = legal_contribution + socioeconomic_indicators_contribution
        score_by_action_id[action.action_id] = feasibility_score

        # Block 5: Store action-level explainability payload.
        evidence_by_action_id[action.action_id] = {
            "legal_assessment_present": legal_assessment_present,
            "legal_assessment_missing": not legal_assessment_present,
            "legal_verdict_category": legal_verdict_category,
            "legal_component_score": legal_component_score,
            "legal_component_source": legal_component_source,
            "legal_weight": FEASIBILITY_WEIGHT_LEGAL,
            "legal_contribution": legal_contribution,
            "legal_verdict_score_missing": (
                assessment is not None and assessment.verdict_score is None
            ),
            "ownership_category": (
                assessment.ownership_category if assessment is not None else None
            ),
            "ownership_score": (
                assessment.ownership_score if assessment is not None else None
            ),
            "restrictions_category": (
                assessment.restrictions_category if assessment is not None else None
            ),
            "restrictions_score": (
                assessment.restrictions_score if assessment is not None else None
            ),
            "legal_analysis_date": (
                assessment.analysis_date if assessment is not None else None
            ),
            "legal_generation_method": (
                assessment.generation_method if assessment is not None else None
            ),
            "legal_references": (
                list(assessment.legal_references) if assessment is not None else []
            ),
            "socioeconomic_component_score": feasibility_socio_component,
            "socioeconomic_weight": FEASIBILITY_WEIGHT_SOCIO,
            "socioeconomic_contribution": socioeconomic_indicators_contribution,
            "socioeconomic_weighted_sum": socio_weighted_sum,
            "total_socioeconomic_indicator_weight": total_socioeconomic_indicator_weight,
            "socioeconomic_average_score_before_normalization": socio_avg,
            "socioeconomic_indicator_rows": socioeconomic_indicator_rows,
            "missing_city_socioeconomic_indicator_keys": sorted(
                set(missing_socioeconomic_indicator_keys)
            ),
            "feasibility_score": feasibility_score,
        }

    return BlockScoreResult(
        score_by_action_id=score_by_action_id,
        evidence_by_action_id=evidence_by_action_id,
    )
