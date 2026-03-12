"""Pipeline orchestrator for MEED prioritization."""

from __future__ import annotations

import logging
from uuid import UUID

from app.modules.prioritizer.blocks import (
    alignment,
    feasibility,
    final_scoring,
    hard_filter,
    impact,
)
from app.modules.prioritizer.config import validate_weights
from app.modules.prioritizer.models import PrioritizationResponse
from app.services.data_clients import ActionDataApiClient, CityDataApiClient
from app.utils.artifacts import ArtifactWriter
from app.utils.timing import time_block


logger = logging.getLogger(__name__)


def _safe_block_evidence(
    evidence: dict[str, dict[str, object]] | None, action_id: str
) -> dict[str, object]:
    """Return evidence dict for one action, or an empty dict if absent."""
    if evidence is None:
        return {}
    action_evidence = evidence.get(action_id)
    if action_evidence is None:
        return {}
    return dict(action_evidence)


def run_prioritization(
    *,
    locode: str,
    weights_override: dict[str, float] | None,
    top_n: int | None,
    excluded_actions_free_text: str | None,
    internal_request_id: UUID,
    city_data_api_client: CityDataApiClient,
    action_data_api_client: ActionDataApiClient,
) -> PrioritizationResponse:
    """
    Run the end-to-end prioritization workflow for one city request.

    Outputs:
    - Ordered `action_id` list in `PrioritizationResponse.ranked_action_ids`.
    - Metadata with timings, counts, and resolved weights.
    """

    artifact_writer = ArtifactWriter(request_id=internal_request_id)
    timings: dict[str, float] = {}

    with time_block("fetch_city") as block:
        city = city_data_api_client.get_city(locode)

    timings["fetch_city"] = block.elapsed_seconds
    artifact_writer.write_event(
        "fetch_city.completed",
        {
            "locode": locode,
            "city_context_rows": len(city.city_context),
            "elapsed_seconds": block.elapsed_seconds,
        },
    )

    with time_block("fetch_actions") as block:
        actions = action_data_api_client.list_actions()
    timings["fetch_actions"] = block.elapsed_seconds
    artifact_writer.write_event(
        "fetch_actions.completed",
        {"total_actions": len(actions), "elapsed_seconds": block.elapsed_seconds},
    )

    with time_block("validate_weights") as block:
        weights = validate_weights(weights_override)
    timings["validate_weights"] = block.elapsed_seconds
    artifact_writer.write_event(
        "validate_weights.completed",
        {"weights": weights, "elapsed_seconds": block.elapsed_seconds},
    )

    with time_block("hard_filter") as block:
        hard_filter_result = hard_filter.run(
            actions=actions,
            excluded_actions_free_text=excluded_actions_free_text,
        )
    timings["hard_filter"] = block.elapsed_seconds
    artifact_writer.write_event(
        "hard_filter.completed",
        {
            "valid_actions": len(hard_filter_result.valid_actions),
            "discarded_excluded": len(hard_filter_result.discarded_excluded),
            "elapsed_seconds": block.elapsed_seconds,
        },
    )

    with time_block("impact") as block:
        impact_result = impact.run(hard_filter_result.valid_actions)
    timings["impact"] = block.elapsed_seconds

    with time_block("alignment") as block:
        alignment_result = alignment.run(hard_filter_result.valid_actions, city)
    timings["alignment"] = block.elapsed_seconds

    with time_block("feasibility") as block:
        feasibility_result = feasibility.run(hard_filter_result.valid_actions, city)
    timings["feasibility"] = block.elapsed_seconds

    artifact_writer.write_event(
        "block_scores.completed",
        {
            "impact_actions": len(impact_result.score_by_action_id),
            "alignment_actions": len(alignment_result.score_by_action_id),
            "feasibility_actions": len(feasibility_result.score_by_action_id),
        },
    )

    with time_block("final_scoring") as block:
        scored_actions = final_scoring.run(
            actions=hard_filter_result.valid_actions,
            impact_scores=impact_result.score_by_action_id,
            alignment_scores=alignment_result.score_by_action_id,
            feasibility_scores=feasibility_result.score_by_action_id,
            weights=weights,
            top_n=top_n,
        )
    timings["final_scoring"] = block.elapsed_seconds

    for scored_action in scored_actions:
        action_id = scored_action.action.action_id
        scored_action.evidence = {
            "hard_filter": hard_filter_result.evidence.get(action_id, {}),
            "impact": _safe_block_evidence(
                impact_result.evidence_by_action_id, action_id
            ),
            "alignment": _safe_block_evidence(
                alignment_result.evidence_by_action_id, action_id
            ),
            "feasibility": _safe_block_evidence(
                feasibility_result.evidence_by_action_id,
                action_id,
            ),
        }

    ranked_action_ids = [item.action.action_id for item in scored_actions]

    metadata: dict[str, object] = {
        "internal_request_id": str(internal_request_id),
        "locode": locode,
        "weights": weights,
        "timings": timings,
        "counts": {
            "total_actions": len(actions),
            "valid_actions": len(hard_filter_result.valid_actions),
            "discarded_excluded": len(hard_filter_result.discarded_excluded),
            "ranked_actions": len(ranked_action_ids),
        },
    }
    artifact_writer.write_event(
        "response.completed",
        {
            "ranked_action_ids": ranked_action_ids,
            "counts": metadata["counts"],
        },
    )

    logger.info(
        "Prioritization complete internal_request_id=%s locode=%s ranked_actions=%s",
        internal_request_id,
        locode,
        len(ranked_action_ids),
    )
    return PrioritizationResponse(
        ranked_action_ids=ranked_action_ids, metadata=metadata
    )
