from datetime import datetime, UTC
import uuid
import threading

from fastapi import HTTPException, APIRouter, Request
import logging

from utils.build_city_data import build_city_data
from services.get_context import get_context
from services.get_actions import get_actions

from plan_creator_bundle.plan_creator.models import (
    PlanRequest,
    StartPlanCreationResponse,
    CheckProgressResponse,
    PlanResponse,
)

from limiter import limiter
from plan_creator_bundle.plan_creator.tasks import _execute_plan_creation
from plan_creator_bundle.plan_creator.task_storage import task_storage

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/v1/start_plan_creation", response_model=StartPlanCreationResponse, status_code=202
)
@limiter.limit("5/minute")
async def start_plan_creation(request: Request, req: PlanRequest):
    """Start asynchronous plan creation process"""
    # Generate a unique task ID
    task_uuid = str(uuid.uuid4())
    logger.info(f"Task {task_uuid}: Received plan creation request")
    logger.info(f"Task {task_uuid}: Locode: {req.cityData.cityContextData.locode}")
    logger.info(f"Task {task_uuid}: Requested language: {req.language}")

    # 1. Initialize task status
    task_storage[task_uuid] = {
        "status": "pending",
        "created_at": datetime.now().isoformat(),
        "action_id": req.actionId,
        "locode": req.cityData.cityContextData.locode,
    }

    # 2. Extract needed city data from request into requestCityData
    requestCityData = {}

    # Extract city context data
    requestCityData["locode"] = req.cityData.cityContextData.locode
    requestCityData["populationSize"] = req.cityData.cityContextData.populationSize

    # Extract city emissions data
    requestCityData["stationaryEnergyEmissions"] = (
        req.cityData.cityEmissionsData.stationaryEnergyEmissions
    )
    requestCityData["transportationEmissions"] = (
        req.cityData.cityEmissionsData.transportationEmissions
    )
    requestCityData["wasteEmissions"] = req.cityData.cityEmissionsData.wasteEmissions
    requestCityData["ippuEmissions"] = req.cityData.cityEmissionsData.ippuEmissions
    requestCityData["afoluEmissions"] = req.cityData.cityEmissionsData.afoluEmissions

    # 3. Fetch general city context data from global API
    cityContext = get_context(requestCityData["locode"])
    if not cityContext:
        logger.error(
            f"Task {task_uuid}: No city context data found from global API.",
            exc_info=True,
        )
        raise HTTPException(
            status_code=404, detail="No city context data found from global API."
        )

    # 4. Combine city context and city data
    cityData = build_city_data(cityContext, requestCityData)

    # 5. Fetch actions from API and filter by actionId
    actions = get_actions()
    if not actions:
        logger.error(
            f"Task {task_uuid}: No actions data found from global API.", exc_info=True
        )
        raise HTTPException(
            status_code=404, detail="No actions data found from global API."
        )

    action = None
    for item in actions:
        if item["ActionID"] == req.actionId:
            action = item
            break
    if not action:
        logger.error(
            f"Task {task_uuid}: Action not found within retrieved actions from global API.",
            exc_info=True,
        )
        raise HTTPException(
            status_code=404,
            detail="Action not found within retrieved actions from global API.",
        )

    # 6. Build dictionary with data for background task
    background_task_input = {
        "countryCode": req.countryCode,
        "cityData": cityData,
        "action": action,
        "language": req.language,
    }
    # 7. Start background thread for processing
    try:
        thread = threading.Thread(
            target=_execute_plan_creation,
            args=(task_uuid, background_task_input),
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

    # Return the task ID immediately
    return StartPlanCreationResponse(taskId=task_uuid, status="pending")


@router.get("/v1/check_progress/{task_uuid}", response_model=CheckProgressResponse)
@limiter.limit("10/minute")
async def check_progress(request: Request, task_uuid: str):
    """Check the progress of a plan creation task"""
    logger.info(f"Task {task_uuid}: Checking progress")

    if task_uuid not in task_storage:
        logger.warning(f"Task {task_uuid}: Task not found")
        raise HTTPException(status_code=404, detail=f"Task {task_uuid} not found")

    task_info = task_storage[task_uuid]
    logger.info(f"Task {task_uuid}: Task status: {task_info['status']}")

    # Include error message if status is failed
    if task_info["status"] == "failed" and "error" in task_info:
        return CheckProgressResponse(
            status=task_info["status"], error=task_info["error"]
        )

    return CheckProgressResponse(status=task_info["status"])


@router.get("/v1/get_plan/{task_uuid}", response_model=PlanResponse)
@limiter.limit("10/minute")
async def get_plan(request: Request, task_uuid: str):
    """Get the completed plan for a task. Returns error details if failed or not ready."""
    logger.info(f"Task {task_uuid}: Retrieving plan")
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
            detail=f"Plan for task {task_uuid} is not ready yet. Current status: {task_info['status']}",
        )

    try:
        return task_info["plan_response"]
    except Exception as e:
        logger.error(
            f"Task {task_uuid}: Error returning plan response: {str(e)}", exc_info=True
        )
        raise HTTPException(status_code=500, detail="Error returning plan response.")
