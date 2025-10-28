from fastapi import APIRouter, HTTPException, Request
from datetime import datetime
import uuid
import threading
import os
import multiprocessing
from concurrent.futures import (
    ProcessPoolExecutor,
)
import json

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
    _compute_prioritization_bulk_subtask,
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
logger.info(f"XGBoost threads set to {os.getenv('XGBOOST_NUM_THREADS', '1')}")
_bulk_executor = None


def _get_bulk_executor():
    global _bulk_executor
    if _bulk_executor is None:
        _bulk_executor = ProcessPoolExecutor(
            max_workers=_default_workers,
            mp_context=multiprocessing.get_context("spawn"),
        )
    return _bulk_executor


# Load actions fresh once per incoming API request.
# This intentionally avoids process-level caching to ensure upstream updates
# are reflected on every new request, while still reusing the list across
# the same request (e.g., bulk subtasks).
def _load_actions_for_request():
    """
    Fetch the latest actions from the Global API for the current request.

    Behavior:
    - Called once per API request; result is reused across that request.
    - No cross-request/process cache is kept.
    - Upstream changes are picked up on the next incoming request.
    """
    try:
        actions = get_actions()
        logger.info(f"Loaded actions: {len(actions) if actions else 0} items")
        return actions
    except Exception as e:
        logger.error(f"Failed to load actions: {str(e)}", exc_info=True)
        return None


@router.post(
    "/v1/start_prioritization",
    response_model=StartPrioritizationResponse,
    status_code=202,
    summary="Start single prioritization (asynchronous)",
    description=(
        "Starts a single prioritization job and returns a task identifier. "
        "Use the progress and result endpoints to poll for completion. "
        "If upstream actions are unavailable, the task is created in a failed state and still returned as 202."
    ),
    responses={
        202: {
            "description": "Accepted. Task created. Response contains taskId and initial status.",
        },
        422: {"description": "Validation error"},
        429: {"description": "Too Many Requests (rate limited)"},
        500: {
            "description": "Internal Server Error (failed to start background processing)"
        },
    },
)
@limiter.limit("10/minute")
async def start_prioritization(request: Request, req: PrioritizerRequest):
    task_uuid = str(uuid.uuid4())

    # Log the request
    logger.info(f"Task {task_uuid}: Received prioritization request")
    try:
        body_json = json.dumps(jsonable_encoder(req), ensure_ascii=False)
        logger.info(f"Task {task_uuid}: Request body: {body_json}")
    except Exception:
        logger.exception(
            f"Task {task_uuid}: Failed to serialize request body for logging"
        )

    # Log the request to the task storage
    task_storage[task_uuid] = {
        "status": "pending",
        "created_at": datetime.now().isoformat(),
        "locode": req.cityData.cityContextData.locode,
    }

    actions_cached = _load_actions_for_request()
    # Fail early if actions could not be loaded
    if not actions_cached:
        logger.error(
            f"Task {task_uuid}: No actions data available from global API; failing request early"
        )
        task_storage[task_uuid] = {
            "status": "failed",
            "error": "No actions data available from global API. Please try again later.",
        }
        return StartPrioritizationResponse(
            taskId=task_uuid, status=task_storage[task_uuid]["status"]
        )

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
    summary="Start bulk prioritization (asynchronous)",
    description=(
        "Starts a bulk prioritization job for multiple cities and returns a task identifier. "
        "Each city runs as a subtask. Use the bulk result endpoint to retrieve the aggregated outcome. "
        "If upstream actions are unavailable, the task is created in a failed state and still returned as 202."
    ),
    responses={
        202: {
            "description": "Accepted. Bulk task created. Response contains taskId and initial status.",
        },
        422: {"description": "Validation error"},
        429: {"description": "Too Many Requests (rate limited)"},
        500: {"description": "Internal Server Error"},
    },
)
@limiter.limit("10/minute")
async def start_prioritization_bulk(request: Request, req: PrioritizerRequestBulk):
    main_task_id = str(uuid.uuid4())

    # Log the request
    logger.info(f"Task {main_task_id}: Received bulk prioritization request")
    try:
        body_json = json.dumps(jsonable_encoder(req), ensure_ascii=False)
        logger.info(f"Task {main_task_id}: Request body: {body_json}")
    except Exception:
        logger.exception(
            f"Task {main_task_id}: Failed to serialize request body for logging"
        )

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

    actions_cached = _load_actions_for_request()
    # Fail early if actions could not be loaded
    if not actions_cached:
        logger.error(
            f"Task {main_task_id}: No actions data available from global API; failing request early"
        )
        task_storage[main_task_id] = {
            "status": "failed",
            "error": "No actions data available from global API. Please try again later.",
        }
        return StartPrioritizationResponse(
            taskId=main_task_id, status=task_storage[main_task_id]["status"]
        )

    executor = _get_bulk_executor()

    # Per-subtask timeout (seconds), default 5 minutes; configurable via env
    try:
        timeout_seconds = int(os.getenv("SUBTASK_TIMEOUT_SECONDS", "300"))
    except Exception:
        timeout_seconds = 300

    # Timeout handler
    def _on_subtask_timeout(task_id: str, sub_idx: int, f):
        try:
            if f.done():
                return
            # Mark subtask as failed due to timeout
            try:
                task_storage[task_id]["subtasks"][sub_idx]["status"] = "failed"
                task_storage[task_id]["subtasks"][sub_idx]["error"] = "timeout"
                # Flag to let callback ignore late results
                task_storage[task_id]["subtasks"][sub_idx]["timed_out"] = True
            except Exception:
                pass
            try:
                # Best-effort cancel (no effect if already running)
                f.cancel()
            except Exception:
                pass
            try:
                _update_bulk_task_status(task_id)
            except Exception:
                pass
        except Exception:
            pass

    # Submit only up to available workers; schedule next city when one finishes
    total = len(req.cityDataList)
    max_inflight = min(_default_workers, total)
    submit_lock = threading.Lock()
    state = {"next_idx": max_inflight}

    def _submit_city(sub_idx: int):
        city_data = req.cityDataList[sub_idx]
        try:
            task_storage[main_task_id]["subtasks"][sub_idx]["status"] = "running"
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
            _compute_prioritization_bulk_subtask,
            background_task_input,
            main_task_id,
            sub_idx,
        )

        def _make_callback(task_id: str, sub_idx_inner: int, timer: threading.Timer):
            def _callback(f):
                try:
                    # Cancel timeout timer on completion
                    try:
                        timer.cancel()
                    except Exception:
                        pass

                    # If already timed out, ignore late result
                    try:
                        if task_storage[task_id]["subtasks"][sub_idx_inner].get(
                            "timed_out"
                        ):
                            pass
                        else:
                            result = f.result()
                            if result.get("status") == "completed":
                                task_storage[task_id]["subtasks"][sub_idx_inner][
                                    "status"
                                ] = "completed"
                                task_storage[task_id]["subtasks"][sub_idx_inner]["result"] = PrioritizerResponse(**result["result"])  # type: ignore
                            else:
                                task_storage[task_id]["subtasks"][sub_idx_inner][
                                    "status"
                                ] = "failed"
                                task_storage[task_id]["subtasks"][sub_idx_inner][
                                    "error"
                                ] = result.get("error")
                    except Exception as e:
                        task_storage[task_id]["subtasks"][sub_idx_inner][
                            "status"
                        ] = "failed"
                        task_storage[task_id]["subtasks"][sub_idx_inner]["error"] = str(
                            e
                        )
                finally:
                    try:
                        _update_bulk_task_status(task_id)
                    except Exception:
                        pass
                    # Schedule next city, keeping inflight <= max_inflight
                    try:
                        with submit_lock:
                            ni = state["next_idx"]
                            if ni < total:
                                state["next_idx"] = ni + 1
                                _submit_city(ni)
                    except Exception:
                        pass

            return _callback

        # Start watchdog timer per subtask
        timer = threading.Timer(
            timeout_seconds, _on_subtask_timeout, args=(main_task_id, sub_idx, future)
        )
        timer.daemon = True
        timer.start()

        future.add_done_callback(_make_callback(main_task_id, sub_idx, timer))

    # Prime the pool with up to max_inflight tasks
    for i in range(max_inflight):
        _submit_city(i)

    return StartPrioritizationResponse(
        taskId=main_task_id, status=task_storage[main_task_id]["status"]
    )


