"""
Feasibility block that scores whether each action is practical for the city.

The block combines three fixed-weight components:
- Legal feasibility from the country-scoped legal assessment verdict score.
- Mitigation feasibility from the city-scoped action feasibility scores API.
- Financial feasibility from the city-scoped climate-finance feasibility API.

Final score formula per action:
- `feasibility_score = (legal_weight * legal_component_score)`
- `+ (mitigation_feasibility_weight * mitigation_feasibility_component_score)`
- `+ (financial_feasibility_weight * financial_feasibility_component_score)`

Neutral `0.5` fallback rules:
- Legal component: use `0.5` when the legal row is missing or when the legal
  row is present but `verdict_score` is missing.
- Mitigation feasibility component: use `0.5` when the mitigation feasibility
  row is missing or when the row is present but `action_score` is missing.
- Financial feasibility component: use `0.5` when the financial feasibility
  row is missing or when the row is present but `financial_feasibility` is
  missing.
"""

from __future__ import annotations

from app.modules.prioritizer.scoring_config import (
    FEASIBILITY_WEIGHT_FINANCIAL_FEASIBILITY,
    FEASIBILITY_WEIGHT_LEGAL,
    FEASIBILITY_WEIGHT_MITIGATION_FEASIBILITY,
    validate_block_component_weights,
)
from app.modules.prioritizer.internal_models import (
    Action,
    ActionFinancialFeasibilityScoreRecord,
    ActionMitigationFeasibilityScoreRecord,
    BlockScoreResult,
    LegalAssessmentRecord,
)

NEUTRAL_COMPONENT_SCORE = 0.5


