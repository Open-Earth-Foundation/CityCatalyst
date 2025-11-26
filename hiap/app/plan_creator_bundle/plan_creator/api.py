from datetime import datetime, UTC
import uuid
import threading

from fastapi import HTTPException, APIRouter, Request
import logging
import json

from utils.build_city_data import build_city_data
from services.get_context import get_context
from services.get_actions import get_actions
from services.get_ccra import get_ccra

from plan_creator_bundle.plan_creator.models import (
    PlanRequest,
    StartTaskResponse,
    CheckProgressResponse,
    PlanResponse,
    TranslatePlanRequest,
)

from limiter import limiter
from plan_creator_bundle.plan_creator.tasks import (
    _execute_plan_creation,
    _execute_plan_translation,
)
from plan_creator_bundle.plan_creator.task_storage import task_storage
from fastapi.encoders import jsonable_encoder

from prioritizer.models import PrioritizationType

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/v1/start_plan_creation", response_model=StartTaskResponse, status_code=202
)
@limiter.limit("5/minute")
async def start_plan_creation(request: Request, req: PlanRequest):
    """
    Start a background task to create an action implementation plan for a city.

    This endpoint enqueues an asynchronous job that combines provided city data
    with global context and the selected action to generate a plan. Use the
    returned `taskId` with the progress and retrieval endpoints to monitor and
    fetch results.

    **Body**:
    - `cityData` (`CityData`): Minimal city context and emissions inputs.
    - `countryCode` (`str`): ISO 3166-1 alpha-2 code (defaults to "BR").
    - `actionId` (`str`): Identifier of the action to plan for.
    - `language` (`str`): ISO 639-1 code for output language (defaults to "en").

    **Returns**:
    - `StartTaskResponse`: Contains `taskId` and initial `status` (e.g. `pending`).

    **Errors**:
    - `404`: City context from global API not found, or action not found from global API.
    - `500`: Failed to start background processing.
    """
    # Generate a unique task ID
    task_uuid = str(uuid.uuid4())
    logger.info(f"Task {task_uuid}: Received plan creation request")
    try:
        body_json = json.dumps(jsonable_encoder(req), ensure_ascii=False)
        logger.info(f"Task {task_uuid}: Request body: {body_json}")
    except Exception:
        logger.exception(
            f"Task {task_uuid}: Failed to serialize request body for logging"
        )

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

    # 3. Fetch actions from API and filter by actionId and extract action type
    actions = get_actions()
    if not actions:
        logger.error(f"Task {task_uuid}: No actions data found from global API.")
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
            f"Task {task_uuid}: Action not found within retrieved actions from global API."
        )
        raise HTTPException(
            status_code=404,
            detail="Action not found within retrieved actions from global API.",
        )

    # Extract first action type if it's a list, otherwise set to None
    action_type = (
        action["ActionType"][0]
        if isinstance(action["ActionType"], list) and action["ActionType"]
        else None
    )

    if not action_type:
        logger.warning(
            f"Task {task_uuid}: Action type not found within retrieved actions from global API."
        )
        logger.warning(f"Continuing with no specific action type from global API.")

    # 4. Fetch general city context data from global API
    # Initialize city context and CCRA as None
    cityContext = None
    cityCCRA = None

    # Check if action type is mitigation or if action type is not provided execute for both mitigation and adaptation
    if action_type == PrioritizationType.MITIGATION.value or action_type is None:
        cityContext = get_context(requestCityData["locode"])
        if not cityContext:
            logger.warning(
                f"Task {task_uuid}: No city context data found from global API."
            )
            logger.warning(
                f"Continuing with no specific city context data from global API."
            )

    # Check if action type is adaptation or if action type is not provided execute for both mitigation and adaptation
    if action_type == PrioritizationType.ADAPTATION.value or action_type is None:
        cityCCRA = get_ccra(requestCityData["locode"], "current")
        if not cityCCRA:
            logger.warning(f"Task {task_uuid}: No CCRA data found from CCRA API.")
            logger.warning(f"Continuing with no specific CCRA data from global API.")

    # 4. Build city data, if no city context or CCRA data is provided, the city data will be built with the request data only.
    cityData = build_city_data(requestCityData, cityContext, cityCCRA)

    # 5. Build dictionary with data for background task
    background_task_input = {
        "countryCode": req.countryCode,
        "cityData": cityData,
        "action": action,
        "language": req.language,
    }
    # 6. Start background thread for processing
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
        ] = f"Failed to start background thread for plan creation: {str(e)}"

        raise HTTPException(
            status_code=500,
            detail="Failed to start background thread for plan creation.",
        )

    # Return the task ID immediately
    return StartTaskResponse(taskId=task_uuid, status=task_storage[task_uuid]["status"])