@router.get(
    "/v1/check_prioritization_progress/{task_uuid}",
    response_model=CheckProgressResponse,
    summary="Check prioritization task progress",
    description=(
        "Returns the current status of a prioritization task. "
        "If the task has failed, an error message is included in the payload."
    ),
    responses={
        200: {
            "description": "OK. Status returned (pending, running, completed, or failed)."
        },
        404: {"description": "Task not found"},
        422: {"description": "Validation error"},
        429: {"description": "Too Many Requests (rate limited)"},
    },
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


@router.get(
    "/v1/get_prioritization/{task_uuid}",
    response_model=PrioritizerResponse,
    summary="Get single prioritization result",
    description=(
        "Returns the computed prioritization for a single task once completed. "
        "Use the progress endpoint to check readiness."
    ),
    responses={
        200: {"description": "OK. Prioritization result returned."},
        400: {
            "description": "Bad Request. Task is a bulk task; use bulk result endpoint instead."
        },
        404: {"description": "Task not found"},
        409: {"description": "Conflict. Task not completed yet."},
        422: {"description": "Validation error"},
        429: {"description": "Too Many Requests (rate limited)"},
        500: {"description": "Internal Server Error. Task failed during processing."},
    },
)
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
    "/v1/get_prioritization_bulk/{task_uuid}",
    response_model=PrioritizerResponseBulk,
    summary="Get bulk prioritization result",
    description=(
        "Returns the aggregated prioritization results for a bulk task once completed. "
        "Use the progress endpoint to check readiness."
    ),
    responses={
        200: {"description": "OK. Bulk prioritization result returned."},
        400: {
            "description": "Bad Request. Task is a single task; use single result endpoint instead."
        },
        404: {"description": "Task not found"},
        409: {"description": "Conflict. Task not completed yet."},
        422: {"description": "Validation error"},
        429: {"description": "Too Many Requests (rate limited)"},
        500: {"description": "Internal Server Error. Task failed during processing."},
    },
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


@router.get(
    "/v1/debug/tasks",
    summary="Debug: list all tasks",
    description="Returns the full in-memory task store for debugging.",
    responses={
        200: {"description": "OK. Full task store returned."},
        422: {"description": "Validation error"},
        429: {"description": "Too Many Requests (rate limited)"},
        500: {"description": "Internal Server Error"},
    },
)
@limiter.limit("30/minute")
async def debug_list_tasks(request: Request):
    """Return the full task_storage for debugging (json-encoded)."""
    try:
        return jsonable_encoder(task_storage)
    except Exception as e:
        logger.error(f"Error encoding task storage: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error encoding task storage")
