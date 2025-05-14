from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import Any, Dict, Optional, List
import logging
from datetime import datetime
from prioritizer.utils.tournament import tournament_ranking
from prioritizer.utils.ml_comparator import ml_compare
from prioritizer.scripts.get_actions import get_actions
from prioritizer.scripts.create_city_data.get_context import get_context
from prioritizer.prioritizer import filter_actions_by_biome

logger = logging.getLogger(__name__)

router = APIRouter()

# --- Request models ---


class CityContext(BaseModel):
    locode: str = Field(..., min_length=1)  # Make sure its not an empty string
    populationSize: Optional[int] = Field(default=None, ge=0)


class CityEmissionsData(BaseModel):
    stationaryEnergyEmissions: Optional[float] = Field(default=None, ge=0)
    transportationEmissions: Optional[float] = Field(default=None, ge=0)
    wasteEmissions: Optional[float] = Field(default=None, ge=0)
    ippuEmissions: Optional[float] = Field(default=None, ge=0)
    afoluEmissions: Optional[float] = Field(default=None, ge=0)


class PrioritizeRequest(BaseModel):
    cityContext: CityContext
    cityEmissionsData: CityEmissionsData


# --- Response models ---


class RankedAction(BaseModel):
    actionID: str
    rank: int
    explanation: str


class PrioritizeResponse(BaseModel):
    locode: str
    rankedDate: datetime
    rankedActionsMitigation: List[RankedAction]
    rankedActionsAdaptation: List[RankedAction]


def build_city_data(
    contextData: dict, requestBody: dict, ccra: Optional[dict] = None
) -> dict:
    """
    Build the city_data dictionary as required.
    - Use all fields from contextData except scope1/2/3 emissions.
    - Override populationSize with value from requestBody.
    - Calculate totalEmissions as the sum of the other 5 emissions.
    - Initiates ccra as empty list (for now)

    Input:
        contextData: general city context data from global api
        requestBody: the full request body dict (with cityContext and cityEmissionsData)
        ccra: ccra data from global api

    Returns:
    A dictionary with the following structure:
        - locode (str): City code, from context data.
        - name (str): City name, from context data.
        - region (str): Region code, from context data.
        - regionName (str): Region name, from context data.
        - populationDensity (float): Population density, from context data.
        - area (float): Area in square kilometers, from context data.
        - elevation (float): Elevation in meters, from context data.
        - biome (str): Biome classification, from context data.
        - socioEconomicFactors (dict): Socioeconomic data, from context data.
        - accessToPublicServices (dict): Access indicators, from context data.
        - populationSize (float, optional): Overridden value from request body.
        - stationaryEnergyEmissions (float): Emissions from stationary energy (default 0).
        - transportationEmissions (float): Emissions from transportation (default 0).
        - wasteEmissions (float): Emissions from waste (default 0).
        - ippuEmissions (float): Emissions from industrial processes and product use (default 0).
        - afoluEmissions (float): Emissions from agriculture, forestry, and other land use (default 0).
        - totalEmissions (float): Sum of all emission-related fields.
        - ccra (list): Initialized as an empty list for future climate change risk assessments.
    """
    # Step 1: Copy all relevant fields from contextData
    cityData = {}

    # Step 2: Directly copy simple fields
    for key in [
        "locode",
        "name",
        "region",
        "regionName",
        "populationDensity",
        "area",
        "elevation",
        "biome",
        "socioEconomicFactors",
        "accessToPublicServices",
    ]:
        cityData[key] = contextData.get(key)

    # Step 3: Override populationSize with value from requestBody
    cityData["populationSize"] = requestBody.get("cityContext", {}).get(
        "populationSize"
    )

    # Step 4: Copy emissions fields from nested cityEmissionsData
    emissionFields = [
        "stationaryEnergyEmissions",
        "transportationEmissions",
        "wasteEmissions",
        "ippuEmissions",
        "afoluEmissions",
    ]
    totalEmissions = 0
    emissions = requestBody.get("cityEmissionsData", {})
    for field in emissionFields:
        value = emissions.get(field)
        if value is None:
            value = 0  # Default to 0 if missing
        cityData[field] = value
        totalEmissions += value

    # Step 5: Set totalEmissions as the sum of the above emissions
    cityData["totalEmissions"] = totalEmissions

    # Step 6: Initialize ccra data to empty list
    cityData["ccra"] = ccra

    # Step 7: Return the constructed dictionary
    return cityData


@router.post(
    "/v1/prioritize_city",
    response_model=PrioritizeResponse,
    summary="Prioritize climate actions for a single city",
    description="This endpoint receives city context and emissions data, and returns a ranked list of climate actions.",
)
async def prioritize(request: PrioritizeRequest):
    logger.info(
        f"Received prioritization request for city: {request.cityContext.locode}"
    )

    # 1. Fetch general city context data from global API
    cityContext = get_context(request.cityContext.locode)
    if not cityContext:
        return JSONResponse(
            status_code=500,
            content={"detail": "No city context data found from global API."},
        )

    # 2. Combine city context and city data
    cityData = build_city_data(cityContext, request.model_dump())

    # 3. Fetch actions from API
    actions = get_actions()
    if not actions:
        return JSONResponse(
            status_code=500,
            content={"detail": "No actions data found from global API."},
        )

    # 4. Filter actions by biome if applicable
    # Currently 239 mitigation actions and 86 adaptation actions - no biome filtering yet because of missing biome data
    filteredActions = filter_actions_by_biome(cityData, actions)
    logger.info(f"After biome filtering: {len(filteredActions)} actions remain")

    # 5. Separate mitigation and adaptation actions
    mitigationActions = [
        action
        for action in filteredActions
        if action.get("ActionType") is not None
        and isinstance(action["ActionType"], list)
        and "mitigation" in action["ActionType"]
    ]
    adaptationActions = [
        action
        for action in filteredActions
        if action.get("ActionType") is not None
        and isinstance(action["ActionType"], list)
        and "adaptation" in action["ActionType"]
    ]

    logger.info(
        f"Found {len(mitigationActions)} mitigation actions and {len(adaptationActions)} adaptation actions"
    )

    # 6. Apply tournament ranking for adaptation and mitigation actions
    mitigationRanking = tournament_ranking(
        cityData, mitigationActions, comparator=ml_compare
    )
    adaptationRanking = tournament_ranking(
        cityData, adaptationActions, comparator=ml_compare
    )

    # 7. Format results for API response (top 20)
    rankedActionsMitigation = [
        RankedAction(
            actionID=action.get("ActionID", "Unknown"),
            rank=rank,
            explanation=f"Ranked #{rank} by tournament ranking algorithm",
        )
        for action, rank in mitigationRanking
    ]
    rankedActionsAdaptation = [
        RankedAction(
            actionID=action.get("ActionID", "Unknown"),
            rank=rank,
            explanation=f"Ranked #{rank} by tournament ranking algorithm",
        )
        for action, rank in adaptationRanking
    ]

    return PrioritizeResponse(
        locode=request.cityContext.locode,
        rankedDate=datetime.now(),
        rankedActionsMitigation=rankedActionsMitigation,
        rankedActionsAdaptation=rankedActionsAdaptation,
    )
