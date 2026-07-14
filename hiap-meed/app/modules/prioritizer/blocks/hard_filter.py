"""Hard filter block for action exclusion rules."""

from __future__ import annotations

from app.modules.prioritizer.internal_models import (
    Action,
    LegalAssessmentRecord,
    HardFilterResult,
)


def _apply_confirmed_exclusion_filter(
    *,
    actions: list[Action],
    excluded_action_ids: set[str],
) -> tuple[list[Action], list[Action], dict[str, dict[str, object]]]:
    """
    Apply action exclusion by resolved action IDs.

    Returns:
    - actions that remain eligible
    - actions discarded by exclusion
    - evidence keyed by action ID
    """

    valid_actions: list[Action] = []
    discarded_excluded: list[Action] = []
    evidence: dict[str, dict[str, object]] = {}

    # First gate: user-confirmed action IDs from the preview workflow.
    for action in actions:
        if action.action_id in excluded_action_ids:
            discarded_excluded.append(action)
            evidence[action.action_id] = {
                "discard_reason": "user_excluded",
                "matched_excluded_action_id": action.action_id,
                "confirmed_exclusion": True,
            }
            continue
        valid_actions.append(action)
        evidence[action.action_id] = {
            "discard_reason": None,
            "confirmed_exclusion": False,
        }

    return valid_actions, discarded_excluded, evidence


def _apply_legal_hard_filter(
    *,
    actions: list[Action],
    evidence: dict[str, dict[str, object]],
    legal_assessments_by_action_id: dict[str, LegalAssessmentRecord] | None,
) -> tuple[list[Action], list[Action]]:
    """
    Apply category-based legal filtering to currently eligible actions.

    Rules:
    - Discard action when `verdict_category == blocked`.
    - Keep action when category is missing or any non-blocking value.
    """
    if legal_assessments_by_action_id is None:
        legal_assessments_by_action_id = {}

    valid_actions: list[Action] = []
    discarded_legal: list[Action] = []

    for action in actions:
        # Reuse hard-filter evidence so the caller gets one combined trace per action.
        action_evidence = evidence.setdefault(action.action_id, {"discard_reason": None})
        assessment = legal_assessments_by_action_id.get(action.action_id)
        if assessment is None:
            action_evidence["legal_assessment_present"] = False
            action_evidence["legal_verdict_category"] = None
            action_evidence["legal_hard_filter_blocked"] = False
            valid_actions.append(action)
            continue

        verdict_category = (
            assessment.verdict_category.strip().lower()
            if isinstance(assessment.verdict_category, str)
            and assessment.verdict_category.strip()
            else None
        )
        action_evidence["legal_assessment_present"] = True
        action_evidence["legal_verdict_category"] = verdict_category
        action_evidence["legal_verdict_score"] = assessment.verdict_score
        action_evidence["legal_hard_filter_blocked"] = verdict_category == "blocked"
        action_evidence["legal_assessment_summary"] = {
            "country_code": assessment.country_code,
            "gpc_sector": assessment.gpc_sector,
            "ownership_category": assessment.ownership_category,
            "ownership_score": assessment.ownership_score,
            "ownership_description": assessment.ownership_description,
            "ownership_description_es": assessment.ownership_description_i18n.get("es"),
            "restrictions_category": assessment.restrictions_category,
            "restrictions_score": assessment.restrictions_score,
            "restrictions_description": assessment.restrictions_description,
            "restrictions_description_es": (
                assessment.restrictions_description_i18n.get("es")
            ),
            "legal_justification": (
                assessment.legal_justification_i18n.get("es")
                or assessment.legal_justification
            ),
            "legal_justification_en": assessment.legal_justification_i18n.get("en"),
            "legal_references": list(assessment.legal_references),
            "analysis_date": assessment.analysis_date,
            "generation_method": assessment.generation_method,
        }

        if verdict_category == "blocked":
            action_evidence["discard_reason"] = "legal_verdict_blocked"
            discarded_legal.append(action)
            continue

        valid_actions.append(action)

    return valid_actions, discarded_legal


def run(
    actions: list[Action],
    excluded_action_ids: list[str] | None = None,
    legal_assessments_by_action_id: dict[str, LegalAssessmentRecord] | None = None,
) -> HardFilterResult:
    """
    Filter out ineligible actions before scoring.

    Inputs:
    - `actions`: Full action list from data client.
    - `excluded_action_ids`: User-confirmed action IDs to remove.
    """

    # Step 1: apply confirmed action exclusions and initialize evidence entries.
    confirmed_excluded_action_ids = set(excluded_action_ids or [])
    valid_actions, discarded_excluded, evidence = _apply_confirmed_exclusion_filter(
        actions=actions,
        excluded_action_ids=confirmed_excluded_action_ids,
    )
    # Step 2: apply hard legal gate to the remaining candidates.
    valid_actions, discarded_legal = _apply_legal_hard_filter(
        actions=valid_actions,
        evidence=evidence,
        legal_assessments_by_action_id=legal_assessments_by_action_id,
    )

    return HardFilterResult(
        valid_actions=valid_actions,
        discarded_excluded=discarded_excluded,
        discarded_legal=discarded_legal,
        evidence=evidence,
    )
