"""Final weighted scoring and ranking block."""

from __future__ import annotations

from app.modules.prioritizer.internal_models import Action, ScoredAction


def _weight_priority(weights: dict[str, float]) -> list[str]:
    """Return pillar names ordered by descending weight for tie-breaks."""
    default_order = {"impact": 0, "alignment": 1, "feasibility": 2}
    return sorted(
        default_order.keys(),
        key=lambda pillar: (-weights[pillar], default_order[pillar]),
    )


def _pillar_score(scored_action: ScoredAction, pillar: str) -> float:
    """Return the score value for one pillar name."""
    if pillar == "impact":
        return scored_action.impact_score
    if pillar == "alignment":
        return scored_action.alignment_score
    return scored_action.feasibility_score


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

    Sorting is deterministic:
    1) final_score desc
    2) tie-break by pillar scores using descending weight priority
    3) action_id asc as a final deterministic fallback

    Ranking semantics:
    - Apply `top_n` truncation first.
    - Assign competitive ranks inside the returned slice:
      equal `final_score` values share the same rank, and following ranks skip.
      Example: 1, 2, 3, 3, 5.
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

    priority_order = _weight_priority(weights)

    # Sort by final score first, then compare scores using weighted pillar priority.
    # Keep action_id as a final stable fallback when all score dimensions tie.
    scored_actions.sort(
        key=lambda item: (
            -item.final_score,
            *(-_pillar_score(item, pillar) for pillar in priority_order),
            item.action.action_id,
        )
    )

    if top_n is not None:
        scored_actions = scored_actions[:top_n]

    previous_score: float | None = None
    previous_rank = 0
    for index, item in enumerate(scored_actions, start=1):
        if previous_score is not None and item.final_score == previous_score:
            item.rank = previous_rank
        else:
            item.rank = index
            previous_rank = index
            previous_score = item.final_score

    return scored_actions
