"""FastAPI routes for MEED prioritization."""

from __future__ import annotations

import logging
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException

from app.modules.prioritizer.config import resolve_top_n
from app.modules.prioritizer.models import (
    ExclusionPreviewApiRequest,
    ExclusionPreviewApiResponse,
    ExclusionPreviewCityResult,
    FrontendCityInput,
    PrioritizationResponse,
    PrioritizerApiCityResult,
    PrioritizerApiRequest,
    PrioritizerApiResponse,
)
from app.modules.prioritizer.orchestrator import run_prioritization
from app.modules.prioritizer.services.exclusion_resolution import (
    resolve_exclusion_preview_with_diagnostics,
)
from app.services.data_clients import (
    ApiActionDataApiClient,
    ApiCityDataApiClient,
    ApiLegalDataApiClient,
    ApiPolicySignalsDataApiClient,
    MockActionDataApiClient,
    MockCityDataApiClient,
    MockLegalDataApiClient,
    MockPolicySignalsDataApiClient,
    get_action_data_api_client,
    get_city_data_api_client,
    get_legal_data_api_client,
    get_policy_signals_data_api_client,
)
from app.utils.artifacts import ArtifactWriter


logger = logging.getLogger(__name__)

router = APIRouter(tags=["prioritization"])


def _error_payload(request_id: str, message: str) -> dict[str, str]:
    """Build a consistent JSON error body including the request ID."""
    return {"request_id": request_id, "error": message}


def _extract_city_emissions_by_gpc_ref(city_input: FrontendCityInput) -> dict[str, float]:
    """
    Build city emissions totals keyed by GPC reference.

    The frontend request carries emissions per GPC key under
    `cityEmissionsData.gpcData[*].activities[*].totalEmissions`. This helper
    sums activity totals per key and ignores missing totals (`None`).
    """
    emissions_by_gpc_ref: dict[str, float] = {}

    # Sum activity emissions for each GPC key from frontend request schema.
    for gpc_ref, gpc_entry in city_input.cityEmissionsData.gpcData.items():
        gpc_total = 0.0
        for activity in gpc_entry.activities:
            if activity.totalEmissions is None:
                continue
            gpc_total += activity.totalEmissions
        emissions_by_gpc_ref[gpc_ref] = gpc_total

    return emissions_by_gpc_ref


def _safe_artifact_name(value: str) -> str:
    """Convert a free-form identifier like locode into a stable artifact stem."""
    return value.strip().lower().replace(" ", "_").replace("/", "_")


@router.post(
    "/v1/prioritize/exclusions/preview",
    response_model=ExclusionPreviewApiResponse,
)
def preview_exclusions(
    request: ExclusionPreviewApiRequest,
    action_data_api_client: MockActionDataApiClient | ApiActionDataApiClient = Depends(
        get_action_data_api_client
    ),
) -> ExclusionPreviewApiResponse:
    """Preview proposed exclusions from raw exclusion preferences."""
    request_trace_id = request.meta.requestId
    internal_request_id = uuid4()
    artifact_writer = ArtifactWriter(
        request_id=internal_request_id,
        request_kind="exclusion_preview",
    )

    try:
        logger.info(
            "Exclusion preview request received frontend_request_id=%s internal_request_id=%s cities=%s",
            request_trace_id,
            internal_request_id,
            len(request.requestData.cityDataList),
        )
        artifact_writer.write_run_file(
            "input_snapshot.json",
            {
                "frontend_request_id": request_trace_id,
                "city_data_list": [
                    city_input.model_dump(mode="json")
                    for city_input in request.requestData.cityDataList
                ],
            },
        )
        actions = action_data_api_client.list_actions()
        fetch_actions_event_index = artifact_writer.write_event(
            "fetch_actions.completed",
            {"total_actions": len(actions)},
        )
        artifact_writer.write_step_detail(
            "fetch_actions",
            {
                "total_actions": len(actions),
                "action_ids": sorted(action.action_id for action in actions),
            },
            event_index=fetch_actions_event_index,
            event_type="fetch_actions.completed",
        )
        results: list[ExclusionPreviewCityResult] = []
        for city_input in request.requestData.cityDataList:
            city_result, diagnostics = resolve_exclusion_preview_with_diagnostics(
                city_input=city_input,
                actions=actions,
            )
            results.append(city_result)
            preview_event_index = artifact_writer.write_event(
                "exclusion_preview_city.completed",
                {
                    "locode": city_input.locode,
                    "proposed_exclusions": city_result.exclusionSummary.totalProposed,
                    "warnings_count": len(city_result.warnings),
                },
            )
            safe_locode = _safe_artifact_name(city_input.locode)
            artifact_writer.write_step_detail(
                f"exclusion_preview_{safe_locode}",
                diagnostics,
                event_index=preview_event_index,
                event_type="exclusion_preview_city.completed",
            )
            artifact_writer.write_run_file(
                f"cities/{safe_locode}_preview.json",
                diagnostics,
            )
            free_text_resolution = diagnostics.get("free_text_resolution")
            if isinstance(free_text_resolution, dict) and free_text_resolution:
                artifact_writer.write_run_file(
                    f"llm/{safe_locode}_free_text_exclusion_io.json",
                    free_text_resolution,
                )
        logger.info(
            "Exclusion preview request completed frontend_request_id=%s internal_request_id=%s cities=%s",
            request_trace_id,
            internal_request_id,
            len(results),
        )
        response = ExclusionPreviewApiResponse(results=results)
        artifact_writer.write_event(
            "response_summary.completed",
            {
                "cities": len(results),
                "total_proposed_exclusions": sum(
                    result.exclusionSummary.totalProposed for result in results
                ),
            },
        )
        artifact_writer.write_run_file(
            "response_full.json",
            response.model_dump(mode="json"),
        )
        artifact_writer.write_manifest(
            {
                "counts": {
                    "cities": len(results),
                    "total_proposed_exclusions": sum(
                        result.exclusionSummary.totalProposed for result in results
                    ),
                },
                "artifact_pointers": {
                    "summary_events": "summary.jsonl",
                    "input_snapshot": "input_snapshot.json",
                    "response_full": "response_full.json",
                },
            }
        )
        return response
    except ValueError as error:
        logger.warning(
            "Invalid exclusion preview request request_id=%s error=%s",
            request_trace_id,
            error,
        )
        raise HTTPException(
            status_code=422,
            detail=_error_payload(request_trace_id, str(error)),
        ) from error
    except Exception as error:
        logger.exception("Exclusion preview failed request_id=%s", request_trace_id)
        raise HTTPException(
            status_code=500,
            detail=_error_payload(request_trace_id, "Internal server error"),
        ) from error