def run(
    actions: list[Action],
    *,
    legal_assessments_by_action_id: dict[str, LegalAssessmentRecord],
    mitigation_feasibility_scores_by_action_id: dict[
        str, ActionMitigationFeasibilityScoreRecord
    ],
    financial_feasibility_scores_by_action_id: dict[
        str, ActionFinancialFeasibilityScoreRecord
    ],
) -> BlockScoreResult:
    """
    Compute Feasibility scores and explainability evidence for candidate actions.

    Inputs:
    - `actions`: Actions that passed hard filtering.
    - `legal_assessments_by_action_id`: Legal assessment evidence keyed by action ID.
    - `mitigation_feasibility_scores_by_action_id`: Upstream mitigation
      feasibility component rows keyed by action ID. This input does not include
      the legal component.
    - `financial_feasibility_scores_by_action_id`: Upstream climate-finance
      feasibility rows keyed by action ID.

    Outputs:
    - `score_by_action_id`: final Feasibility score per action in `[0,1]`.
    - `evidence_by_action_id`: legal component values, mitigation feasibility
      component values, financial feasibility component values, weighted
      contributions, and fallback diagnostics.
    """
    # Block 1: Validate scoring configuration and initialize output containers.
    validate_block_component_weights()

    score_by_action_id: dict[str, float] = {}
    evidence_by_action_id: dict[str, dict[str, object]] = {}
    missing_legal_assessment_action_ids: list[str] = []
    neutral_legal_fallback_action_ids: list[str] = []
    neutral_legal_fallback_missing_score_action_ids: list[str] = []
    missing_mitigation_feasibility_score_action_ids: list[str] = []
    neutral_mitigation_feasibility_fallback_action_ids: list[str] = []
    neutral_mitigation_feasibility_missing_score_action_ids: list[str] = []
    missing_financial_feasibility_score_action_ids: list[str] = []
    neutral_financial_feasibility_fallback_action_ids: list[str] = []
    neutral_financial_feasibility_missing_score_action_ids: list[str] = []

    # Block 2: Compute per-action legal, mitigation, and financial components.
    for action in actions:
        # Block 2a: Resolve legal component from legal assessment payload.
        assessment = legal_assessments_by_action_id.get(action.action_id)
        legal_component_score = (
            assessment.verdict_score
            if assessment is not None and assessment.verdict_score is not None
            else NEUTRAL_COMPONENT_SCORE
        )
        legal_component_source = (
            "verdict_score"
            if assessment is not None and assessment.verdict_score is not None
            else "neutral_fallback"
        )
        legal_assessment_present = assessment is not None
        legal_verdict_score_missing = (
            assessment is not None and assessment.verdict_score is None
        )
        if not legal_assessment_present:
            missing_legal_assessment_action_ids.append(action.action_id)
        if legal_component_source == "neutral_fallback":
            neutral_legal_fallback_action_ids.append(action.action_id)
        if legal_verdict_score_missing:
            neutral_legal_fallback_missing_score_action_ids.append(action.action_id)

        # Block 2b: Resolve mitigation feasibility component from city-scoped API scores.
        feasibility_record = mitigation_feasibility_scores_by_action_id.get(
            action.action_id
        )
        mitigation_feasibility_score_present = feasibility_record is not None
        mitigation_feasibility_action_score_missing = (
            feasibility_record is not None and feasibility_record.action_score is None
        )
        mitigation_feasibility_component_score = (
            feasibility_record.action_score
            if feasibility_record is not None
            and feasibility_record.action_score is not None
            else NEUTRAL_COMPONENT_SCORE
        )
        mitigation_feasibility_component_source = (
            "action_mitigation_feasibility_score"
            if feasibility_record is not None
            and feasibility_record.action_score is not None
            else "neutral_fallback"
        )
        if not mitigation_feasibility_score_present:
            missing_mitigation_feasibility_score_action_ids.append(action.action_id)
        if mitigation_feasibility_component_source == "neutral_fallback":
            neutral_mitigation_feasibility_fallback_action_ids.append(action.action_id)
        if mitigation_feasibility_action_score_missing:
            neutral_mitigation_feasibility_missing_score_action_ids.append(
                action.action_id
            )

        # Block 2c: Resolve financial feasibility component from city-scoped API scores.
        financial_record = financial_feasibility_scores_by_action_id.get(
            action.action_id
        )
        financial_feasibility_score_present = financial_record is not None
        financial_feasibility_action_score_missing = (
            financial_record is not None
            and financial_record.financial_feasibility is None
        )
        financial_feasibility_component_score = (
            financial_record.financial_feasibility
            if financial_record is not None
            and financial_record.financial_feasibility is not None
            else NEUTRAL_COMPONENT_SCORE
        )
        financial_feasibility_component_source = (
            "action_financial_feasibility_score"
            if financial_record is not None
            and financial_record.financial_feasibility is not None
            else "neutral_fallback"
        )
        if not financial_feasibility_score_present:
            missing_financial_feasibility_score_action_ids.append(action.action_id)
        if financial_feasibility_component_source == "neutral_fallback":
            neutral_financial_feasibility_fallback_action_ids.append(action.action_id)
        if financial_feasibility_action_score_missing:
            neutral_financial_feasibility_missing_score_action_ids.append(
                action.action_id
            )

        # Block 2d: Combine weighted components into one feasibility score.
        legal_contribution = FEASIBILITY_WEIGHT_LEGAL * legal_component_score
        mitigation_feasibility_contribution = (
            FEASIBILITY_WEIGHT_MITIGATION_FEASIBILITY
            * mitigation_feasibility_component_score
        )
        financial_feasibility_contribution = (
            FEASIBILITY_WEIGHT_FINANCIAL_FEASIBILITY
            * financial_feasibility_component_score
        )
        feasibility_score = (
            legal_contribution
            + mitigation_feasibility_contribution
            + financial_feasibility_contribution
        )
        score_by_action_id[action.action_id] = feasibility_score

        # Block 2e: Store action-level explainability payload.
        evidence_by_action_id[action.action_id] = {
            "legal_assessment_present": legal_assessment_present,
            "legal_assessment_missing": not legal_assessment_present,
            "legal_verdict_category": (
                assessment.verdict_category if assessment is not None else None
            ),
            "legal_component_score": legal_component_score,
            "legal_component_source": legal_component_source,
            "legal_weight": FEASIBILITY_WEIGHT_LEGAL,
            "legal_contribution": legal_contribution,
            "legal_verdict_score_missing": legal_verdict_score_missing,
            "ownership_category": (
                assessment.ownership_category if assessment is not None else None
            ),
            "ownership_score": (
                assessment.ownership_score if assessment is not None else None
            ),
            "ownership_description": (
                assessment.ownership_description if assessment is not None else None
            ),
            "ownership_description_es": (
                assessment.ownership_description_i18n.get("es")
                if assessment is not None
                else None
            ),
            "restrictions_category": (
                assessment.restrictions_category if assessment is not None else None
            ),
            "restrictions_score": (
                assessment.restrictions_score if assessment is not None else None
            ),
            "restrictions_description": (
                assessment.restrictions_description if assessment is not None else None
            ),
            "restrictions_description_es": (
                assessment.restrictions_description_i18n.get("es")
                if assessment is not None
                else None
            ),
            "legal_justification": (
                assessment.legal_justification_i18n.get("es")
                or assessment.legal_justification
                if assessment is not None
                else None
            ),
            "legal_justification_en": (
                assessment.legal_justification_i18n.get("en")
                if assessment is not None
                else None
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
            "mitigation_feasibility_component_score": (
                mitigation_feasibility_component_score
            ),
            "mitigation_feasibility_component_source": (
                mitigation_feasibility_component_source
            ),
            "mitigation_feasibility_weight": (
                FEASIBILITY_WEIGHT_MITIGATION_FEASIBILITY
            ),
            "mitigation_feasibility_contribution": (
                mitigation_feasibility_contribution
            ),
            "mitigation_feasibility_score_present": (
                mitigation_feasibility_score_present
            ),
            "mitigation_feasibility_score_missing": (
                not mitigation_feasibility_score_present
            ),
            "mitigation_feasibility_action_score_missing": (
                mitigation_feasibility_action_score_missing
            ),
            "global_mitigation_option": (
                feasibility_record.global_mitigation_option
                if feasibility_record is not None
                else None
            ),
            "action_mapping_strength": (
                feasibility_record.action_mapping_strength
                if feasibility_record is not None
                else None
            ),
            "option_family": (
                feasibility_record.option_family
                if feasibility_record is not None
                else None
            ),
            "n_feasibility_dimensions": (
                feasibility_record.n_feasibility_dimensions
                if feasibility_record is not None
                else None
            ),
            "dimension_scores": (
                dict(feasibility_record.dimension_scores)
                if feasibility_record is not None
                else {}
            ),
            "feasibility_breakdown": (
                dict(feasibility_record.breakdown)
                if feasibility_record is not None
                else {}
            ),
            "rank_within_city": (
                feasibility_record.rank_within_city
                if feasibility_record is not None
                else None
            ),
            "financial_feasibility_component_score": (
                financial_feasibility_component_score
            ),
            "financial_feasibility_component_source": (
                financial_feasibility_component_source
            ),
            "financial_feasibility_weight": FEASIBILITY_WEIGHT_FINANCIAL_FEASIBILITY,
            "financial_feasibility_contribution": (
                financial_feasibility_contribution
            ),
            "financial_feasibility_score_present": (
                financial_feasibility_score_present
            ),
            "financial_feasibility_score_missing": (
                not financial_feasibility_score_present
            ),
            "financial_feasibility_action_score_missing": (
                financial_feasibility_action_score_missing
            ),
            "financial_feasibility_route": (
                financial_record.route if financial_record is not None else None
            ),
            "financial_feasibility_reason": (
                financial_record.reason if financial_record is not None else None
            ),
            "financial_feasibility_sector": (
                financial_record.sector if financial_record is not None else None
            ),
            "financial_feasibility_inputs": (
                dict(financial_record.inputs)
                if financial_record is not None
                else {}
            ),
            "financial_feasibility_links": (
                dict(financial_record.links)
                if financial_record is not None
                else {}
            ),
            "feasibility_score": feasibility_score,
        }

    # Block 3: Return score map, explainability evidence, and fallback diagnostics.
    return BlockScoreResult(
        score_by_action_id=score_by_action_id,
        evidence_by_action_id=evidence_by_action_id,
        metadata={
            "missing_legal_assessment_actions_count": len(
                missing_legal_assessment_action_ids
            ),
            "missing_legal_assessment_action_ids": sorted(
                missing_legal_assessment_action_ids
            ),
            "neutral_legal_fallback_actions_count": len(
                neutral_legal_fallback_action_ids
            ),
            "neutral_legal_fallback_action_ids": sorted(
                neutral_legal_fallback_action_ids
            ),
            "neutral_legal_fallback_missing_score_actions_count": len(
                neutral_legal_fallback_missing_score_action_ids
            ),
            "neutral_legal_fallback_missing_score_action_ids": sorted(
                neutral_legal_fallback_missing_score_action_ids
            ),
            "missing_mitigation_feasibility_score_actions_count": len(
                missing_mitigation_feasibility_score_action_ids
            ),
            "missing_mitigation_feasibility_score_action_ids": sorted(
                missing_mitigation_feasibility_score_action_ids
            ),
            "neutral_mitigation_feasibility_fallback_actions_count": len(
                neutral_mitigation_feasibility_fallback_action_ids
            ),
            "neutral_mitigation_feasibility_fallback_action_ids": sorted(
                neutral_mitigation_feasibility_fallback_action_ids
            ),
            "neutral_mitigation_feasibility_missing_score_actions_count": len(
                neutral_mitigation_feasibility_missing_score_action_ids
            ),
            "neutral_mitigation_feasibility_missing_score_action_ids": sorted(
                neutral_mitigation_feasibility_missing_score_action_ids
            ),
            "missing_financial_feasibility_score_actions_count": len(
                missing_financial_feasibility_score_action_ids
            ),
            "missing_financial_feasibility_score_action_ids": sorted(
                missing_financial_feasibility_score_action_ids
            ),
            "neutral_financial_feasibility_fallback_actions_count": len(
                neutral_financial_feasibility_fallback_action_ids
            ),
            "neutral_financial_feasibility_fallback_action_ids": sorted(
                neutral_financial_feasibility_fallback_action_ids
            ),
            "neutral_financial_feasibility_missing_score_actions_count": len(
                neutral_financial_feasibility_missing_score_action_ids
            ),
            "neutral_financial_feasibility_missing_score_action_ids": sorted(
                neutral_financial_feasibility_missing_score_action_ids
            ),
        },
    )
