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
    return {"request_id": str(request_id), "error": message}


@router.post("/v1/prioritize", response_model=PrioritizationResponse)
async def prioritize(
    request: PrioritizationRequest,
    city_data_api_client: CityDataApiClient = Depends(get_city_data_api_client),
    action_data_api_client: ActionDataApiClient = Depends(get_action_data_api_client),
) -> PrioritizationResponse:
    """Run prioritization for one city and return ordered action IDs."""
    request_id = uuid4()
    try:
        return run_prioritization(
            request=request,
            request_id=request_id,
            city_data_api_client=city_data_api_client,
            action_data_api_client=action_data_api_client,
        )
    except ValueError as error:
        logger.warning("Invalid prioritization request request_id=%s error=%s", request_id, error)
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


__all__ = ["router", "get_action_data_api_client", "get_city_data_api_client"]
