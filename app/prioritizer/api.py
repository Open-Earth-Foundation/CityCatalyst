from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Any, Dict, Optional, List
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

router = APIRouter()

# --- Request models ---


class CityContext(BaseModel):
    locode: str
    population: Optional[int] = (
        None  # This is optional and not used in the prioritization currently
    )


class EmissionsData(BaseModel):
    stationary_energy: Optional[float] = None
    transportation: Optional[float] = None
    waste: Optional[float] = None
    ippu: Optional[float] = None
    afolu: Optional[float] = None


class Action(BaseModel):
    id: str
    name: Optional[str] = None
    description: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = (
        None  # You can define stricter schema if needed
    )


class PrioritizeRequest(BaseModel):
    city_data: CityContext
    emissions_data: EmissionsData


# --- Response models ---


class RankedAction(BaseModel):
    action_id: str
    rank: int
    explanation: str


class PrioritizeResponse(BaseModel):
    locode: str
    ranked_date: datetime
    ranked_actions: List[RankedAction]


@router.post("/v1/prioritize", response_model=PrioritizeResponse)
async def prioritize(request: PrioritizeRequest):
    logger.info(f"Received prioritization request for city: {request.city_data.locode}")
    # Placeholder logic
    return PrioritizeResponse(
        locode=request.city_data.locode,
        ranked_date=datetime.now(),
        ranked_actions=[
            RankedAction(
                action_id="1", rank=1, explanation="Test prioritization result"
            )
        ],
    )
