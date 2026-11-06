"""Pipelines of CCC v1, one per modality (scaffold).

Scaffold assumption: both modalities use the same three pillars. The
adaptation methodology may not; this is an open point, not a decision.
"""

import logging

from app.methodologies.ccc.v1.config_schema import MethodologyConfig
from app.methodologies.ccc.v1.steps.alignment import score_alignment
from app.methodologies.ccc.v1.steps.feasibility import score_feasibility
from app.methodologies.ccc.v1.steps.final_scoring import rank_by_pillars
from app.methodologies.ccc.v1.steps.hard_filter import apply_hard_filter
from app.methodologies.ccc.v1.steps.impact import score_impact
from app.shared.contracts import RankableItem, RankingResult

logger = logging.getLogger(__name__)


def _run_three_pillar_scaffold(
    items: list[RankableItem], config: MethodologyConfig
) -> RankingResult:
    """Run hard filter, the three pillars and final scoring on mock data.

    Args:
        items: Candidate items from the region adapter.
        config: Region-provided methodology parameters.

    Returns:
        Ranked eligible items and the excluded ones.
    """
    # Step 1: hard filter
    decisions = apply_hard_filter(items)
    eligible_ids = {decision.item_id for decision in decisions if decision.eligible}
    eligible_items = [item for item in items if item.id in eligible_ids]
    excluded = [decision for decision in decisions if not decision.eligible]

    # Step 2: pillar scores
    pillar_scores = {
        "impact": score_impact(eligible_items),
        "alignment": score_alignment(eligible_items),
        "feasibility": score_feasibility(eligible_items),
    }

    # Step 3: aggregate and rank
    ranked = rank_by_pillars(pillar_scores, config.weights, config.top_n)
    logger.info("CCC v1 scaffold pipeline ranked=%s excluded=%s", len(ranked), len(excluded))
    return RankingResult(ranked=ranked, excluded=excluded)


def run_mitigation(items: list[RankableItem], config: MethodologyConfig) -> RankingResult:
    """Run the mitigation pipeline (scaffold, mock data)."""
    return _run_three_pillar_scaffold(items, config)


def run_adaptation(items: list[RankableItem], config: MethodologyConfig) -> RankingResult:
    """Run the adaptation pipeline (scaffold, mock data).

    Uses the same three pillars only as a scaffold assumption.
    """
    return _run_three_pillar_scaffold(items, config)
