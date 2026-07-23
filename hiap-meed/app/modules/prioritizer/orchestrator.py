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
from app.modules.prioritizer.scoring_config import validate_weights
from app.modules.prioritizer.internal_models import Action, CityEmissionsContext
from app.modules.prioritizer.models import (
    PrioritizationResponse,
    RankedActionResult,
    RemovedActionSummary,
)
from app.modules.prioritizer.services.explanations import generate_explanations
from app.services.data_clients import (
    ApiActionFinancialFeasibilityScoresDataApiClient,
    ApiActionPathwaysDataApiClient,
    ApiActionMitigationFeasibilityScoresDataApiClient,
    ApiCityDataApiClient,
    ApiLegalDataApiClient,
    ApiActionPolicyScoresDataApiClient,
    MockActionFinancialFeasibilityScoresDataApiClient,
    MockActionPathwaysDataApiClient,
    MockActionMitigationFeasibilityScoresDataApiClient,
    MockCityDataApiClient,
    MockLegalDataApiClient,
    MockActionPolicyScoresDataApiClient,
    S3LegalDataApiClient,
    describe_legal_data_source,
)
from app.services.http_client import UpstreamApiError
from app.utils.artifacts import ArtifactWriter
from app.utils.timing import time_block


logger = logging.getLogger(__name__)
SUPPORTED_ACTION_TYPE = "mitigation"


def _sorted_action_ids(actions: list[Action]) -> list[str]:
    """Return all action IDs in deterministic sorted order."""
    action_ids = [action.action_id for action in actions]
    return sorted(action_ids)


def _filter_supported_action_type(
    actions: list[Action],
    *,
    action_type: str,
) -> tuple[list[Action], list[Action], list[Action]]:
    """Split fetched actions into supported, filtered-out, and missing-type groups."""
    normalized_action_type = action_type.strip().lower()
    kept_actions: list[Action] = []
    filtered_actions: list[Action] = []
    missing_action_type_actions: list[Action] = []
    for action in actions:
        if action.action_type is None or not action.action_type.strip():
            missing_action_type_actions.append(action)
            kept_actions.append(action)
            continue
        if action.action_type.strip().lower() == normalized_action_type:
            kept_actions.append(action)
            continue
        filtered_actions.append(action)
    return kept_actions, filtered_actions, missing_action_type_actions


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


def _legal_fetch_source_descriptor(
    *,
    legal_assessments_by_action_id: dict[str, object],
    fallback_descriptor: dict[str, object],
) -> dict[str, object]:
    """Prefer the returned legal record metadata over a generic source descriptor."""
    if not legal_assessments_by_action_id:
        return fallback_descriptor
    first_action_id = sorted(legal_assessments_by_action_id.keys())[0]
    first_assessment = legal_assessments_by_action_id[first_action_id]
    first_source_metadata = getattr(first_assessment, "source_metadata", None)
    if not isinstance(first_source_metadata, dict):
        return fallback_descriptor
    return {
        "source": fallback_descriptor["source"],
        "source_metadata": dict(first_source_metadata),
    }


def _removed_action_source(discard_reason: object) -> str:
    """Return the public source label for one hard-filter removal reason."""
    if discard_reason == "legal_verdict_blocked":
        return "legal_hard_filter"
    if discard_reason == "user_excluded":
        return "user_exclusion"
    return "hard_filter"


def _build_removed_action_legal_evidence(
    evidence: dict[str, object],
) -> dict[str, object] | None:
    """Return frontend-facing legal evidence for a removed action when present."""
    summary = evidence.get("legal_assessment_summary")
    if not isinstance(summary, dict):
        return None
    return {
        "verdict_category": evidence.get("legal_verdict_category"),
        "verdict_score": evidence.get("legal_verdict_score"),
        "ownership_category": summary.get("ownership_category"),
        "ownership_score": summary.get("ownership_score"),
        "ownership_description": summary.get("ownership_description"),
        "ownership_description_es": summary.get("ownership_description_es"),
        "restrictions_category": summary.get("restrictions_category"),
        "restrictions_score": summary.get("restrictions_score"),
        "restrictions_description": summary.get("restrictions_description"),
        "restrictions_description_es": summary.get("restrictions_description_es"),
        "legal_justification": summary.get("legal_justification"),
        "legal_justification_en": summary.get("legal_justification_en"),
        "legal_references": list(summary.get("legal_references", [])),
    }


