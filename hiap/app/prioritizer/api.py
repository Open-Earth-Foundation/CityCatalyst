from fastapi import APIRouter, HTTPException, Request
from datetime import datetime
import uuid
import threading
import os
import multiprocessing
from concurrent.futures import (
    ProcessPoolExecutor,
)
from typing import Any, Dict, List, Optional

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


# Track per-bulk run executors and futures so we can cancel on failure
_bulk_runs: Dict[str, Dict[str, Any]] = {}


def _cancel_bulk_task(task_id: str, reason: Optional[str] = None):
    run = _bulk_runs.get(task_id)
    if not run:
        return
    # Mark run as cancelled to avoid repeated shutdowns
    run["cancelled"] = True
    # Log once
    try:
        if not run.get("cancel_log_emitted"):
            logger.warning(
                f"Task {task_id}: Bulk cancellation triggered — pending subtasks are cancelled and running workers are being terminated. In-flight tasks may fail shortly with 'Bulk cancelled'."
            )
            run["cancel_log_emitted"] = True
    except Exception:
        pass
    # Set top-level failed status and a single error message once
    try:
        ts = task_storage.get(task_id, {})
        if ts is not None:
            task_storage[task_id]["status"] = "failed"
            if not task_storage[task_id].get("error"):
                if reason:
                    task_storage[task_id][
                        "error"
                    ] = f"Bulk cancelled due to subtask failure: {reason}"
                else:
                    task_storage[task_id][
                        "error"
                    ] = "Bulk cancelled: one subtask failed; remaining tasks were terminated."
    except Exception:
        pass
    # Mark all non-final subtasks as failed due to bulk cancellation
    try:
        subtasks = task_storage.get(task_id, {}).get("subtasks", [])
        for s in subtasks:
            status = s.get("status")
            if status not in ("completed", "failed"):
                s["status"] = "failed"
                s["error"] = "Bulk cancelled"
        # Do not overwrite top-level error here; updater will respect if already set
        try:
            _update_bulk_task_status(task_id)
        except Exception:
            pass
    except Exception:
        pass
    # Best-effort cancel pending futures
    try:
        for f in run.get("futures", []):
            try:
                f.cancel()
            except Exception:
                pass
    except Exception:
        pass
    # Force-terminate running worker processes owned by this bulk executor
    try:
        ex = run.get("executor")
        procs = getattr(ex, "_processes", {}) or {}
        for p in list(procs.values()):
            try:
                if p.is_alive():
                    p.terminate()
            except Exception:
                pass
    except Exception:
        pass
    # Ensure the executor is shut down with cancel_futures
    try:
        run.get("executor").shutdown(wait=False, cancel_futures=True)
    except Exception:
        pass


