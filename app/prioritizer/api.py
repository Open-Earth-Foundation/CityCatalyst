from typing import Dict
from fastapi import APIRouter, HTTPException
from datetime import datetime
import time
import uuid
import threading

import logging
from utils.logging_config import setup_logger

from prioritizer.utils.tournament import tournament_ranking
from prioritizer.utils.ml_comparator import ml_compare
from utils.build_city_data import build_city_data
from services.get_actions import get_actions
from services.get_context import get_context
from prioritizer.utils.filter_actions_by_biome import filter_actions_by_biome
from prioritizer.models import (
    PrioritizerRequest,
    PrioritizerResponse,
    RankedAction,
    MetaData,
    CheckProgressResponse,
    StartPrioritizationResponse,
    CityData,
)

# Setup logging configuration
setup_logger()
logger = logging.getLogger(__name__)

router = APIRouter()

# Storage for task status and results
task_storage = {}


def _execute_prioritization(task_uuid: str, background_task_input: Dict[str, CityData]):
    try:
        task_storage[task_uuid]["status"] = "running"
        logger.info(
            f"Task {task_uuid}: Starting prioritization for locode={background_task_input['cityData'].cityContextData.locode}"
        )
        start_time = time.time()
        try:
            # 1. Extract needed data from request into requestData
            requestData = {}
            requestData["locode"] = background_task_input[
                "cityData"
            ].cityContextData.locode
            requestData["populationSize"] = background_task_input[
                "cityData"
            ].cityContextData.populationSize
            requestData["stationaryEnergyEmissions"] = background_task_input[
                "cityData"
            ].cityEmissionsData.stationaryEnergyEmissions
            requestData["transportationEmissions"] = background_task_input[
                "cityData"
            ].cityEmissionsData.transportationEmissions
            requestData["wasteEmissions"] = background_task_input[
                "cityData"
            ].cityEmissionsData.wasteEmissions
            requestData["ippuEmissions"] = background_task_input[
                "cityData"
            ].cityEmissionsData.ippuEmissions
            requestData["afoluEmissions"] = background_task_input[
                "cityData"
            ].cityEmissionsData.afoluEmissions

            # API call to get city context data
            cityContext = get_context(requestData["locode"])
            if not cityContext:
                task_storage[task_uuid]["status"] = "failed"
                task_storage[task_uuid][
                    "error"
                ] = "No city context data found from global API."
                return
            # Build city data
            cityData = build_city_data(cityContext, requestData)

            # API call to get actions data
            actions = get_actions()
            if not actions:
                task_storage[task_uuid]["status"] = "failed"
                task_storage[task_uuid][
                    "error"
                ] = "No actions data found from global API."
                return
            filteredActions = filter_actions_by_biome(cityData, actions)
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
            mitigationRanking = tournament_ranking(
                cityData, mitigationActions, comparator=ml_compare
            )
            adaptationRanking = tournament_ranking(
                cityData, adaptationActions, comparator=ml_compare
            )
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
            prioritizer_response = PrioritizerResponse(
                metadata=MetaData(
                    locode=background_task_input["cityData"].cityContextData.locode,
                    rankedDate=datetime.now(),
                ),
                rankedActionsMitigation=rankedActionsMitigation,
                rankedActionsAdaptation=rankedActionsAdaptation,
            )
            task_storage[task_uuid]["status"] = "completed"
            task_storage[task_uuid]["prioritizer_response"] = prioritizer_response
            process_time = time.time() - start_time
            logger.info(
                f"Task {task_uuid}: Prioritization completed in {process_time:.2f}s"
            )
        except Exception as e:
            logger.error(
                f"Task {task_uuid}: Error during prioritization: {str(e)}",
                exc_info=True,
            )
            task_storage[task_uuid]["status"] = "failed"
            task_storage[task_uuid]["error"] = f"Error during prioritization: {str(e)}"
            return
    except Exception as e:
        logger.error(
            f"Task {task_uuid}: Unexpected error during prioritization: {str(e)}",
            exc_info=True,
        )
        task_storage[task_uuid]["status"] = "failed"
        task_storage[task_uuid]["error"] = f"Error during prioritization: {str(e)}"


@router.post(
    "/v1/start_prioritization",
    response_model=StartPrioritizationResponse,
    status_code=202,
)
async def start_prioritization(request: PrioritizerRequest):
    task_uuid = str(uuid.uuid4())
    logger.info(f"Task {task_uuid}: Received prioritization request")
    logger.info(f"Task {task_uuid}: Locode: {request.cityData.cityContextData.locode}")
    task_storage[task_uuid] = {
        "status": "pending",
        "created_at": datetime.now().isoformat(),
        "locode": request.cityData.cityContextData.locode,
    }
    background_task_input = {
        "cityData": request.cityData.model_dump(),
    }
    try:
        thread = threading.Thread(
            target=_execute_prioritization, args=(task_uuid, background_task_input)
        )
        thread.daemon = True
        thread.start()
        logger.info(f"Task {task_uuid}: Started background processing for task")
    except Exception as e:
        logger.error(
            f"Task {task_uuid}: Failed to start background thread: {str(e)}",
            exc_info=True,
        )
        task_storage[task_uuid]["status"] = "failed"
        task_storage[task_uuid][
            "error"
        ] = f"Failed to start background thread: {str(e)}"
        raise HTTPException(
            status_code=500, detail="Failed to start background thread."
        )
    return StartPrioritizationResponse(
        taskId=task_uuid, status=task_storage[task_uuid]["status"]
    )


@router.get(
    "/v1/check_prioritization_progress/{task_uuid}",
    response_model=CheckProgressResponse,
)
async def check_prioritization_progress(task_uuid: str):
    logger.info(f"Task {task_uuid}: Checking prioritization progress")
    if task_uuid not in task_storage:
        logger.warning(f"Task {task_uuid}: Task not found")
        raise HTTPException(status_code=404, detail=f"Task {task_uuid} not found")

    task_info = task_storage[task_uuid]
    logger.info(f"Task {task_uuid}: Task status: {task_info['status']}")

    if task_info["status"] == "failed" and "error" in task_info:
        return CheckProgressResponse(
            status=task_info["status"], error=task_info["error"]
        )
    return CheckProgressResponse(status=task_info["status"])


@router.get("/v1/get_prioritization/{task_uuid}", response_model=PrioritizerResponse)
async def get_prioritization(task_uuid: str):
    logger.info(f"Task {task_uuid}: Retrieving prioritization result")
    if task_uuid not in task_storage:
        logger.warning(f"Task {task_uuid}: Task not found")
        raise HTTPException(status_code=404, detail=f"Task {task_uuid} not found")
    task_info = task_storage[task_uuid]
    if task_info["status"] == "failed":
        logger.error(
            f"Task {task_uuid}: Task failed: {task_info.get('error')}", exc_info=True
        )
        raise HTTPException(
            status_code=500,
            detail=f"Task {task_uuid} failed: {task_info.get('error', 'Unknown error')}",
        )
    if task_info["status"] != "completed":
        logger.info(f"Task {task_uuid}: Task not completed yet: {task_info['status']}")
        raise HTTPException(
            status_code=409,
            detail=f"Prioritization for task {task_uuid} is not ready yet. Current status: {task_info['status']}",
        )
    try:
        return task_info["prioritizer_response"]
    except Exception as e:
        logger.error(
            f"Task {task_uuid}: Error returning prioritization response: {str(e)}",
            exc_info=True,
        )
        raise HTTPException(
            status_code=500, detail="Error returning prioritization response."
        )
