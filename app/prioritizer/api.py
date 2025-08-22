from fastapi import APIRouter, HTTPException, Request
from datetime import datetime
import uuid
import threading
import os
import multiprocessing
from concurrent.futures import (
    ProcessPoolExecutor,
)

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
    compute_prioritization_bulk_subtask,
    _update_bulk_task_status,
)
from prioritizer.task_storage import task_storage
from limiter import limiter
from fastapi.encoders import jsonable_encoder
from services.get_actions import get_actions

# Setup logging configuration
setup_logger()
logger = logging.getLogger(__name__)

router = APIRouter()

# Global bounded process pool for bulk subtasks (lazy-init to avoid spawn recursion)
_default_workers = max(
    1, int(os.getenv("BULK_CONCURRENCY", multiprocessing.cpu_count()))
)
logger.info(f"BULK_CONCURRENCY set to {_default_workers}")
_bulk_executor = None


def _get_bulk_executor():
    global _bulk_executor
    if _bulk_executor is None:
        _bulk_executor = ProcessPoolExecutor(
            max_workers=_default_workers,
            mp_context=multiprocessing.get_context("spawn"),
        )
    return _bulk_executor


# Global actions cache loaded once per API process
_ACTIONS_CACHE = None


def _get_actions_cached():
    """
    Load actions from global api and cache them to prevent reloading them on each request
    or city subtask.
    """
    # Set to global variable because we assign a value in the function for global scope
    global _ACTIONS_CACHE
    if _ACTIONS_CACHE is None:
        try:
            _ACTIONS_CACHE = get_actions()
            logger.info(
                f"Loaded actions cache: {len(_ACTIONS_CACHE) if _ACTIONS_CACHE else 0} items"
            )
        except Exception as e:
            logger.error(f"Failed to load actions cache: {str(e)}", exc_info=True)
            _ACTIONS_CACHE = None
    return _ACTIONS_CACHE


@router.post(
    "/v1/start_prioritization",
    response_model=StartPrioritizationResponse,
    status_code=202,
)
@limiter.limit("10/minute")
async def start_prioritization(request: Request, req: PrioritizerRequest):
    task_uuid = str(uuid.uuid4())

    # Log the request
    logger.info(f"Task {task_uuid}: Received prioritization request")
    logger.info(f"Task {task_uuid}: Locode: {req.cityData.cityContextData.locode}")
    logger.info(f"Task {task_uuid}: Prioritization type: {req.prioritizationType}")
    logger.info(f"Task {task_uuid}: Languages: {req.language}")
    logger.info(f"Task {task_uuid}: Country code: {req.countryCode}")

    # Log the request to the task storage
    task_storage[task_uuid] = {
        "status": "pending",
        "created_at": datetime.now().isoformat(),
        "locode": req.cityData.cityContextData.locode,
    }

    actions_cached = _get_actions_cached()

    # Create the background task input
    background_task_input = {
        "cityData": req.cityData,
        "prioritizationType": req.prioritizationType,
        "language": req.language,
        "countryCode": req.countryCode,
        "actions": actions_cached,
    }

    # Start the background thread
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
@limiter.limit("10/minute")
async def start_prioritization_bulk(request: Request, req: PrioritizerRequestBulk):
    main_task_id = str(uuid.uuid4())

    # Log the request
    logger.info(f"Task {main_task_id}: Received bulk prioritization request")
    logger.info(
        f"Task {main_task_id}: Locode: {req.cityDataList[0].cityContextData.locode}"
    )
    logger.info(f"Task {main_task_id}: Prioritization type: {req.prioritizationType}")
    logger.info(f"Task {main_task_id}: Languages: {req.language}")
    logger.info(f"Task {main_task_id}: Country code: {req.countryCode}")

    # Log the request to the task storage
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
    executor = _get_bulk_executor()
    actions_cached = _get_actions_cached()
    for idx, city_data in enumerate(req.cityDataList):
        # mark subtask as running before submission
        try:
            task_storage[main_task_id]["subtasks"][idx]["status"] = "running"
        except Exception:
            pass
        requestData = {
            "locode": city_data.cityContextData.locode,
            "populationSize": city_data.cityContextData.populationSize,
            "stationaryEnergyEmissions": city_data.cityEmissionsData.stationaryEnergyEmissions,
            "transportationEmissions": city_data.cityEmissionsData.transportationEmissions,
            "wasteEmissions": city_data.cityEmissionsData.wasteEmissions,
            "ippuEmissions": city_data.cityEmissionsData.ippuEmissions,
            "afoluEmissions": city_data.cityEmissionsData.afoluEmissions,
        }
        background_task_input = {
            "requestData": requestData,
            "prioritizationType": (
                req.prioritizationType.value
                if hasattr(req.prioritizationType, "value")
                else req.prioritizationType
            ),
            "language": req.language,
            "countryCode": req.countryCode,
            "actions": actions_cached,
        }
        future = executor.submit(
            compute_prioritization_bulk_subtask,
            background_task_input,
        )

        def _make_callback(task_id: str, sub_idx: int):
            def _callback(f):
                try:
                    result = f.result()
                    if result.get("status") == "completed":
                        task_storage[task_id]["subtasks"][sub_idx][
                            "status"
                        ] = "completed"
                        task_storage[task_id]["subtasks"][sub_idx]["result"] = PrioritizerResponse(**result["result"])  # type: ignore
                    else:
                        task_storage[task_id]["subtasks"][sub_idx]["status"] = "failed"
                        task_storage[task_id]["subtasks"][sub_idx]["error"] = (
                            result.get("error")
                        )
                except Exception as e:
                    task_storage[task_id]["subtasks"][sub_idx]["status"] = "failed"
                    task_storage[task_id]["subtasks"][sub_idx]["error"] = str(e)
                finally:
                    try:
                        _update_bulk_task_status(task_id)
                    except Exception:
                        pass

            return _callback

        future.add_done_callback(_make_callback(main_task_id, idx))

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


@router.get("/v1/debug/tasks")
@limiter.limit("30/minute")
async def debug_list_tasks(request: Request):
    """Return the full task_storage for debugging (json-encoded)."""
    try:
        return jsonable_encoder(task_storage)
    except Exception as e:
        logger.error(f"Error encoding task storage: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error encoding task storage")