def _cleanup_bulk_run(task_id: str):
    run = _bulk_runs.pop(task_id, None)
    if not run:
        return
    try:
        run.get("executor").shutdown(wait=False, cancel_futures=True)
    except Exception:
        pass


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
    summary="Start single-city prioritization job",
    description=(
        "Enqueue a background job to compute mitigation/adaptation prioritization for a single city.\n\n"
        "Behavior:\n"
        "- Returns 202 with a taskId immediately; use GET endpoints to poll and fetch results.\n"
        "- Reads latest actions from Global API once per request.\n\n"
        "Possible errors:\n"
        "- 500 if background thread fails to start.\n"
        "- 202 + status=failed if actions cannot be loaded."
    ),
    responses={
        202: {"description": "Task accepted (pending or running)."},
        500: {"description": "Background thread failed to start."},
    },
)
@limiter.limit("10/minute")
async def start_prioritization(request: Request, req: PrioritizerRequest):
    """Submit a single-city prioritization task and return its `taskId`."""
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
        # Reflect running state immediately for progress polling
        try:
            task_storage[task_uuid]["status"] = "running"
        except Exception:
            pass
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
    summary="Start bulk prioritization job for multiple cities",
    description=(
        "Enqueue a bulk job that processes multiple cities in parallel.\n\n"
        "Behavior:\n"
        "- Returns 202 with a taskId immediately; use GET endpoints to poll and fetch results.\n"
        "- Creates a dedicated process pool per bulk request.\n"
        "- If any city fails, pending and running subtasks are cancelled/terminated, and the bulk task is marked failed.\n\n"
        "Possible errors:\n"
        "- 202 + status=failed if actions cannot be loaded.\n"
        "- Bulk may fail due to missing CCRA/context or internal errors; the final error contains the root-cause message."
    ),
    responses={
        202: {"description": "Bulk task accepted (pending or running)."},
    },
)
@limiter.limit("10/minute")
async def start_prioritization_bulk(request: Request, req: PrioritizerRequestBulk):
    """Submit a bulk prioritization task and return its `taskId`."""
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

    # Use a dedicated executor per bulk run so we can cancel all work on failure
    executor = ProcessPoolExecutor(
        max_workers=_default_workers, mp_context=multiprocessing.get_context("spawn")
    )
    _bulk_runs[main_task_id] = {"executor": executor, "futures": [], "cancelled": False}
    # Reflect running state immediately for progress polling
    try:
        task_storage[main_task_id]["status"] = "running"
    except Exception:
        pass

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
            _compute_prioritization_bulk_subtask,
            background_task_input,
            main_task_id,
            idx,
        )
        try:
            _bulk_runs[main_task_id]["futures"].append(future)
        except Exception:
            pass

        def _make_callback(task_id: str, sub_idx: int):
            def _callback(f):
                # If already cancelled, skip per-future handling to avoid duplicates
                try:
                    if _bulk_runs.get(task_id, {}).get("cancelled"):
                        return
                except Exception:
                    pass
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
                        # Cancel remaining work on first failure, propagate root cause
                        _cancel_bulk_task(task_id, result.get("error"))
                except Exception as e:
                    task_storage[task_id]["subtasks"][sub_idx]["status"] = "failed"
                    task_storage[task_id]["subtasks"][sub_idx]["error"] = str(e)
                    # Cancel remaining work on first failure, propagate root cause
                    _cancel_bulk_task(task_id, str(e))
                finally:
                    try:
                        _update_bulk_task_status(task_id)
                    except Exception:
                        pass
                    # If bulk is now terminal, cleanup executor
                    try:
                        status = task_storage.get(task_id, {}).get("status")
                        if status in ("completed", "failed"):
                            _cleanup_bulk_run(task_id)
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
    summary="Check task progress (single or bulk)",
    description=(
        "Check the current status of a prioritization task (single or bulk).\n\n"
        "Statuses: pending, running, completed, failed.\n"
        "If failed, the response includes an error message."
    ),
    responses={
        200: {"description": "Progress returned (may include error if failed)."},
        404: {"description": "Task not found."},
    },
)
@limiter.limit("10/minute")
async def check_prioritization_progress(request: Request, task_uuid: str):
    """Return the current status of the requested task."""
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
    summary="Get single-city prioritization result",
    description=(
        "Return the computed prioritization for a single-city task.\n\n"
        "Errors:\n"
        "- 404 if task not found.\n"
        "- 409 if not completed yet.\n"
        "- 500 if the task failed.\n"
        "- 400 if the task is actually a bulk task."
    ),
    responses={
        200: {"description": "Prioritizer response returned."},
        400: {"description": "Task is bulk; use bulk GET endpoint."},
        404: {"description": "Task not found."},
        409: {"description": "Task not completed yet."},
        500: {"description": "Task failed."},
    },
)
@limiter.limit("10/minute")
async def get_prioritization(request: Request, task_uuid: str):
    """Return the prioritization result for a completed single-city task."""
    logger.info(f"Task {task_uuid}: Retrieving prioritization result")
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
    summary="Get bulk prioritization results",
    description=(
        "Return aggregated results for a completed bulk task.\n\n"
        "Errors:\n"
        "- 404 if task not found.\n"
        "- 409 if not completed yet.\n"
        "- 500 if the bulk task failed (message contains root cause).\n"
        "- 400 if the task is actually a single task."
    ),
    responses={
        200: {"description": "Bulk prioritizer responses returned."},
        400: {"description": "Task is single; use single GET endpoint."},
        404: {"description": "Task not found."},
        409: {"description": "Task not completed yet."},
        500: {"description": "Task failed."},
    },
)
@limiter.limit("10/minute")
async def get_prioritization_bulk(request: Request, task_uuid: str):
    """Return the aggregated results for a completed bulk task."""
    logger.info(f"Task {task_uuid}: Retrieving bulk prioritization result")
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
    summary="Debug: dump task storage (non-production)",
    description="Return the full in-memory task state for debugging.",
    responses={
        200: {"description": "Task storage returned."},
        500: {"description": "Encoding error."},
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