def _build_removed_actions(
    *,
    discarded_actions: list[Action],
    evidence_by_action_id: dict[str, dict[str, object]],
) -> list[RemovedActionSummary]:
    """Return frontend-facing summaries for actions removed before ranking."""
    removed_actions: list[RemovedActionSummary] = []
    for action in discarded_actions:
        evidence = evidence_by_action_id.get(action.action_id, {})
        removal_reason = evidence.get("discard_reason")
        removed_actions.append(
            RemovedActionSummary(
                action_id=action.action_id,
                action_name=action.action_name,
                removal_reason=(
                    removal_reason if isinstance(removal_reason, str) else None
                ),
                removal_source=_removed_action_source(removal_reason),
                legal=_build_removed_action_legal_evidence(evidence),
            )
        )
    return removed_actions


def _group_feasibility_evidence(evidence: dict[str, object]) -> dict[str, object]:
    """Return grouped public feasibility evidence for one action."""
    return {
        "legal": {
            "assessment_present": bool(evidence.get("legal_assessment_present", False)),
            "assessment_missing": bool(evidence.get("legal_assessment_missing", False)),
            "verdict_category": evidence.get("legal_verdict_category"),
            "component_score": _safe_float(evidence.get("legal_component_score")),
            "component_source": evidence.get("legal_component_source"),
            "weight": _safe_float(evidence.get("legal_weight")),
            "contribution": _safe_float(evidence.get("legal_contribution")),
            "verdict_score_missing": bool(
                evidence.get("legal_verdict_score_missing", False)
            ),
            "ownership_category": evidence.get("ownership_category"),
            "ownership_score": evidence.get("ownership_score"),
            "ownership_description": evidence.get("ownership_description"),
            "ownership_description_es": evidence.get("ownership_description_es"),
            "restrictions_category": evidence.get("restrictions_category"),
            "restrictions_score": evidence.get("restrictions_score"),
            "restrictions_description": evidence.get("restrictions_description"),
            "restrictions_description_es": evidence.get("restrictions_description_es"),
            "legal_justification": evidence.get("legal_justification"),
            "legal_justification_en": evidence.get("legal_justification_en"),
            "analysis_date": evidence.get("legal_analysis_date"),
            "generation_method": evidence.get("legal_generation_method"),
            "legal_references": list(evidence.get("legal_references", [])),
        },
        "mitigation_feasibility": {
            "component_score": _safe_float(
                evidence.get("mitigation_feasibility_component_score")
            ),
            "component_source": evidence.get(
                "mitigation_feasibility_component_source"
            ),
            "weight": _safe_float(evidence.get("mitigation_feasibility_weight")),
            "contribution": _safe_float(
                evidence.get("mitigation_feasibility_contribution")
            ),
            "score_present": bool(
                evidence.get("mitigation_feasibility_score_present", False)
            ),
            "score_missing": bool(
                evidence.get("mitigation_feasibility_score_missing", False)
            ),
            "action_score_missing": bool(
                evidence.get("mitigation_feasibility_action_score_missing", False)
            ),
            "global_mitigation_option": evidence.get("global_mitigation_option"),
            "action_mapping_strength": evidence.get("action_mapping_strength"),
            "option_family": evidence.get("option_family"),
            "n_feasibility_dimensions": evidence.get("n_feasibility_dimensions"),
            "dimension_scores": dict(evidence.get("dimension_scores", {})),
            "breakdown": dict(evidence.get("feasibility_breakdown", {})),
            "rank_within_city": evidence.get("rank_within_city"),
        },
        "financial_feasibility": {
            "component_score": _safe_float(
                evidence.get("financial_feasibility_component_score")
            ),
            "component_source": evidence.get("financial_feasibility_component_source"),
            "weight": _safe_float(evidence.get("financial_feasibility_weight")),
            "contribution": _safe_float(
                evidence.get("financial_feasibility_contribution")
            ),
            "score_present": bool(
                evidence.get("financial_feasibility_score_present", False)
            ),
            "score_missing": bool(
                evidence.get("financial_feasibility_score_missing", False)
            ),
            "action_score_missing": bool(
                evidence.get("financial_feasibility_action_score_missing", False)
            ),
            "route": evidence.get("financial_feasibility_route"),
            "reason": evidence.get("financial_feasibility_reason"),
            "sector": evidence.get("financial_feasibility_sector"),
            "inputs": dict(evidence.get("financial_feasibility_inputs", {})),
            "links": dict(evidence.get("financial_feasibility_links", {})),
        },
        "feasibility_score": _safe_float(evidence.get("feasibility_score")),
    }


