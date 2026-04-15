"""FastAPI routes for MEED prioritization."""

from __future__ import annotations

import logging
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException

from app.modules.prioritizer.config import resolve_top_n
from app.modules.prioritizer.models import (
    FrontendCityInput,
    PrioritizationResponse,
    PrioritizerApiCityResult,
    PrioritizerApiRequest,
    PrioritizerApiResponse,
)
from app.modules.prioritizer.orchestrator import run_prioritization
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
            "Prioritization request received frontend_request_id=%s cities=%s requested_top_n=%s",
            request_trace_id,
            len(request.requestData.cityDataList),
            request.requestData.topN,
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
) -> PrioritizationResponse:
    """
    Translate a single frontend city payload into a pipeline run.

    Current behavior:
    - `excludedActionsFreeText` is treated as a **stub** and does not exclude actions.

    Future behavior:
    - Resolve free-text exclusions into concrete action exclusions via semantic
      matching over action name/description and/or a curated mapping table.
    """

    # Create internal request ID used for orchestrator artifacts/tracing.
    internal_request_id = uuid4()
    city_emissions_by_gpc_ref = _extract_city_emissions_by_gpc_ref(city_input)
    result = run_prioritization(
        locode=city_input.locode,
        weights_override=city_input.weightsOverride,
        top_n=resolve_top_n(requested_top_n),
        excluded_actions_free_text=city_input.excludedActionsFreeText,
        city_preference_sectors=list(city_input.cityStrategicPreferenceSectors),
        city_preference_other_text=city_input.cityStrategicPreferenceOther,
        city_emissions_by_gpc_ref=city_emissions_by_gpc_ref,
        internal_request_id=internal_request_id,
        city_data_api_client=city_data_api_client,
        action_data_api_client=action_data_api_client,
        legal_data_api_client=legal_data_api_client,
        policy_signals_data_api_client=policy_signals_data_api_client,
    )
    return result
