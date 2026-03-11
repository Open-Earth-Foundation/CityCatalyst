"""Hard filter block for action exclusion rules."""

from __future__ import annotations

from app.modules.prioritizer.internal_models import Action, HardFilterResult


def run(actions: list[Action], excluded_action_ids: set[str]) -> HardFilterResult:
    """
    Filter out excluded actions before scoring.

    Inputs:
    - `actions`: Full action list from data client.
    - `excluded_action_ids`: Action IDs to exclude from ranking.
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

    return HardFilterResult(
        valid_actions=valid_actions,
        discarded_excluded=discarded_excluded,
        evidence=evidence,
    )