def _group_all_feasibility_evidence(
    evidence_by_action_id: dict[str, dict[str, object]] | None,
) -> dict[str, dict[str, object]]:
    """Return grouped public feasibility evidence keyed by action ID."""
    all_evidence = _all_block_evidence(evidence_by_action_id)
    return {
        action_id: _group_feasibility_evidence(action_evidence)
        for action_id, action_evidence in all_evidence.items()
    }


def _build_evidence_summary(
    scored_action_evidence: dict[str, object],
) -> dict[str, object]:
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
            "legal_assessment_present": bool(
                hard_filter_evidence.get("legal_assessment_present", False)
            ),
            "legal_verdict_category": hard_filter_evidence.get(
                "legal_verdict_category"
            ),
        },
        "impact": {
            "impact_block_score": _safe_float(
                impact_evidence.get("impact_block_score")
            ),
            "matched_city_subsector_keys_count": int(
                impact_evidence.get("matched_city_subsector_keys_count", 0)
            ),
            "emissions_reduction_component_score": _safe_float(
                impact_evidence.get("emissions_reduction_component_score")
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
            "legal": {
                "assessment_present": bool(
                    feasibility_evidence.get("legal", {}).get(
                        "assessment_present", False
                    )
                ),
                "assessment_missing": bool(
                    feasibility_evidence.get("legal", {}).get(
                        "assessment_missing", False
                    )
                ),
                "verdict_category": feasibility_evidence.get("legal", {}).get(
                    "verdict_category"
                ),
                "component_score": _safe_float(
                    feasibility_evidence.get("legal", {}).get("component_score")
                ),
                "component_source": feasibility_evidence.get("legal", {}).get(
                    "component_source"
                ),
                "ownership_category": feasibility_evidence.get("legal", {}).get(
                    "ownership_category"
                ),
                "ownership_score": feasibility_evidence.get("legal", {}).get(
                    "ownership_score"
                ),
                "ownership_description": feasibility_evidence.get("legal", {}).get(
                    "ownership_description"
                ),
                "ownership_description_es": feasibility_evidence.get(
                    "legal", {}
                ).get("ownership_description_es"),
                "restrictions_category": feasibility_evidence.get("legal", {}).get(
                    "restrictions_category"
                ),
                "restrictions_score": feasibility_evidence.get("legal", {}).get(
                    "restrictions_score"
                ),
                "restrictions_description": feasibility_evidence.get("legal", {}).get(
                    "restrictions_description"
                ),
                "restrictions_description_es": feasibility_evidence.get(
                    "legal", {}
                ).get("restrictions_description_es"),
                "legal_justification": feasibility_evidence.get("legal", {}).get(
                    "legal_justification"
                ),
                "legal_justification_en": feasibility_evidence.get("legal", {}).get(
                    "legal_justification_en"
                ),
                "legal_references": list(
                    feasibility_evidence.get("legal", {}).get("legal_references", [])
                ),
            },
            "mitigation_feasibility": {
                "component_score": _safe_float(
                    feasibility_evidence.get("mitigation_feasibility", {}).get(
                        "component_score"
                    )
                ),
                "component_source": feasibility_evidence.get(
                    "mitigation_feasibility", {}
                ).get("component_source"),
                "score_present": bool(
                    feasibility_evidence.get("mitigation_feasibility", {}).get(
                        "score_present", False
                    )
                ),
                "score_missing": bool(
                    feasibility_evidence.get("mitigation_feasibility", {}).get(
                        "score_missing", False
                    )
                ),
            },
            "financial_feasibility": {
                "component_score": _safe_float(
                    feasibility_evidence.get("financial_feasibility", {}).get(
                        "component_score"
                    )
                ),
                "component_source": feasibility_evidence.get(
                    "financial_feasibility", {}
                ).get("component_source"),
                "score_present": bool(
                    feasibility_evidence.get("financial_feasibility", {}).get(
                        "score_present", False
                    )
                ),
                "score_missing": bool(
                    feasibility_evidence.get("financial_feasibility", {}).get(
                        "score_missing", False
                    )
                ),
                "route": feasibility_evidence.get("financial_feasibility", {}).get(
                    "route"
                ),
                "reason": feasibility_evidence.get("financial_feasibility", {}).get(
                    "reason"
                ),
                "sector": feasibility_evidence.get("financial_feasibility", {}).get(
                    "sector"
                ),
            },
        },
    }


