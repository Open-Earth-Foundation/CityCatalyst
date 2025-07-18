from fastapi import APIRouter, HTTPException, Request
from datetime import datetime
import uuid
import threading

import logging
from utils.logging_config import setup_logger
from prioritizer.models import (
    PrioritizerRequest,
    PrioritizerResponse,
    CheckProgressResponse,
    StartPrioritizationResponse,
    PrioritizerRequestBulk,
    PrioritizerResponseBulk,
)
from prioritizer.tasks import (
    _execute_prioritization,
    _execute_prioritization_bulk_subtask,
)
from prioritizer.task_storage import task_storage
from limiter import limiter

# Setup logging configuration
setup_logger()
logger = logging.getLogger(__name__)

router = APIRouter()

# List of languages to generate explanations for
LANGUAGES = ["en", "es", "pt"]


@router.post(
    "/v1/start_prioritization",
    response_model=StartPrioritizationResponse,
    status_code=202,
)
@limiter.limit("5/minute")
async def start_prioritization(request: Request, req: PrioritizerRequest):
    task_uuid = str(uuid.uuid4())
    logger.info(f"Task {task_uuid}: Received prioritization request")
    logger.info(f"Task {task_uuid}: Locode: {req.cityData.cityContextData.locode}")
    task_storage[task_uuid] = {
        "status": "pending",
        "created_at": datetime.now().isoformat(),
        "locode": req.cityData.cityContextData.locode,
    }
    background_task_input = {
        "cityData": req.cityData,
        "prioritizationType": req.prioritizationType,
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


@router.post(
    "/v1/start_prioritization_bulk",
    response_model=StartPrioritizationResponse,
    status_code=202,
)
@limiter.limit("5/minute")
async def start_prioritization_bulk(request: Request, req: PrioritizerRequestBulk):
    main_task_id = str(uuid.uuid4())
    subtasks = []
    for city_data in req.cityDataList:
        subtasks.append(
            {
                "locode": city_data.cityContextData.locode,
                "status": "pending",
                "result": None,
                "error": None,
            }
        )
    task_storage[main_task_id] = {
        "status": "pending",
        "created_at": datetime.now().isoformat(),
        "subtasks": subtasks,
        "prioritizer_response_bulk": None,
        "error": None,
    }
    for idx, city_data in enumerate(req.cityDataList):
        thread = threading.Thread(
            target=_execute_prioritization_bulk_subtask,
            args=(main_task_id, idx, city_data, req.prioritizationType),
        )
        thread.daemon = True
        thread.start()
    return StartPrioritizationResponse(
        taskId=main_task_id, status=task_storage[main_task_id]["status"]
    )


@router.get(
    "/v1/check_prioritization_progress/{task_uuid}",
    response_model=CheckProgressResponse,
)
@limiter.limit("10/minute")
async def check_prioritization_progress(request: Request, task_uuid: str):
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
@limiter.limit("10/minute")
async def get_prioritization(request: Request, task_uuid: str):
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
    if "prioritizer_response" not in task_info:
        logger.error(
            f"Task {task_uuid}: Attempted to fetch single prioritization for a bulk task"
        )
        raise HTTPException(
            status_code=400,
            detail=f"Task {task_uuid} is a bulk prioritization task. Use the bulk endpoint to retrieve results.",
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


@router.get(
    "/v1/get_prioritization_bulk/{task_uuid}", response_model=PrioritizerResponseBulk
)
@limiter.limit("10/minute")
async def get_prioritization_bulk(request: Request, task_uuid: str):
    logger.info(f"Task {task_uuid}: Retrieving bulk prioritization result")
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
    if "prioritizer_response_bulk" not in task_info:
        logger.error(
            f"Task {task_uuid}: Attempted to fetch bulk prioritization for a single task"
        )
        raise HTTPException(
            status_code=400,
            detail=f"Task {task_uuid} is a single prioritization task. Use the single endpoint to retrieve results.",
        )
    try:
        return task_info["prioritizer_response_bulk"]
    except Exception as e:
        logger.error(
            f"Task {task_uuid}: Error returning bulk prioritization response: {str(e)}",
            exc_info=True,
        )
        raise HTTPException(
            status_code=500, detail="Error returning bulk prioritization response."
        )