@router.post("/v1/prioritize", response_model=PrioritizerApiResponse)
def prioritize(
    request: PrioritizerApiRequest,
    city_data_api_client: MockCityDataApiClient | ApiCityDataApiClient = Depends(
        get_city_data_api_client
    ),
    action_data_api_client: MockActionDataApiClient | ApiActionDataApiClient = Depends(
        get_action_data_api_client
    ),
    legal_data_api_client: MockLegalDataApiClient | ApiLegalDataApiClient = Depends(
        get_legal_data_api_client
    ),
    policy_signals_data_api_client: (
        MockPolicySignalsDataApiClient | ApiPolicySignalsDataApiClient
    ) = Depends(
        get_policy_signals_data_api_client
    ),
) -> PrioritizerApiResponse:
    """
    Prioritize actions from the CityCatalyst frontend request envelope.

    This endpoint is synchronous because the orchestrator and data clients
    are synchronous; FastAPI runs sync routes in a threadpool to avoid
    blocking the event loop.
    """

    # Get the request trace ID from the request envelope.
    request_trace_id = request.meta.requestId

    try:
        logger.info(
            "Prioritization request received frontend_request_id=%s cities=%s requested_top_n=%s create_explanations=%s",
            request_trace_id,
            len(request.requestData.cityDataList),
            request.requestData.topN,
            request.requestData.createExplanations,
        )
        results: list[PrioritizerApiCityResult] = []
        for city_input in request.requestData.cityDataList:
            logger.info(
                "Prioritization city started frontend_request_id=%s locode=%s",
                request_trace_id,
                city_input.locode,
            )
            per_city_result = _run_for_city_input(
                city_input=city_input,
                requested_top_n=request.requestData.topN,
                city_data_api_client=city_data_api_client,
                action_data_api_client=action_data_api_client,
                legal_data_api_client=legal_data_api_client,
                policy_signals_data_api_client=policy_signals_data_api_client,
                create_explanations=request.requestData.createExplanations,
            )
            # Echo frontend request ID for response correlation in clients/logs.
            per_city_result.metadata["frontend_request_id"] = request_trace_id
            results.append(
                PrioritizerApiCityResult(
                    locode=city_input.locode,
                    ranked_action_ids=per_city_result.ranked_action_ids,
                    ranked_actions=per_city_result.ranked_actions,
                    metadata=per_city_result.metadata,
                )
            )

        logger.info(
            "Prioritization request completed frontend_request_id=%s cities=%s",
            request_trace_id,
            len(results),
        )
        return PrioritizerApiResponse(results=results)
    except ValueError as error:
        logger.warning(
            "Invalid prioritization request request_id=%s error=%s",
            request_trace_id,
            error,
        )
        raise HTTPException(
            status_code=422,
            detail=_error_payload(request_trace_id, str(error)),
        ) from error
    except Exception as error:
        logger.exception("Prioritization failed request_id=%s", request_trace_id)
        raise HTTPException(
            status_code=500,
            detail=_error_payload(request_trace_id, "Internal server error"),
        ) from error


def _run_for_city_input(
    *,
    city_input: FrontendCityInput,
    requested_top_n: int | None,
    city_data_api_client: MockCityDataApiClient | ApiCityDataApiClient,
    action_data_api_client: MockActionDataApiClient | ApiActionDataApiClient,
    legal_data_api_client: MockLegalDataApiClient | ApiLegalDataApiClient,
    policy_signals_data_api_client: (
        MockPolicySignalsDataApiClient | ApiPolicySignalsDataApiClient
    ),
    create_explanations: bool,
) -> PrioritizationResponse:
    """
    Translate a single frontend city payload into a pipeline run.

    Ranking trusts `excludedActionIds` supplied after the exclusion-preview
    review step and does not reinterpret raw exclusion preferences.
    """

    # Create internal request ID used for orchestrator artifacts/tracing.
    internal_request_id = uuid4()
    city_emissions_by_gpc_ref = _extract_city_emissions_by_gpc_ref(city_input)
    result = run_prioritization(
        locode=city_input.locode,
        weights_override=city_input.weightsOverride,
        top_n=resolve_top_n(requested_top_n),
        excluded_action_ids=list(city_input.excludedActionIds),
        city_preference_sectors=list(city_input.cityStrategicPreferenceSectors),
        city_preference_timeframes=list(city_input.cityStrategicPreferenceTimeframes),
        city_preference_other_text=city_input.cityStrategicPreferenceOther,
        city_emissions_by_gpc_ref=city_emissions_by_gpc_ref,
        internal_request_id=internal_request_id,
        city_data_api_client=city_data_api_client,
        action_data_api_client=action_data_api_client,
        legal_data_api_client=legal_data_api_client,
        policy_signals_data_api_client=policy_signals_data_api_client,
        create_explanations=create_explanations,
    )
    return result
