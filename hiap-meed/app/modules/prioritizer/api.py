"""FastAPI routes for MEED prioritization."""

from __future__ import annotations

import logging
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException

from app.modules.prioritizer.models import PrioritizationRequest, PrioritizationResponse
from app.modules.prioritizer.orchestrator import run_prioritization
from app.services.data_clients import (
    ActionDataApiClient,
    CityDataApiClient,
    get_action_data_api_client,
    get_city_data_api_client,
)


logger = logging.getLogger(__name__)

router = APIRouter(tags=["prioritization"])


def _error_payload(request_id: UUID, message: str) -> dict[str, str]:
    """Build a consistent JSON error body including the request ID."""
    return {"request_id": str(request_id), "error": message}


@router.post("/v1/prioritize", response_model=PrioritizationResponse)
def prioritize(
    request: PrioritizationRequest,
    city_data_api_client: CityDataApiClient = Depends(get_city_data_api_client),
    action_data_api_client: ActionDataApiClient = Depends(get_action_data_api_client),
) -> PrioritizationResponse:
    """
    Run prioritization for one city and return ordered action IDs.

    This endpoint is synchronous because the orchestrator and data clients
    are synchronous; FastAPI runs sync routes in a threadpool to avoid
    blocking the event loop.
    """
    request_id = uuid4()
    try:
        return run_prioritization(
            request=request,
            request_id=request_id,
            city_data_api_client=city_data_api_client,
            action_data_api_client=action_data_api_client,
        )
    except ValueError as error:
        logger.warning(
            "Invalid prioritization request request_id=%s error=%s", request_id, error
        )
        raise HTTPException(
            status_code=422,
            detail=_error_payload(request_id, str(error)),
        ) from error
    except Exception as error:
        logger.exception("Prioritization failed request_id=%s", request_id)
        raise HTTPException(
            status_code=500,
            detail=_error_payload(request_id, "Internal server error"),
        ) from error
