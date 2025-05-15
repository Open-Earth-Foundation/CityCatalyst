from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from typing import Any, Dict, Optional, List
import logging
from datetime import datetime
from prioritizer.utils.tournament import tournament_ranking
from prioritizer.utils.ml_comparator import ml_compare
from utils.build_city_data import build_city_data
from services.get_actions import get_actions
from services.get_context import get_context
from prioritizer.utils.filter_actions_by_biome import filter_actions_by_biome
from prioritizer.models import (
    PrioritizeRequest,
    PrioritizeResponse,
    RankedAction,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/v1/prioritize_city",
    response_model=PrioritizeResponse,
    summary="Prioritize climate actions for a single city",
    description="This endpoint receives city context and emissions data, and returns a ranked list of climate actions.",
)
async def prioritize(request: PrioritizeRequest):
    logger.info(
        f"Received prioritization request for city: {request.cityData.cityContextData.locode}"
    )

    # 1. Extract needed data from request into requestData
    requestData = {}
    requestData["locode"] = request.cityData.cityContextData.locode
    requestData["populationSize"] = request.cityData.cityContextData.populationSize
    requestData["stationaryEnergyEmissions"] = (
        request.cityData.cityEmissionsData.stationaryEnergyEmissions
    )
    requestData["transportationEmissions"] = (
        request.cityData.cityEmissionsData.transportationEmissions
    )
    requestData["wasteEmissions"] = request.cityData.cityEmissionsData.wasteEmissions
    requestData["ippuEmissions"] = request.cityData.cityEmissionsData.ippuEmissions
    requestData["afoluEmissions"] = request.cityData.cityEmissionsData.afoluEmissions

    # 1. Fetch general city context data from global API
    cityContext = get_context(requestData["locode"])
    if not cityContext:
        return JSONResponse(
            status_code=404,
            content={"detail": "No city context data found from global API."},
        )

    # 2. Combine city context and city data
    cityData = build_city_data(cityContext, requestData)

    # 3. Fetch actions from API
    actions = get_actions()
    if not actions:
        return JSONResponse(
            status_code=404,
            content={"detail": "No actions data found from global API."},
        )

    # 4. Filter actions by biome if applicable
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
            actionId=action.get("ActionID", "Unknown"),
            rank=rank,
            explanation=f"Ranked #{rank} by tournament ranking algorithm",
        )
        for action, rank in mitigationRanking
    ]
    rankedActionsAdaptation = [
        RankedAction(
            actionId=action.get("ActionID", "Unknown"),
            rank=rank,
            explanation=f"Ranked #{rank} by tournament ranking algorithm",
        )
        for action, rank in adaptationRanking
    ]

    return PrioritizeResponse(
        locode=request.cityData.cityContextData.locode,
        rankedDate=datetime.now(),
        rankedActionsMitigation=rankedActionsMitigation,
        rankedActionsAdaptation=rankedActionsAdaptation,
    )