def _detail_filename(event_index: int | None, step_name: str) -> str:
    """Return expected detail filename for one step event."""
    if event_index is None:
        return f"<disabled>_{step_name}.json"
    return f"{event_index:03d}_{step_name}.json"


def _resolve_requested_output_languages(requested_languages: list[str]) -> list[str]:
    """Normalize requested output languages while preserving caller order."""
    resolved_languages: list[str] = []
    for language in requested_languages:
        normalized = language.strip().lower()
        if normalized and normalized not in resolved_languages:
            resolved_languages.append(normalized)
    return resolved_languages or ["en"]


def run_prioritization(
    *,
    locode: str,
    country_code: str,
    weights_override: dict[str, float] | None,
    top_n: int | None,
    excluded_action_ids: list[str],
    requested_languages: list[str],
    city_preference_sectors: list[str],
    city_preference_timeframes: list[str],
    city_preference_co_benefit_keys: list[str],
    city_emissions_context: CityEmissionsContext,
    internal_request_id: UUID,
    city_data_api_client: MockCityDataApiClient | ApiCityDataApiClient,
    action_pathways_data_api_client: MockActionPathwaysDataApiClient | ApiActionPathwaysDataApiClient,
    legal_data_api_client: (
        MockLegalDataApiClient | ApiLegalDataApiClient | S3LegalDataApiClient
    ),
    action_policy_scores_data_api_client: (
        MockActionPolicyScoresDataApiClient | ApiActionPolicyScoresDataApiClient
    ),
    action_mitigation_feasibility_scores_data_api_client: (
        MockActionMitigationFeasibilityScoresDataApiClient
        | ApiActionMitigationFeasibilityScoresDataApiClient
    ),
    action_financial_feasibility_scores_data_api_client: (
        MockActionFinancialFeasibilityScoresDataApiClient
        | ApiActionFinancialFeasibilityScoresDataApiClient
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
        "Prioritization started internal_request_id=%s locode=%s country_code=%s top_n=%s weights_override_provided=%s",
        internal_request_id,
        locode,
        country_code,
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
            "city_name": city.city_name,
            "region_name": city.region_name,
            "source": city.source,
            "source_metadata": city.source_metadata,
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
    if city.country_code != country_code:
        logger.error(
            "Fetched city country_code mismatch internal_request_id=%s locode=%s requested_country_code=%s fetched_country_code=%s",
            internal_request_id,
            locode,
            country_code,
            city.country_code,
        )
        raise UpstreamApiError(
            status_code=502,
            message=(
                "city attributes API returned a country_code that does not match "
                f"the request countryCode for locode={locode}"
            ),
        )

    # Phase 2: fetch action catalog that enters hard filtering.
    with time_block("fetch_actions") as block:
        action_pathways_fetch_result = action_pathways_data_api_client.list_actions()
        fetched_actions = action_pathways_fetch_result.actions
        (
            actions,
            filtered_out_action_type_actions,
            missing_action_type_actions,
        ) = _filter_supported_action_type(
            fetched_actions,
            action_type=SUPPORTED_ACTION_TYPE,
        )
    # Emit high-level and step-detail artifacts for action fetch.
    timings["fetch_actions"] = block.elapsed_seconds
    fetch_actions_payload = {
        "total_fetched_actions": len(fetched_actions),
        "total_actions": len(actions),
        "supported_action_type": SUPPORTED_ACTION_TYPE,
        "filtered_out_action_type_actions_count": len(filtered_out_action_type_actions),
        "missing_action_type_actions_count": len(missing_action_type_actions),
        "source": (
            "mock_action_pathways_api"
            if isinstance(
                action_pathways_data_api_client,
                MockActionPathwaysDataApiClient,
            )
            else "action_pathways_api"
        ),
        "elapsed_seconds": block.elapsed_seconds,
    }
    fetch_actions_event_index = artifact_writer.write_event(
        "fetch_actions.completed", fetch_actions_payload
    )
    artifact_writer.write_step_detail(
        "fetch_actions",
        {
            "total_fetched_actions": len(fetched_actions),
            "total_actions": len(actions),
            "supported_action_type": SUPPORTED_ACTION_TYPE,
            "filtered_out_action_type_actions_count": len(
                filtered_out_action_type_actions
            ),
            "filtered_out_action_type_action_ids": _sorted_action_ids(
                filtered_out_action_type_actions
            ),
            "missing_action_type_actions_count": len(missing_action_type_actions),
            "missing_action_type_action_ids": _sorted_action_ids(
                missing_action_type_actions
            ),
            "action_ids": _sorted_action_ids(actions),
            "source": fetch_actions_payload["source"],
            "source_metadata": action_pathways_fetch_result.source_metadata,
            "upstream_meta": action_pathways_fetch_result.upstream_meta,
            "warning": action_pathways_fetch_result.warning,
            "elapsed_seconds": block.elapsed_seconds,
        },
        event_index=fetch_actions_event_index,
        event_type="fetch_actions.completed",
    )
    logger.info(
        "Fetched actions internal_request_id=%s locode=%s total_fetched_actions=%s total_supported_actions=%s filtered_out_action_type_actions_count=%s missing_action_type_actions_count=%s supported_action_type=%s elapsed_seconds=%.3f",
        internal_request_id,
        locode,
        len(fetched_actions),
        len(actions),
        len(filtered_out_action_type_actions),
        len(missing_action_type_actions),
        SUPPORTED_ACTION_TYPE,
        block.elapsed_seconds,
    )

    # Phase 3: fetch legal assessments used by hard legal filtering.
    with time_block("fetch_legal_assessments") as block:
        legal_assessments_by_action_id = legal_data_api_client.get_action_legal_assessments(
            country_code
        )
    # Emit high-level and step-detail artifacts for legal assessment fetch.
    timings["fetch_legal_assessments"] = block.elapsed_seconds
    legal_source_descriptor = describe_legal_data_source(
        legal_data_api_client,
        country_code=country_code,
    )
    legal_source_descriptor = _legal_fetch_source_descriptor(
        legal_assessments_by_action_id=legal_assessments_by_action_id,
        fallback_descriptor=legal_source_descriptor,
    )
    fetch_legal_payload = {
        "requested_country_code": country_code,
        "actions_with_legal_assessments": len(legal_assessments_by_action_id),
        "source": legal_source_descriptor["source"],
        "elapsed_seconds": block.elapsed_seconds,
    }
    fetch_legal_event_index = artifact_writer.write_event(
        "fetch_legal_assessments.completed", fetch_legal_payload
    )
    artifact_writer.write_step_detail(
        "fetch_legal_assessments",
        {
            "requested_country_code": country_code,
            "actions_with_legal_assessments": len(legal_assessments_by_action_id),
            "action_ids_with_legal_assessments": sorted(
                legal_assessments_by_action_id.keys()
            ),
            "source": legal_source_descriptor["source"],
            "source_metadata": legal_source_descriptor["source_metadata"],
            "elapsed_seconds": block.elapsed_seconds,
        },
        event_index=fetch_legal_event_index,
        event_type="fetch_legal_assessments.completed",
    )
    logger.info(
        "Fetched legal assessments internal_request_id=%s locode=%s country_code=%s actions_with_assessments=%s elapsed_seconds=%.3f",
        internal_request_id,
        locode,
        country_code,
        len(legal_assessments_by_action_id),
        block.elapsed_seconds,
    )

    # Phase 4: fetch action policy scores used by alignment scoring.
    with time_block("fetch_action_policy_scores") as block:
        action_policy_scores_fetch_result = (
            action_policy_scores_data_api_client.get_action_policy_scores(locode)
        )
    action_policy_scores_by_action_id = (
        action_policy_scores_fetch_result.scores_by_action_id
    )
    timings["fetch_action_policy_scores"] = block.elapsed_seconds
    fetch_policy_payload = {
        "actions_with_policy_scores": len(action_policy_scores_by_action_id),
        "source": (
            "mock_action_policy_scores_api"
            if isinstance(
                action_policy_scores_data_api_client,
                MockActionPolicyScoresDataApiClient,
            )
            else "action_policy_scores_api"
        ),
        "source_metadata": action_policy_scores_fetch_result.source_metadata,
        "upstream_meta": action_policy_scores_fetch_result.upstream_meta,
        "warning": action_policy_scores_fetch_result.warning,
        "elapsed_seconds": block.elapsed_seconds,
    }
    fetch_policy_event_index = artifact_writer.write_event(
        "fetch_action_policy_scores.completed", fetch_policy_payload
    )
    artifact_writer.write_step_detail(
        "fetch_action_policy_scores",
        {
            "actions_with_policy_scores": len(action_policy_scores_by_action_id),
            "action_ids_with_policy_scores": sorted(
                action_policy_scores_by_action_id.keys()
            ),
            "source": fetch_policy_payload["source"],
            "source_metadata": action_policy_scores_fetch_result.source_metadata,
            "upstream_meta": action_policy_scores_fetch_result.upstream_meta,
            "warning": action_policy_scores_fetch_result.warning,
            "elapsed_seconds": block.elapsed_seconds,
        },
        event_index=fetch_policy_event_index,
        event_type="fetch_action_policy_scores.completed",
    )
    logger.info(
        "Fetched action policy scores internal_request_id=%s locode=%s actions_with_policy_scores=%s elapsed_seconds=%.3f",
        internal_request_id,
        locode,
        len(action_policy_scores_by_action_id),
        block.elapsed_seconds,
    )

    # Phase 5: fetch mitigation feasibility scores used by Feasibility scoring.
    with time_block("fetch_action_mitigation_feasibility_scores") as block:
        mitigation_feasibility_scores_fetch_result = (
            action_mitigation_feasibility_scores_data_api_client
            .get_action_mitigation_feasibility_scores(
                locode,
                country_code,
            )
        )
    mitigation_feasibility_scores_by_action_id = (
        mitigation_feasibility_scores_fetch_result.scores_by_action_id
    )
    timings["fetch_action_mitigation_feasibility_scores"] = block.elapsed_seconds
    fetch_mitigation_feasibility_payload = {
        "actions_with_mitigation_feasibility_scores": len(
            mitigation_feasibility_scores_by_action_id
        ),
        "source": (
            "mock_action_mitigation_feasibility_scores_api"
            if isinstance(
                action_mitigation_feasibility_scores_data_api_client,
                MockActionMitigationFeasibilityScoresDataApiClient,
            )
            else "action_mitigation_feasibility_scores_api"
        ),
        "source_metadata": mitigation_feasibility_scores_fetch_result.source_metadata,
        "upstream_meta": mitigation_feasibility_scores_fetch_result.upstream_meta,
        "warning": mitigation_feasibility_scores_fetch_result.warning,
        "elapsed_seconds": block.elapsed_seconds,
    }
    fetch_mitigation_feasibility_event_index = artifact_writer.write_event(
        "fetch_action_mitigation_feasibility_scores.completed",
        fetch_mitigation_feasibility_payload,
    )
    artifact_writer.write_step_detail(
        "fetch_action_mitigation_feasibility_scores",
        {
            "actions_with_mitigation_feasibility_scores": len(
                mitigation_feasibility_scores_by_action_id
            ),
            "action_ids_with_mitigation_feasibility_scores": sorted(
                mitigation_feasibility_scores_by_action_id.keys()
            ),
            "source": fetch_mitigation_feasibility_payload["source"],
            "source_metadata": (
                mitigation_feasibility_scores_fetch_result.source_metadata
            ),
            "upstream_meta": mitigation_feasibility_scores_fetch_result.upstream_meta,
            "warning": mitigation_feasibility_scores_fetch_result.warning,
            "elapsed_seconds": block.elapsed_seconds,
        },
        event_index=fetch_mitigation_feasibility_event_index,
        event_type="fetch_action_mitigation_feasibility_scores.completed",
    )
    logger.info(
        "Fetched action mitigation feasibility scores internal_request_id=%s "
        "locode=%s actions_with_scores=%s elapsed_seconds=%.3f",
        internal_request_id,
        locode,
        len(mitigation_feasibility_scores_by_action_id),
        block.elapsed_seconds,
    )

    # Phase 6: fetch financial feasibility scores used by Feasibility scoring.
    with time_block("fetch_action_financial_feasibility_scores") as block:
        financial_feasibility_scores_fetch_result = (
            action_financial_feasibility_scores_data_api_client
            .get_action_financial_feasibility_scores(
                locode,
                country_code,
            )
        )
    financial_feasibility_scores_by_action_id = (
        financial_feasibility_scores_fetch_result.scores_by_action_id
    )
    timings["fetch_action_financial_feasibility_scores"] = block.elapsed_seconds
    fetch_financial_feasibility_payload = {
        "actions_with_financial_feasibility_scores": len(
            financial_feasibility_scores_by_action_id
        ),
        "source": (
            "mock_action_financial_feasibility_scores_api"
            if isinstance(
                action_financial_feasibility_scores_data_api_client,
                MockActionFinancialFeasibilityScoresDataApiClient,
            )
            else "action_financial_feasibility_scores_api"
        ),
        "source_metadata": financial_feasibility_scores_fetch_result.source_metadata,
        "upstream_meta": financial_feasibility_scores_fetch_result.upstream_meta,
        "warning": financial_feasibility_scores_fetch_result.warning,
        "elapsed_seconds": block.elapsed_seconds,
    }
    fetch_financial_feasibility_event_index = artifact_writer.write_event(
        "fetch_action_financial_feasibility_scores.completed",
        fetch_financial_feasibility_payload,
    )
    artifact_writer.write_step_detail(
        "fetch_action_financial_feasibility_scores",
        {
            "actions_with_financial_feasibility_scores": len(
                financial_feasibility_scores_by_action_id
            ),
            "action_ids_with_financial_feasibility_scores": sorted(
                financial_feasibility_scores_by_action_id.keys()
            ),
            "source": fetch_financial_feasibility_payload["source"],
            "source_metadata": (
                financial_feasibility_scores_fetch_result.source_metadata
            ),
            "upstream_meta": financial_feasibility_scores_fetch_result.upstream_meta,
            "warning": financial_feasibility_scores_fetch_result.warning,
            "elapsed_seconds": block.elapsed_seconds,
        },
        event_index=fetch_financial_feasibility_event_index,
        event_type="fetch_action_financial_feasibility_scores.completed",
    )
    logger.info(
        "Fetched action financial feasibility scores internal_request_id=%s "
        "locode=%s actions_with_scores=%s elapsed_seconds=%.3f",
        internal_request_id,
        locode,
        len(financial_feasibility_scores_by_action_id),
        block.elapsed_seconds,
    )

    # Phase 7: validate and resolve ranking weights for this run.
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
        "country_code": country_code,
        "resolved_top_n": top_n,
        "create_explanations": create_explanations,
        "requested_languages": requested_languages,
        "requested_output_languages": _resolve_requested_output_languages(
            requested_languages
        ),
        "resolved_weights": weights,
        "city_emissions_by_subsector_key": (
            city_emissions_context.emissions_by_subsector_key
        ),
        "city_activity_rows": [
            row.model_dump(mode="json") for row in city_emissions_context.activity_rows
        ],
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
            "file": (
                input_snapshot_path.name
                if input_snapshot_path
                else "input_snapshot.json"
            ),
            "locode": locode,
        },
    )

    # Phase 8: run hard filter to remove excluded and legally blocked actions.
    with time_block("hard_filter") as block:
        hard_filter_result = hard_filter.run(
            actions=actions,
            excluded_action_ids=excluded_action_ids,
            legal_assessments_by_action_id=legal_assessments_by_action_id,
        )
    # Build discard diagnostics and emit hard-filter artifacts.
    timings["hard_filter"] = block.elapsed_seconds
    discarded_excluded_ids = [
        item.action_id for item in hard_filter_result.discarded_excluded
    ]
    discarded_legal_ids = [
        item.action_id for item in hard_filter_result.discarded_legal
    ]
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
                    "discard_reason": hard_filter_result.evidence.get(
                        action_id, {}
                    ).get("discard_reason"),
                    "legal_verdict_category": hard_filter_result.evidence.get(
                        action_id, {}
                    ).get("legal_verdict_category"),
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

    # Phase 9: run Impact block scoring on hard-filtered actions.
    with time_block("impact") as block:
        impact_result = impact.run(
            hard_filter_result.valid_actions,
            city_emissions_context=city_emissions_context,
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
            "impact_matching": dict(impact_result.metadata),
            "evidence_by_action_id": _all_block_evidence(
                impact_result.evidence_by_action_id
            ),
            "elapsed_seconds": block.elapsed_seconds,
        },
        event_index=impact_event_index,
        event_type="impact.completed",
    )

    # Phase 10: run Alignment block scoring on hard-filtered actions.
    with time_block("alignment") as block:
        alignment_result = alignment.run(
            hard_filter_result.valid_actions,
            action_policy_scores_by_action_id=action_policy_scores_by_action_id,
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

    # Phase 11: run Feasibility block scoring on hard-filtered actions.
    with time_block("feasibility") as block:
        feasibility_result = feasibility.run(
            hard_filter_result.valid_actions,
            legal_assessments_by_action_id=legal_assessments_by_action_id,
            mitigation_feasibility_scores_by_action_id=(
                mitigation_feasibility_scores_by_action_id
            ),
            financial_feasibility_scores_by_action_id=(
                financial_feasibility_scores_by_action_id
            ),
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
            **feasibility_result.metadata,
            "evidence_by_action_id": _group_all_feasibility_evidence(
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

    # Phase 12: aggregate pillar scores into final ranking.
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

    # Phase 12b: attach per-block evidence into each ranked action object.
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
            "feasibility": _group_feasibility_evidence(
                _safe_block_evidence(
                    feasibility_result.evidence_by_action_id,
                    action_id,
                )
            ),
        }

    # Phase 13: optionally generate explanations independently in each language.
    explanation_languages = _resolve_requested_output_languages(requested_languages)
    explanations_by_language: dict[str, dict[str, str]] = {}
    generated_explanation_action_ids: list[str] = []
    explanation_warnings: list[str] = []
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
                explanations_by_language, llm_io_payload = generate_explanations(
                    locode=locode,
                    languages=explanation_languages,
                    scored_actions=scored_actions,
                    city_preference_sectors=city_preference_sectors,
                    city_preference_co_benefit_keys=city_preference_co_benefit_keys,
                )
                for scored_action in scored_actions:
                    action_id = scored_action.action.action_id
                    if all(
                        explanations_by_language.get(language, {}).get(action_id)
                        for language in explanation_languages
                    ):
                        generated_explanation_action_ids.append(action_id)
                generated_explanation_action_ids.sort()
            except Exception as error:
                explanation_error = error
        if explanation_error is None and llm_io_payload is not None:
            language_payloads = llm_io_payload.get("languages", {})
            if isinstance(language_payloads, dict):
                for language, language_payload in language_payloads.items():
                    if not isinstance(language_payload, dict):
                        continue
                    llm_input_payload = language_payload.get("llm_input")
                    if not isinstance(llm_input_payload, dict):
                        continue
                    prompt_text = llm_input_payload.get("prompt_text")
                    if not isinstance(prompt_text, str):
                        continue
                    prompt_path = f"llm/explanations/{language}_prompt.txt"
                    prompt_file = artifact_writer.write_run_text_file(
                        prompt_path, prompt_text
                    )
                    llm_input_payload["prompt_text_file"] = (
                        prompt_file.relative_to(artifact_writer._run_dir).as_posix()
                        if prompt_file is not None
                        else prompt_path
                    )
                    llm_input_payload["prompt_text_characters"] = len(prompt_text)
                    llm_input_payload.pop("prompt_text", None)
            llm_io_file = artifact_writer.write_run_file(
                "llm/explanations_io.json", llm_io_payload
            )
            explanations_payload = {
                "requested": len(scored_actions),
                "generated": len(generated_explanation_action_ids),
                "generated_action_ids": generated_explanation_action_ids,
                "languages": explanation_languages,
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
                len(generated_explanation_action_ids),
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
                    "ranked_action_ids": [
                        item.action.action_id for item in scored_actions
                    ],
                },
            )
            explanations_failed_payload = {
                "requested": len(scored_actions),
                "generated": 0,
                "error": str(explanation_error),
                "llm_error_file": (
                    llm_error_file.name
                    if llm_error_file is not None
                    else "llm/explanations_error.json"
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

    # Phase 14: build public ranked action payloads and response metadata.
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
                explanations={
                    language: explanations[action_id]
                    for language, explanations in explanations_by_language.items()
                    if explanations.get(action_id)
                },
            )
        )

    ranked_action_ids = [item.action.action_id for item in scored_actions]
    removed_actions = _build_removed_actions(
        discarded_actions=[
            *hard_filter_result.discarded_excluded,
            *hard_filter_result.discarded_legal,
        ],
        evidence_by_action_id=hard_filter_result.evidence,
    )
    generated_languages = [
        language
        for language in explanation_languages
        if explanations_by_language.get(language)
    ]

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
            "generated": len(generated_explanation_action_ids),
            "requested_languages": requested_languages,
            "canonical_language": "en",
            "generated_languages": generated_languages,
            "translation_warnings": explanation_warnings,
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
                "removed_actions": [
                    removed_action.model_dump(mode="json")
                    for removed_action in removed_actions
                ],
                "metadata": metadata,
                "warnings": explanation_warnings,
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
            "translation_warnings": explanation_warnings,
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
        removed_actions=removed_actions,
        metadata=metadata,
        warnings=explanation_warnings,
    )

