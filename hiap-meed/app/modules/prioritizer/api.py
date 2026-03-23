"""FastAPI routes for MEED prioritization."""

from __future__ import annotations

import logging
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException

from app.modules.prioritizer.models import (
    FrontendCityInput,
    PrioritizationResponse,
    PrioritizerApiCityResult,
    PrioritizerApiRequest,
    PrioritizerApiResponse,
)
from app.modules.prioritizer.orchestrator import run_prioritization
from app.services.data_clients import (
    ActionDataApiClient,
    CityDataApiClient,
    LegalDataApiClient,
    get_action_data_api_client,
    get_city_data_api_client,
    get_legal_data_api_client,
)


logger = logging.getLogger(__name__)

router = APIRouter(tags=["prioritization"])


def _error_payload(request_id: str, message: str) -> dict[str, str]:
    """Build a consistent JSON error body including the request ID."""
    return {"request_id": request_id, "error": message}


@router.post("/v1/prioritize", response_model=PrioritizerApiResponse)
def prioritize(
    request: PrioritizerApiRequest,
    city_data_api_client: CityDataApiClient = Depends(get_city_data_api_client),
    action_data_api_client: ActionDataApiClient = Depends(get_action_data_api_client),
    legal_data_api_client: LegalDataApiClient = Depends(get_legal_data_api_client),
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
        results: list[PrioritizerApiCityResult] = []
        for city_input in request.requestData.cityDataList:
            per_city_result = _run_for_city_input(
                city_input=city_input,
                frontend_request_id=request.meta.requestId,
                requested_languages=list(request.requestData.requestedLanguages),
                city_data_api_client=city_data_api_client,
                action_data_api_client=action_data_api_client,
                legal_data_api_client=legal_data_api_client,
            )
            results.append(
                PrioritizerApiCityResult(
                    locode=city_input.locode,
                    ranked_action_ids=per_city_result.ranked_action_ids,
                    metadata=per_city_result.metadata,
                )
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
    frontend_request_id: str,
    requested_languages: list[str],
    city_data_api_client: CityDataApiClient,
    action_data_api_client: ActionDataApiClient,
    legal_data_api_client: LegalDataApiClient,
) -> PrioritizationResponse:
    """
    Translate a single frontend city payload into a pipeline run.

    Current behavior:
    - `excludedActionsFreeText` is treated as a **stub** and does not exclude actions.
      The text is attached to metadata so downstream consumers (e.g. frontend)
      can flag it or implement a manual review flow.

    Future behavior:
    - Resolve free-text exclusions into concrete action exclusions via semantic
      matching over action name/description and/or a curated mapping table.
    """

    # Create internal request ID used for orchestrator artifacts/tracing.
    internal_request_id = uuid4()
    result = run_prioritization(
        locode=city_input.locode,
        weights_override=city_input.weightsOverride,
        top_n=None,
        excluded_actions_free_text=city_input.excludedActionsFreeText,
        internal_request_id=internal_request_id,
        city_data_api_client=city_data_api_client,
        action_data_api_client=action_data_api_client,
        legal_data_api_client=legal_data_api_client,
    )

    # Attach minimal frontend context for traceability/debugging.
    result.metadata["frontend_request_id"] = frontend_request_id
    result.metadata["requested_languages"] = requested_languages
    result.metadata["excluded_actions_free_text"] = city_input.excludedActionsFreeText
    return result
