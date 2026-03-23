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
from app.modules.prioritizer.internal_models import Action
from app.modules.prioritizer.models import PrioritizationResponse
from app.services.data_clients import (
    ActionDataApiClient,
    CityDataApiClient,
    LegalDataApiClient,
)
from app.utils.artifacts import ArtifactWriter
from app.utils.timing import time_block


logger = logging.getLogger(__name__)


def _sorted_action_ids(actions: list[Action]) -> list[str]:
    """Return all action IDs in deterministic sorted order."""
    action_ids = [action.action_id for action in actions]
    return sorted(action_ids)


def _score_stats(score_by_action_id: dict[str, float]) -> dict[str, float | int | bool]:
    """Return compact score distribution stats for one block."""
    if not score_by_action_id:
        return {"actions": 0, "all_scores_zero": True}
    scores = list(score_by_action_id.values())
    return {
        "actions": len(scores),
        "all_scores_zero": all(score == 0.0 for score in scores),
        "min_score": min(scores),
        "max_score": max(scores),
    }


def _all_block_evidence(
    evidence_by_action_id: dict[str, dict[str, object]] | None,
) -> dict[str, dict[str, object]]:
    """Return full block evidence keyed by action ID in deterministic order."""
    if not evidence_by_action_id:
        return {}
    sorted_ids = sorted(evidence_by_action_id.keys())
    return {action_id: evidence_by_action_id[action_id] for action_id in sorted_ids}


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
    city_emissions_by_gpc_ref: dict[str, float],
    internal_request_id: UUID,
    city_data_api_client: CityDataApiClient,
    action_data_api_client: ActionDataApiClient,
    legal_data_api_client: LegalDataApiClient,
) -> PrioritizationResponse:
    """
    Run the end-to-end prioritization workflow for one city request.

    Outputs:
    - Ordered `action_id` list in `PrioritizationResponse.ranked_action_ids`.
    - Metadata with timings, counts, and resolved weights.
    """

    # Phase 0: initialize request-scoped artifact writer and timing accumulator.
    artifact_writer = ArtifactWriter(request_id=internal_request_id)
    timings: dict[str, float] = {}
    logger.info(
        "Prioritization started internal_request_id=%s locode=%s top_n=%s weights_override_provided=%s",
        internal_request_id,
        locode,
        top_n,
        weights_override is not None,
    )

    # Phase 1: fetch city context used by alignment and feasibility blocks.
    with time_block("fetch_city") as block:
        city = city_data_api_client.get_city(locode)

    # Emit high-level and step-detail artifacts for city fetch.
    timings["fetch_city"] = block.elapsed_seconds
    fetch_city_payload = {
        "locode": locode,
        "elapsed_seconds": block.elapsed_seconds,
    }
    fetch_city_event_index = artifact_writer.write_event(
        "fetch_city.completed", fetch_city_payload
    )
    artifact_writer.write_step_detail(
        "fetch_city",
        {
            "locode": locode,
            "comuna_name": city.comuna_name,
            "region_name": city.region_name,
            "elapsed_seconds": block.elapsed_seconds,
        },
        event_index=fetch_city_event_index,
        event_type="fetch_city.completed",
    )
    logger.info(
        "Fetched city context internal_request_id=%s locode=%s elapsed_seconds=%.3f",
        internal_request_id,
        locode,
        block.elapsed_seconds,
    )

    # Phase 2: fetch action catalog that enters hard filtering.
    with time_block("fetch_actions") as block:
        actions = action_data_api_client.list_actions()
    # Emit high-level and step-detail artifacts for action fetch.
    timings["fetch_actions"] = block.elapsed_seconds
    fetch_actions_payload = {
        "total_actions": len(actions),
        "elapsed_seconds": block.elapsed_seconds,
    }
    fetch_actions_event_index = artifact_writer.write_event(
        "fetch_actions.completed", fetch_actions_payload
    )
    artifact_writer.write_step_detail(
        "fetch_actions",
        {
            "total_actions": len(actions),
            "action_ids": _sorted_action_ids(actions),
            "elapsed_seconds": block.elapsed_seconds,
        },
        event_index=fetch_actions_event_index,
        event_type="fetch_actions.completed",
    )
    logger.info(
        "Fetched actions internal_request_id=%s locode=%s total_actions=%s elapsed_seconds=%.3f",
        internal_request_id,
        locode,
        len(actions),
        block.elapsed_seconds,
    )

    # Phase 3: fetch legal requirements used by hard legal filtering.
    with time_block("fetch_legal_requirements") as block:
        legal_requirements_by_action_id = legal_data_api_client.get_action_legal_requirements(
            locode
        )
    # Emit high-level and step-detail artifacts for legal requirement fetch.
    timings["fetch_legal_requirements"] = block.elapsed_seconds
    fetch_legal_payload = {
        "actions_with_legal_requirements": len(legal_requirements_by_action_id),
        "elapsed_seconds": block.elapsed_seconds,
    }
    fetch_legal_event_index = artifact_writer.write_event(
        "fetch_legal_requirements.completed", fetch_legal_payload
    )
    artifact_writer.write_step_detail(
        "fetch_legal_requirements",
        {
            "actions_with_legal_requirements": len(legal_requirements_by_action_id),
            "action_ids_with_requirements": sorted(
                legal_requirements_by_action_id.keys()
            ),
            "elapsed_seconds": block.elapsed_seconds,
        },
        event_index=fetch_legal_event_index,
        event_type="fetch_legal_requirements.completed",
    )
    logger.info(
        "Fetched legal requirements internal_request_id=%s locode=%s actions_with_requirements=%s elapsed_seconds=%.3f",
        internal_request_id,
        locode,
        len(legal_requirements_by_action_id),
        block.elapsed_seconds,
    )

    # Phase 4: validate and resolve ranking weights for this run.
    with time_block("validate_weights") as block:
        try:
            weights = validate_weights(weights_override)
        except Exception as error:
            timings["validate_weights"] = block.elapsed_seconds
            validate_weights_failed_payload = {
                "weights_override_provided": weights_override is not None,
                "requested_weights_override": weights_override,
                "error": str(error),
                "elapsed_seconds": block.elapsed_seconds,
            }
            validate_weights_failed_event_index = artifact_writer.write_event(
                "validate_weights.failed", validate_weights_failed_payload
            )
            artifact_writer.write_step_detail(
                "validate_weights",
                validate_weights_failed_payload,
                event_index=validate_weights_failed_event_index,
                event_type="validate_weights.failed",
            )
            raise
    # Emit high-level and step-detail artifacts for weight resolution.
    timings["validate_weights"] = block.elapsed_seconds
    validate_weights_payload = {
        "weights_override_provided": weights_override is not None,
        "requested_weights_override": weights_override,
        "weights": weights,
        "elapsed_seconds": block.elapsed_seconds,
    }
    validate_weights_event_index = artifact_writer.write_event(
        "validate_weights.completed", validate_weights_payload
    )
    artifact_writer.write_step_detail(
        "validate_weights",
        validate_weights_payload,
        event_index=validate_weights_event_index,
        event_type="validate_weights.completed",
    )

    # Phase 5: run hard filter to remove excluded and legally blocked actions.
    with time_block("hard_filter") as block:
        hard_filter_result = hard_filter.run(
            actions=actions,
            excluded_actions_free_text=excluded_actions_free_text,
            legal_requirements_by_action_id=legal_requirements_by_action_id,
        )
    # Build discard diagnostics and emit hard-filter artifacts.
    timings["hard_filter"] = block.elapsed_seconds
    discarded_excluded_ids = [item.action_id for item in hard_filter_result.discarded_excluded]
    discarded_legal_ids = [item.action_id for item in hard_filter_result.discarded_legal]
    hard_filter_payload = {
        "valid_actions": len(hard_filter_result.valid_actions),
        "discarded_excluded": len(discarded_excluded_ids),
        "discarded_legal": len(discarded_legal_ids),
        "elapsed_seconds": block.elapsed_seconds,
    }
    hard_filter_event_index = artifact_writer.write_event(
        "hard_filter.completed", hard_filter_payload
    )
    artifact_writer.write_step_detail(
        "hard_filter",
        {
            "valid_actions": len(hard_filter_result.valid_actions),
            "discarded_excluded": len(discarded_excluded_ids),
            "discarded_legal": len(discarded_legal_ids),
            "discarded_excluded_action_ids": sorted(discarded_excluded_ids),
            "discarded_legal_action_ids": sorted(discarded_legal_ids),
            "valid_action_ids": _sorted_action_ids(hard_filter_result.valid_actions),
            "discarded_legal_reasons_by_action_id": {
                action_id: {
                    "discard_reason": hard_filter_result.evidence.get(action_id, {}).get(
                        "discard_reason"
                    ),
                    "failed_requirements_count": hard_filter_result.evidence.get(
                        action_id, {}
                    ).get("hard_requirements_failed_count", 0),
                }
                for action_id in sorted(discarded_legal_ids)
            },
            "elapsed_seconds": block.elapsed_seconds,
        },
        event_index=hard_filter_event_index,
        event_type="hard_filter.completed",
    )
    logger.info(
        "Hard filter completed internal_request_id=%s locode=%s valid_actions=%s discarded_legal=%s discarded_excluded=%s elapsed_seconds=%.3f",
        internal_request_id,
        locode,
        len(hard_filter_result.valid_actions),
        len(discarded_legal_ids),
        len(discarded_excluded_ids),
        block.elapsed_seconds,
    )

    # Phase 6: run Impact block scoring on hard-filtered actions.
    with time_block("impact") as block:
        impact_result = impact.run(
            hard_filter_result.valid_actions,
            city_emissions_by_gpc_ref=city_emissions_by_gpc_ref,
        )
    # Emit impact score stats and detailed evidence artifacts.
    timings["impact"] = block.elapsed_seconds
    impact_payload = {
        **_score_stats(impact_result.score_by_action_id),
        "elapsed_seconds": block.elapsed_seconds,
    }
    impact_event_index = artifact_writer.write_event("impact.completed", impact_payload)
    artifact_writer.write_step_detail(
        "impact",
        {
            **_score_stats(impact_result.score_by_action_id),
            "evidence_by_action_id": _all_block_evidence(
                impact_result.evidence_by_action_id
            ),
            "elapsed_seconds": block.elapsed_seconds,
        },
        event_index=impact_event_index,
        event_type="impact.completed",
    )

    # Phase 7: run Alignment block scoring on hard-filtered actions.
    with time_block("alignment") as block:
        alignment_result = alignment.run(hard_filter_result.valid_actions, city)
    # Emit alignment score stats and detailed evidence artifacts.
    timings["alignment"] = block.elapsed_seconds
    alignment_payload = {
        **_score_stats(alignment_result.score_by_action_id),
        "elapsed_seconds": block.elapsed_seconds,
    }
    alignment_event_index = artifact_writer.write_event(
        "alignment.completed", alignment_payload
    )
    artifact_writer.write_step_detail(
        "alignment",
        {
            **_score_stats(alignment_result.score_by_action_id),
            "evidence_by_action_id": _all_block_evidence(
                alignment_result.evidence_by_action_id
            ),
            "elapsed_seconds": block.elapsed_seconds,
        },
        event_index=alignment_event_index,
        event_type="alignment.completed",
    )

    # Phase 8: run Feasibility block scoring on hard-filtered actions.
    with time_block("feasibility") as block:
        feasibility_result = feasibility.run(hard_filter_result.valid_actions, city)
    # Emit feasibility score stats and detailed evidence artifacts.
    timings["feasibility"] = block.elapsed_seconds
    feasibility_payload = {
        **_score_stats(feasibility_result.score_by_action_id),
        "elapsed_seconds": block.elapsed_seconds,
    }
    feasibility_event_index = artifact_writer.write_event(
        "feasibility.completed", feasibility_payload
    )
    artifact_writer.write_step_detail(
        "feasibility",
        {
            **_score_stats(feasibility_result.score_by_action_id),
            "evidence_by_action_id": _all_block_evidence(
                feasibility_result.evidence_by_action_id
            ),
            "elapsed_seconds": block.elapsed_seconds,
        },
        event_index=feasibility_event_index,
        event_type="feasibility.completed",
    )
    artifact_writer.write_event(
        "pillar_scores.completed",
        {
            "impact_actions": len(impact_result.score_by_action_id),
            "alignment_actions": len(alignment_result.score_by_action_id),
            "feasibility_actions": len(feasibility_result.score_by_action_id),
        },
    )

    # Phase 9: aggregate pillar scores into final ranking.
    with time_block("final_scoring") as block:
        scored_actions = final_scoring.run(
            actions=hard_filter_result.valid_actions,
            impact_scores=impact_result.score_by_action_id,
            alignment_scores=alignment_result.score_by_action_id,
            feasibility_scores=feasibility_result.score_by_action_id,
            weights=weights,
            top_n=top_n,
        )
    # Emit final-scoring artifacts, including top ranked rows.
    timings["final_scoring"] = block.elapsed_seconds
    final_scoring_payload = {
        "ranked_actions": len(scored_actions),
        "top_n": top_n,
        "elapsed_seconds": block.elapsed_seconds,
    }
    final_scoring_event_index = artifact_writer.write_event(
        "final_scoring.completed", final_scoring_payload
    )
    artifact_writer.write_step_detail(
        "final_scoring",
        {
            "ranked_actions": len(scored_actions),
            "top_n": top_n,
            "top_ranked_actions": [
                {
                    "rank": item.rank,
                    "action_id": item.action.action_id,
                    "final_score": item.final_score,
                    "impact_score": item.impact_score,
                    "alignment_score": item.alignment_score,
                    "feasibility_score": item.feasibility_score,
                }
                for item in scored_actions
            ],
            "elapsed_seconds": block.elapsed_seconds,
        },
        event_index=final_scoring_event_index,
        event_type="final_scoring.completed",
    )

    # Phase 10: attach per-block evidence into each ranked action object.
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

    # Phase 11: build response metadata with counts and timings.
    ranked_action_ids = [item.action.action_id for item in scored_actions]

    metadata: dict[str, object] = {
        "internal_request_id": str(internal_request_id),
        "locode": locode,
        "weights": weights,
        "timings": timings,
        "hard_filter_evidence_by_action_id": hard_filter_result.evidence,
        "counts": {
            "total_actions": len(actions),
            "valid_actions": len(hard_filter_result.valid_actions),
            "discarded_excluded": len(hard_filter_result.discarded_excluded),
            "discarded_legal": len(hard_filter_result.discarded_legal),
            "ranked_actions": len(ranked_action_ids),
        },
    }
    # Emit final response and run-summary artifacts.
    response_event_index = artifact_writer.write_event(
        "response.completed",
        {
            "ranked_action_ids": ranked_action_ids,
            "counts": metadata["counts"],
        },
    )
    artifact_writer.write_step_detail(
        "response",
        {
            "locode": locode,
            "counts": metadata["counts"],
            "weights": weights,
            "ranked_action_ids": ranked_action_ids,
            "discarded_excluded_action_ids": sorted(discarded_excluded_ids),
            "discarded_legal_action_ids": sorted(discarded_legal_ids),
            "timings": timings,
        },
        event_index=response_event_index,
        event_type="response.completed",
    )
    artifact_writer.write_event(
        "run_summary.completed",
        {
            "locode": locode,
            "counts": metadata["counts"],
            "discarded_excluded_action_ids": sorted(discarded_excluded_ids),
            "discarded_legal_action_ids": sorted(discarded_legal_ids),
            "timings": timings,
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
