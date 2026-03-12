"""Hard filter block for action exclusion rules."""

from __future__ import annotations

from app.modules.prioritizer.internal_models import (
    Action,
    HardFilterLegalRequirement,
    HardFilterResult,
)

HARD_REQUIREMENT_STRENGTHS = {"mandatory", "required"}


def _resolve_excluded_action_ids_from_text(
    *, actions: list[Action], excluded_actions_free_text: str | None
) -> set[str]:
    """
    Resolve free-text exclusion guidance into concrete action IDs.

    Current behavior is a stub: it always returns an empty set.
    Future behavior will semantically match free text against action metadata.
    """

    del actions
    del excluded_actions_free_text
    return set()


def _apply_free_text_exclusion_filter(
    *, actions: list[Action], excluded_action_ids: set[str]
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

    # First gate: explicit exclusions resolved from frontend free text.
    for action in actions:
        if action.action_id in excluded_action_ids:
            discarded_excluded.append(action)
            evidence[action.action_id] = {
                "discard_reason": "excluded",
                "matched_excluded_action_id": action.action_id,
            }
            continue
        valid_actions.append(action)
        evidence[action.action_id] = {"discard_reason": None}

    return valid_actions, discarded_excluded, evidence


def _apply_legal_hard_filter(
    *,
    actions: list[Action],
    evidence: dict[str, dict[str, object]],
    legal_requirements_by_action_id: dict[str, list[HardFilterLegalRequirement]] | None,
) -> tuple[list[Action], list[Action]]:
    """
    Apply legal hard-requirement filtering to currently eligible actions.

    Rules:
    - Hard requirements are those with strength `mandatory` or `required`.
    - Discard action when any hard requirement is `not_aligned`.
    - Keep action when hard requirements are all `aligns` or `no_evidence`.
    """

    # Treat missing legal payload as "no hard legal requirements configured".
    if legal_requirements_by_action_id is None:
        legal_requirements_by_action_id = {}

    valid_actions: list[Action] = []
    discarded_legal: list[Action] = []

    for action in actions:
        # Reuse hard-filter evidence so the caller gets one combined trace per action.
        action_evidence = evidence.setdefault(
            action.action_id, {"discard_reason": None}
        )
        requirements = legal_requirements_by_action_id.get(action.action_id, [])
        # Hard gate only evaluates mandatory/required strengths.
        hard_requirements = [
            requirement
            for requirement in requirements
            if requirement.strength.lower() in HARD_REQUIREMENT_STRENGTHS
        ]

        failed_requirements: list[dict[str, object]] = []
        unknown_requirements: list[dict[str, object]] = []

        # Split hard requirements into blocking failures and non-blocking unknowns
        for requirement in hard_requirements:
            requirement_summary = {
                "signal_code": requirement.signal_code,
                "signal_name": requirement.signal_name,
                "strength": requirement.strength,
                "alignment_status": requirement.alignment_status,
                "operator": requirement.operator,
                "required_value": requirement.required_value,
                "legal_signal_value": requirement.legal_signal_value,
                "evidence_ids": list(requirement.evidence_ids),
                "evidence_count": requirement.evidence_count,
                "location_scope": requirement.location_scope,
                "location_name": requirement.location_name,
            }
            alignment_status = requirement.alignment_status.lower()
            if alignment_status == "not_aligned":
                failed_requirements.append(requirement_summary)
            elif alignment_status == "no_evidence":
                unknown_requirements.append(requirement_summary)

        # Always expose summary counters for observability and UI status labels.
        action_evidence["hard_requirements_checked_count"] = len(hard_requirements)
        action_evidence["hard_requirements_failed_count"] = len(failed_requirements)
        action_evidence["hard_requirements_unknown_count"] = len(unknown_requirements)
        action_evidence["unknown_requirements"] = unknown_requirements

        # Any failed hard requirement blocks the action from scoring.
        if failed_requirements:
            action_evidence["discard_reason"] = "legal_hard_requirement_failed"
            action_evidence["failed_requirements"] = failed_requirements
            discarded_legal.append(action)
            continue

        # Actions with no hard failures continue to scoring.
        valid_actions.append(action)

    return valid_actions, discarded_legal


def run(
    actions: list[Action],
    excluded_actions_free_text: str | None,
    legal_requirements_by_action_id: (
        dict[str, list[HardFilterLegalRequirement]] | None
    ) = None,
) -> HardFilterResult:
    """
    Filter out ineligible actions before scoring.

    Inputs:
    - `actions`: Full action list from data client.
    - `excluded_actions_free_text`: Frontend free-text exclusion guidance.
    """

    # Step 1: resolve free-text exclusions into concrete action IDs (stub for now).
    excluded_action_ids = _resolve_excluded_action_ids_from_text(
        actions=actions,
        excluded_actions_free_text=excluded_actions_free_text,
    )
    # Step 2: apply explicit action exclusions and initialize evidence entries.
    valid_actions, discarded_excluded, evidence = _apply_free_text_exclusion_filter(
        actions=actions,
        excluded_action_ids=excluded_action_ids,
    )
    # Step 3: apply hard legal gate to the remaining candidates.
    valid_actions, discarded_legal = _apply_legal_hard_filter(
        actions=valid_actions,
        evidence=evidence,
        legal_requirements_by_action_id=legal_requirements_by_action_id,
    )

    return HardFilterResult(
        valid_actions=valid_actions,
        discarded_excluded=discarded_excluded,
        discarded_legal=discarded_legal,
        evidence=evidence,
    )