@router.get("/v1/check_progress/{task_uuid}", response_model=CheckProgressResponse)
@limiter.limit("10/minute")
async def check_progress(request: Request, task_uuid: str):
    """
    Check the current status of a background task.

    Use the `task_uuid` returned by a start endpoint to query progress. If the
    task failed, an error message may be included in the response.

    **Path params**:
    - `task_uuid` (`str`): Identifier of the task to check.

    **Returns**:
    - `CheckProgressResponse`: `status` (e.g. `pending`, `running`, `completed`, `failed`)
      and optional `error` when `status` is `failed`.

    **Errors**:
    - `404`: Task not found.
    """
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
    """
    Retrieve the completed plan for a finished task.

    Only call this after the task reports `completed` via the progress endpoint.

    **Path params**:
    - `task_uuid` (`str`): Identifier of the plan creation task.

    **Returns**:
    - `PlanResponse`: The generated plan content and metadata.

    **Errors**:
    - `404`: Task not found.
    - `409`: Task not completed yet.
    - `400`: Task missing plan response.
    - `500`: Task failed or an internal error occurred while returning the plan.
    """
    logger.info(f"Task {task_uuid}: Retrieving plan")
    if task_uuid not in task_storage:
        logger.warning(f"Task {task_uuid}: Task not found")
        raise HTTPException(status_code=404, detail=f"Task {task_uuid} not found")

    task_info = task_storage[task_uuid]
    if task_info["status"] == "failed":
        logger.error(f"Task {task_uuid}: Task failed: {task_info.get('error')}")
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
    if "plan_response" not in task_info or task_info["plan_response"] is None:
        logger.error(
            f"Task {task_uuid}: Task does not contain a plan response or the plan response is None."
        )
        raise HTTPException(
            status_code=400,
            detail=f"Task {task_uuid} does not contain a plan response or the plan response is None.",
        )

    try:
        return task_info["plan_response"]
    except Exception as e:
        logger.error(
            f"Task {task_uuid}: Error returning plan response: {str(e)}", exc_info=True
        )
        raise HTTPException(status_code=500, detail="Error returning plan response.")


@router.post("/v1/translate_plan", response_model=StartTaskResponse)
@limiter.limit("10/minute")
async def translate_plan(
    request: Request,
    req: TranslatePlanRequest,
):
    """
    Translate a plan from one language into another language.

    **Args**:

    - **inputPlan**: The plan to translate.
      It is a `PlanResponse` object like the one returned by the `get_plan` endpoint.

    - **inputLanguage** (`str`): The input language of the plan response (ISO 639-1 code).

    - **outputLanguage** (`str`): The output language to translate the plan into (ISO 639-1 code).

    **Notes**:
    - Both `inputLanguage` and `outputLanguage` must be valid [ISO 639-1 codes](https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes).
    """
    task_uuid = str(uuid.uuid4())

    # Log the plan translation request
    logger.info(f"Task {task_uuid}: Received plan translation request")
    try:
        body_json = json.dumps(jsonable_encoder(req), ensure_ascii=False)
        logger.info(f"Task {task_uuid}: Request body: {body_json}")
    except Exception:
        logger.exception(
            f"Task {task_uuid}: Failed to serialize request body for logging"
        )

    # Initialize task status
    task_storage[task_uuid] = {
        "status": "pending",
        "created_at": datetime.now().isoformat(),
    }

    # Create background task input
    background_task_input = {
        "inputPlan": req.inputPlan,
        "inputLanguage": req.inputLanguage,
        "outputLanguage": req.outputLanguage,
    }

    try:
        thread = threading.Thread(
            target=_execute_plan_translation,
            args=(task_uuid, background_task_input),
        )
        thread.daemon = True
        thread.start()
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
            status_code=500,
            detail="Failed to start background thread for plan translation.",
        )

    return StartTaskResponse(taskId=task_uuid, status=task_storage[task_uuid]["status"])
