"""Final weighted scoring and ranking block."""

from __future__ import annotations

from app.modules.prioritizer.models import Action, ScoredAction


def run(
    actions: list[Action],
    impact_scores: dict[str, float],
    alignment_scores: dict[str, float],
    feasibility_scores: dict[str, float],
    weights: dict[str, float],
    top_n: int | None,
) -> list[ScoredAction]:
    """
    Aggregate pillar scores and return sorted ranked actions.

    Sorting is deterministic: final score desc, then action_id asc.
    """

    scored_actions: list[ScoredAction] = []
    for action in actions:
        impact_score = impact_scores.get(action.action_id, 0.0)
        alignment_score = alignment_scores.get(action.action_id, 0.0)
        feasibility_score = feasibility_scores.get(action.action_id, 0.0)

        final_score = (
            weights["impact"] * impact_score
            + weights["alignment"] * alignment_score
            + weights["feasibility"] * feasibility_score
        )
        scored_actions.append(
            ScoredAction(
                action=action,
                impact_score=impact_score,
                alignment_score=alignment_score,
                feasibility_score=feasibility_score,
                final_score=final_score,
                rank=0,
                evidence={},
            )
        )

    scored_actions.sort(key=lambda item: (-item.final_score, item.action.action_id))

    if top_n is not None:
        scored_actions = scored_actions[:top_n]

    for index, item in enumerate(scored_actions, start=1):
        item.rank = index

    return scored_actions


__all__ = ["run"]
