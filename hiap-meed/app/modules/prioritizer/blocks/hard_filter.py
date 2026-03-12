"""Hard filter block for action exclusion rules."""

from __future__ import annotations

from app.modules.prioritizer.internal_models import Action, HardFilterResult


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
    *, actions: list[Action], evidence: dict[str, dict[str, object]]
) -> list[Action]:
    """
    Apply legal hard-requirement filtering to currently eligible actions.

    Current behavior is a stub: no additional legal exclusions are applied yet.
    """

    for action in actions:
        action_evidence = evidence.setdefault(action.action_id, {"discard_reason": None})
        action_evidence["legal_filter_status"] = "not_applied_stub"
    return actions


def run(actions: list[Action], excluded_actions_free_text: str | None) -> HardFilterResult:
    """
    Filter out ineligible actions before scoring.

    Inputs:
    - `actions`: Full action list from data client.
    - `excluded_actions_free_text`: Frontend free-text exclusion guidance.
    """

    excluded_action_ids = _resolve_excluded_action_ids_from_text(
        actions=actions,
        excluded_actions_free_text=excluded_actions_free_text,
    )
    valid_actions, discarded_excluded, evidence = _apply_free_text_exclusion_filter(
        actions=actions,
        excluded_action_ids=excluded_action_ids,
    )
    valid_actions = _apply_legal_hard_filter(actions=valid_actions, evidence=evidence)

    return HardFilterResult(
        valid_actions=valid_actions,
        discarded_excluded=discarded_excluded,
        evidence=evidence,
    )
