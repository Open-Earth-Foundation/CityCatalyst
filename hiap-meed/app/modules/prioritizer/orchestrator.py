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
from app.modules.prioritizer.models import PrioritizationResponse, RankedActionResult
from app.modules.prioritizer.services.explanations import generate_explanations
from app.services.data_clients import (
    ApiActionDataApiClient,
    ApiCityDataApiClient,
    ApiLegalDataApiClient,
    ApiPolicySignalsDataApiClient,
    MockActionDataApiClient,
    MockCityDataApiClient,
    MockLegalDataApiClient,
    MockPolicySignalsDataApiClient,
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


def _safe_float(value: object, default: float = 0.0) -> float:
    """Return float(value) when possible, otherwise a fallback."""
    if isinstance(value, int | float):
        return float(value)
    return default


def _build_evidence_summary(scored_action_evidence: dict[str, object]) -> dict[str, object]:
    """Build compact public explainability fields for one ranked action."""
    hard_filter_evidence = scored_action_evidence.get("hard_filter", {})
    impact_evidence = scored_action_evidence.get("impact", {})
    alignment_evidence = scored_action_evidence.get("alignment", {})
    feasibility_evidence = scored_action_evidence.get("feasibility", {})

    if not isinstance(hard_filter_evidence, dict):
        hard_filter_evidence = {}
    if not isinstance(impact_evidence, dict):
        impact_evidence = {}
    if not isinstance(alignment_evidence, dict):
        alignment_evidence = {}
    if not isinstance(feasibility_evidence, dict):
        feasibility_evidence = {}

    return {
        "hard_filter": {
            "discard_reason": hard_filter_evidence.get("discard_reason"),
            "hard_requirements_failed_count": hard_filter_evidence.get(
                "hard_requirements_failed_count", 0
            ),
            "hard_requirements_unknown_count": hard_filter_evidence.get(
                "hard_requirements_unknown_count", 0
            ),
        },
        "impact": {
            "impact_block_score": _safe_float(impact_evidence.get("impact_block_score")),
            "matched_city_gpc_refs_count": int(
                impact_evidence.get("matched_city_gpc_refs_count", 0)
            ),
            "emissions_reduction_share_of_city_total": _safe_float(
                impact_evidence.get("emissions_reduction_share_of_city_total")
            ),
            "timeline_component_score": _safe_float(
                impact_evidence.get("timeline_component_score")
            ),
        },
        "alignment": {
            "alignment_score": _safe_float(alignment_evidence.get("alignment_score")),
            "policy_component_score": _safe_float(
                alignment_evidence.get("policy_component_score")
            ),
            "sector_component_score": _safe_float(
                alignment_evidence.get("sector_component_score")
            ),
            "co_benefit_component_score": _safe_float(
                alignment_evidence.get("co_benefit_component_score")
            ),
            "timeframe_component_score": _safe_float(
                alignment_evidence.get("timeframe_component_score")
            ),
        },
        "feasibility": {
            "feasibility_score": _safe_float(
                feasibility_evidence.get("feasibility_score")
            ),
            "soft_legal_component_score": _safe_float(
                feasibility_evidence.get("soft_legal_component_score")
            ),
            "socioeconomic_component_score": _safe_float(
                feasibility_evidence.get("socioeconomic_component_score")
            ),
        },
    }


def _detail_filename(event_index: int | None, step_name: str) -> str:
    """Return expected detail filename for one step event."""
    if event_index is None:
        return f"<disabled>_{step_name}.json"
    return f"{event_index:03d}_{step_name}.json"


def run_prioritization(
    *,
    locode: str,
    weights_override: dict[str, float] | None,
    top_n: int | None,
    excluded_action_ids: list[str],
    requested_languages: list[str],
    explanation_language: str,
    city_preference_sectors: list[str],
    city_preference_timeframes: list[str],
    city_preference_co_benefit_keys: list[str],
    city_emissions_by_gpc_ref: dict[str, float],
    internal_request_id: UUID,
    city_data_api_client: MockCityDataApiClient | ApiCityDataApiClient,
    action_data_api_client: MockActionDataApiClient | ApiActionDataApiClient,
    legal_data_api_client: MockLegalDataApiClient | ApiLegalDataApiClient,
    policy_signals_data_api_client: (
        MockPolicySignalsDataApiClient | ApiPolicySignalsDataApiClient
    ),
    create_explanations: bool,
) -> PrioritizationResponse:
    """
    Run the end-to-end prioritization workflow for one city request.

    Outputs:
    - Ordered `action_id` list in `PrioritizationResponse.ranked_action_ids`.
    - Rich `ranked_actions` payload with scores and evidence summary per action.
    - Metadata with timings, counts, and resolved weights.
    """

    # Phase 0: initialize request-scoped artifact writer and timing accumulator.
    artifact_writer = ArtifactWriter(
        request_id=internal_request_id,
        request_kind="prioritization",
    )
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

    # Phase 4: fetch policy signals used by alignment scoring.
    with time_block("fetch_policy_signals") as block:
        policy_signals_by_action_id = policy_signals_data_api_client.get_action_policy_signals(
            locode
        )
    timings["fetch_policy_signals"] = block.elapsed_seconds
    fetch_policy_payload = {
        "actions_with_policy_signals": len(policy_signals_by_action_id),
        "elapsed_seconds": block.elapsed_seconds,
    }
    fetch_policy_event_index = artifact_writer.write_event(
        "fetch_policy_signals.completed", fetch_policy_payload
    )
    artifact_writer.write_step_detail(
        "fetch_policy_signals",
        {
            "actions_with_policy_signals": len(policy_signals_by_action_id),
            "action_ids_with_policy_signals": sorted(policy_signals_by_action_id.keys()),
            "elapsed_seconds": block.elapsed_seconds,
        },
        event_index=fetch_policy_event_index,
        event_type="fetch_policy_signals.completed",
    )
    logger.info(
        "Fetched policy signals internal_request_id=%s locode=%s actions_with_policy_signals=%s elapsed_seconds=%.3f",
        internal_request_id,
        locode,
        len(policy_signals_by_action_id),
        block.elapsed_seconds,
    )

    # Phase 5: validate and resolve ranking weights for this run.
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

    # Persist reproducibility-critical inputs in one dedicated run artifact.
    input_snapshot_payload = {
        "locode": locode,
        "resolved_top_n": top_n,
        "create_explanations": create_explanations,
        "requested_languages": requested_languages,
        "explanation_language": explanation_language,
        "resolved_weights": weights,
        "city_emissions_by_gpc_ref": city_emissions_by_gpc_ref,
        "city_preference_sectors": city_preference_sectors,
        "city_preference_timeframes": city_preference_timeframes,
        "city_preference_co_benefit_keys": city_preference_co_benefit_keys,
        "confirmed_excluded_action_ids": sorted(set(excluded_action_ids)),
    }
    input_snapshot_path = artifact_writer.write_run_file(
        "input_snapshot.json", input_snapshot_payload
    )
    artifact_writer.write_event(
        "input_snapshot.completed",
        {
            "file": input_snapshot_path.name if input_snapshot_path else "input_snapshot.json",
            "locode": locode,
        },
    )

    # Phase 6: run hard filter to remove excluded and legally blocked actions.
    with time_block("hard_filter") as block:
        hard_filter_result = hard_filter.run(
            actions=actions,
            excluded_action_ids=excluded_action_ids,
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
            "confirmed_excluded_action_ids": sorted(set(excluded_action_ids)),
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

    # Phase 7: run Impact block scoring on hard-filtered actions.
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

    # Phase 8: run Alignment block scoring on hard-filtered actions.
    with time_block("alignment") as block:
        alignment_result = alignment.run(
            hard_filter_result.valid_actions,
            policy_signals_by_action_id=policy_signals_by_action_id,
            city_preference_sectors=city_preference_sectors,
            city_preference_timeframes=city_preference_timeframes,
            city_preference_co_benefit_keys=city_preference_co_benefit_keys,
        )
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

    # Phase 9: run Feasibility block scoring on hard-filtered actions.
    with time_block("feasibility") as block:
        feasibility_result = feasibility.run(
            hard_filter_result.valid_actions,
            city=city,
            legal_requirements_by_action_id=legal_requirements_by_action_id,
        )
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
    logger.info(
        "Pillar scoring completed internal_request_id=%s locode=%s impact_actions=%s alignment_actions=%s feasibility_actions=%s",
        internal_request_id,
        locode,
        len(impact_result.score_by_action_id),
        len(alignment_result.score_by_action_id),
        len(feasibility_result.score_by_action_id),
    )

    # Phase 10: aggregate pillar scores into final ranking.
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
    logger.info(
        "Final scoring completed internal_request_id=%s locode=%s ranked_actions=%s top_n=%s elapsed_seconds=%.3f",
        internal_request_id,
        locode,
        len(scored_actions),
        top_n,
        block.elapsed_seconds,
    )

    # Phase 11: attach per-block evidence into each ranked action object.
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

    # Phase 12: optionally generate post-ranking qualitative explanations.
    explanations_by_action_id: dict[str, str] = {}
    if create_explanations:
        logger.info(
            "Explanation generation started internal_request_id=%s locode=%s actions_to_explain=%s",
            internal_request_id,
            locode,
            len(scored_actions),
        )
        llm_io_payload: dict[str, object] | None = None
        explanation_error: Exception | None = None
        with time_block("explanations") as block:
            try:
                explanations_by_action_id, llm_io_payload = generate_explanations(
                    locode=locode,
                    scored_actions=scored_actions,
                    explanation_language=explanation_language,
                    city_preference_sectors=city_preference_sectors,
                    city_preference_co_benefit_keys=city_preference_co_benefit_keys,
                )
            except Exception as error:
                explanation_error = error
        if explanation_error is None and llm_io_payload is not None:
            llm_input_payload = llm_io_payload.get("llm_input")
            if isinstance(llm_input_payload, dict):
                prompt_text = llm_input_payload.get("prompt_text")
                if isinstance(prompt_text, str):
                    prompt_file = artifact_writer.write_run_text_file(
                        "llm/explanations_prompt.txt", prompt_text
                    )
                    llm_input_payload["prompt_text_file"] = (
                        prompt_file.relative_to(artifact_writer._run_dir).as_posix()
                        if prompt_file is not None
                        else "llm/explanations_prompt.txt"
                    )
                    llm_input_payload["prompt_text_characters"] = len(prompt_text)
                    llm_input_payload.pop("prompt_text", None)
            llm_io_file = artifact_writer.write_run_file(
                "llm/explanations_io.json", llm_io_payload
            )
            explanation_ids = sorted(explanations_by_action_id.keys())
            explanations_payload = {
                "requested": len(scored_actions),
                "generated": len(explanations_by_action_id),
                "generated_action_ids": explanation_ids,
                "llm_io_file": (
                    llm_io_file.relative_to(artifact_writer._run_dir).as_posix()
                    if llm_io_file is not None
                    else "llm/explanations_io.json"
                ),
                "elapsed_seconds": block.elapsed_seconds,
            }
            explanations_event_index = artifact_writer.write_event(
                "explanations.completed", explanations_payload
            )
            artifact_writer.write_step_detail(
                "explanations",
                explanations_payload,
                event_index=explanations_event_index,
                event_type="explanations.completed",
            )
            logger.info(
                "Explanation generation completed internal_request_id=%s locode=%s generated=%s elapsed_seconds=%.3f",
                internal_request_id,
                locode,
                len(explanations_by_action_id),
                block.elapsed_seconds,
            )
        elif explanation_error is not None:
            logger.warning(
                "Explanation generation failed internal_request_id=%s locode=%s error=%s",
                internal_request_id,
                locode,
                explanation_error,
            )
            llm_error_file = artifact_writer.write_run_file(
                "llm/explanations_error.json",
                {
                    "status": "failed",
                    "locode": locode,
                    "error": str(explanation_error),
                    "ranked_action_ids": [item.action.action_id for item in scored_actions],
                },
            )
            explanations_failed_payload = {
                "requested": len(scored_actions),
                "generated": 0,
                "error": str(explanation_error),
                "llm_error_file": (
                    llm_error_file.name if llm_error_file is not None else "llm/explanations_error.json"
                ),
                "elapsed_seconds": block.elapsed_seconds,
            }
            explanations_failed_event_index = artifact_writer.write_event(
                "explanations.failed", explanations_failed_payload
            )
            artifact_writer.write_step_detail(
                "explanations",
                explanations_failed_payload,
                event_index=explanations_failed_event_index,
                event_type="explanations.failed",
            )
        timings["explanations"] = block.elapsed_seconds
    else:
        artifact_writer.write_event(
            "explanations.skipped",
            {"create_explanations": False},
        )
        logger.info(
            "Explanation generation skipped internal_request_id=%s locode=%s create_explanations=%s",
            internal_request_id,
            locode,
            create_explanations,
        )

    # Phase 13: build public ranked action payloads and response metadata.
    ranked_actions: list[RankedActionResult] = []
    for scored_action in scored_actions:
        action_id = scored_action.action.action_id
        ranked_actions.append(
            RankedActionResult(
                action_id=action_id,
                rank=scored_action.rank,
                final_score=scored_action.final_score,
                impact_score=scored_action.impact_score,
                alignment_score=scored_action.alignment_score,
                feasibility_score=scored_action.feasibility_score,
                evidence_summary=_build_evidence_summary(scored_action.evidence),
                explanation=explanations_by_action_id.get(action_id),
            )
        )

    ranked_action_ids = [item.action.action_id for item in scored_actions]

    metadata: dict[str, object] = {
        "locode": locode,
        "internal_request_id": str(internal_request_id),
        "counts": {
            "total_actions": len(actions),
            "valid_actions": len(hard_filter_result.valid_actions),
            "discarded_excluded": len(hard_filter_result.discarded_excluded),
            "discarded_legal": len(hard_filter_result.discarded_legal),
            "ranked_actions": len(ranked_action_ids),
        },
        "weights": weights,
        "timings": timings,
        "explanations": {
            "requested": create_explanations,
            "generated": len(explanations_by_action_id),
            "requested_languages": requested_languages,
            "language": explanation_language,
        },
        "hard_filter_evidence_by_action_id": hard_filter_result.evidence,
    }
    # Build the full per-city API response shape for artifact logging.
    full_response_payload = {
        "results": [
            {
                "locode": locode,
                "ranked_action_ids": ranked_action_ids,
                "ranked_actions": [
                    ranked_action.model_dump(mode="json")
                    for ranked_action in ranked_actions
                ],
                "metadata": metadata,
            }
        ]
    }

    # Emit the single run-level summary artifact used for overview/debugging.
    response_event_index = artifact_writer.write_event(
        "response_summary.completed",
        {
            "locode": locode,
            "ranked_action_ids": ranked_action_ids,
            "counts": metadata["counts"],
            "discarded_excluded_action_ids": sorted(discarded_excluded_ids),
            "confirmed_excluded_action_ids": sorted(set(excluded_action_ids)),
            "discarded_legal_action_ids": sorted(discarded_legal_ids),
            "timings": timings,
        },
    )
    artifact_writer.write_step_detail(
        "response_summary",
        {
            "locode": locode,
            "counts": metadata["counts"],
            "weights": weights,
            "ranked_action_ids": ranked_action_ids,
            "top_ranked_actions": [
                {
                    "rank": ranked_action.rank,
                    "action_id": ranked_action.action_id,
                }
                for ranked_action in ranked_actions
            ],
            "discarded_excluded_action_ids": sorted(discarded_excluded_ids),
            "confirmed_excluded_action_ids": sorted(set(excluded_action_ids)),
            "discarded_legal_action_ids": sorted(discarded_legal_ids),
            "timings": timings,
        },
        event_index=response_event_index,
        event_type="response_summary.completed",
    )
    artifact_writer.write_run_file("response_full.json", full_response_payload)

    # Emit run-level manifest after all other artifact files are written.
    final_scoring_detail_file = _detail_filename(
        final_scoring_event_index, "final_scoring"
    )
    hard_filter_detail_file = _detail_filename(hard_filter_event_index, "hard_filter")
    impact_detail_file = _detail_filename(impact_event_index, "impact")
    alignment_detail_file = _detail_filename(alignment_event_index, "alignment")
    feasibility_detail_file = _detail_filename(feasibility_event_index, "feasibility")
    artifact_writer.write_manifest(
        {
            "counts": metadata["counts"],
            "artifact_pointers": {
                "summary_events": "summary.jsonl",
                "input_snapshot": "input_snapshot.json",
                "response_summary": _detail_filename(
                    response_event_index, "response_summary"
                ),
                "top_ranked_actions": final_scoring_detail_file,
                "block_evidence": {
                    "hard_filter": hard_filter_detail_file,
                    "impact": impact_detail_file,
                    "alignment": alignment_detail_file,
                    "feasibility": feasibility_detail_file,
                },
            },
        }
    )

    logger.info(
        "Prioritization complete internal_request_id=%s locode=%s ranked_actions=%s",
        internal_request_id,
        locode,
        len(ranked_action_ids),
    )
    return PrioritizationResponse(
        ranked_action_ids=ranked_action_ids,
        ranked_actions=ranked_actions,
        metadata=metadata,
    )
