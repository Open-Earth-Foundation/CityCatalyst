from fastapi import HTTPException, APIRouter, Request
from fastapi.responses import FileResponse, JSONResponse
import httpx

from pydantic import BaseModel, Field
from pathlib import Path
from datetime import datetime
import time
import logging
import uuid
import threading
from typing import Dict, Any

from langchain_core.messages import AIMessage

from utils.logging_config import setup_logger
from plan_creator_bundle.plan_creator_legacy.graph_definition import create_graph
from plan_creator_bundle.plan_creator_legacy.state.agent_state import AgentState
from limiter import limiter
from plan_creator_bundle.plan_creator_legacy.tasks import _execute_plan_creation
from plan_creator_bundle.plan_creator_legacy.task_storage import task_storage
from plan_creator_bundle.plan_creator_legacy.utils import (
    get_city_by_name,
    output_dir,
)

# Setup logging configuration
setup_logger()
logger = logging.getLogger(__name__)

router = APIRouter()


class PlanRequest(BaseModel):
    action: Dict[str, Any] = Field(..., description="The action dictionary")
    city_name: str = Field(..., description="The actual city name and not the locode")
    language: str = "en"  # Default to English


@router.post("/start_plan_creation")
@limiter.limit("5/minute")
async def start_plan_creation(request: Request, req: PlanRequest):
    """Start asynchronous plan creation process"""
    # Generate a unique task ID
    task_uuid = str(uuid.uuid4())
    logger.info(f"Received plan creation request, assigned task ID: {task_uuid}")
    logger.info(f"City name: {req.city_name}")
    logger.info(f"Requested language: {req.language}")

    # Validate city name
    try:
        get_city_by_name(req.city_name)
    except ValueError as e:
        logger.error(f"Invalid city name: {req.city_name}")
        raise HTTPException(status_code=404, detail=str(e))

    # Initialize task status
    task_storage[task_uuid] = {
        "status": "pending",
        "created_at": datetime.now().isoformat(),
        "action_id": req.action.get("ActionID", "unknown"),
        "city_name": req.city_name,
    }

    # Start background thread for processing
    thread = threading.Thread(target=_execute_plan_creation, args=(task_uuid, req))
    thread.daemon = True
    thread.start()

    logger.info(f"Started background processing for task: {task_uuid}")

    # Return the task ID immediately
    return JSONResponse(
        status_code=202, content={"task_id": task_uuid, "status": "pending"}
    )


@router.get("/check_progress/{task_uuid}")
@limiter.limit("10/minute")
async def check_progress(request: Request, task_uuid: str):
    """Check the progress of a plan creation task"""
    logger.info(f"Checking progress for task: {task_uuid}")

    if task_uuid not in task_storage:
        logger.warning(f"Task not found: {task_uuid}")
        raise HTTPException(status_code=404, detail="Task not found")

    task_info = task_storage[task_uuid]
    logger.info(f"Task {task_uuid} status: {task_info['status']}")

    response_data = {"status": task_info["status"]}

    # Include error message if status is failed
    if task_info["status"] == "failed" and "error" in task_info:
        response_data["error"] = task_info["error"]

    return response_data


@router.get("/get_plan/{task_uuid}")
@limiter.limit("10/minute")
async def get_plan(request: Request, task_uuid: str):
    """Get the completed plan for a task"""
    logger.info(f"Retrieving plan for task: {task_uuid}")

    if task_uuid not in task_storage:
        logger.warning(f"Task not found: {task_uuid}")
        raise HTTPException(status_code=404, detail="Task not found")

    task_info = task_storage[task_uuid]

    if task_info["status"] != "completed":
        logger.warning(
            f"Task {task_uuid} is not completed yet. Current status: {task_info['status']}"
        )
        raise HTTPException(
            status_code=409,
            detail=f"Plan is not ready yet. Current status: {task_info['status']}",
        )

    output_path = Path(task_info["output_path"])
    filename = task_info["filename"]

    logger.info(f"Returning plan file for task {task_uuid}: {output_path}")

    # Return the file and then clean up the task data
    response = FileResponse(
        path=output_path, filename=filename, media_type="text/markdown"
    )

    # Clean up task data after successful retrieval
    del task_storage[task_uuid]
    logger.info(f"Task {task_uuid} data cleaned up after successful retrieval")

    return response


# Keep the old endpoint for backward compatibility
@router.post("/create_plan", deprecated=True)
@limiter.limit("1/minute")
async def create_plan(request: Request, req: PlanRequest):
    logger.warning(
        "Deprecated /create_plan endpoint called. Consider using the new asynchronous API."
    )
    start_time = time.time()
    action_id = req.action.get("ActionID", "unknown")
    logger.info(f"Starting plan creation for action ID: {action_id}")
    logger.info(f"City name: {req.city_name}")
    logger.info(f"Requested language: {req.language}")

    try:
        # Get city data
        try:
            city_data = get_city_by_name(req.city_name)
            logger.info(f"Found city data for {req.city_name}")
        except ValueError as e:
            logger.error(f"City not found: {req.city_name}")
            raise HTTPException(status_code=404, detail=str(e))

        # 1. Initialize the graph and state
        logger.info("Creating computation graph")
        graph = create_graph()
        logger.info("Graph created successfully")

        logger.info("Initializing agent state")
        initial_state = AgentState(
            climate_action_data=req.action,
            city_data=city_data,
            response_agent_1=AIMessage(""),
            response_agent_2=AIMessage(""),
            response_agent_3=AIMessage(""),
            response_agent_4=AIMessage(""),
            # response_agent_5=AIMessage(""),
            # response_agent_6=AIMessage(""),
            response_agent_7=AIMessage(""),
            response_agent_8=AIMessage(""),
            response_agent_9=AIMessage(""),
            response_agent_10=AIMessage(""),
            response_agent_combine="",
            response_agent_translate="",
            language=req.language,
            messages=[],
        )
        logger.info("Agent state initialized successfully")

        # 2. Generate the plan with timeout handling
        try:
            logger.info("Starting graph execution for plan generation")
            result = graph.invoke(input=initial_state)
            logger.info("Graph execution completed successfully")
            logger.debug(
                f"Graph execution result length: {len(result['response_agent_translate'])}"
            )
        except httpx.TimeoutException:
            logger.error("Timeout occurred during graph execution", exc_info=True)
            raise HTTPException(
                status_code=500,
                detail="Timeout while generating diagrams. Please try again.",
            )
        except Exception as e:
            logger.error(f"Other Error during graph execution: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=500, detail=f"Error during graph execution: {str(e)}"
            )
        # 3. Save the plan
        timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M")
        filename = f"{timestamp}_{action_id}_{req.city_name.replace(' ', '_')}_{req.language}_climate_action_implementation_plan.md"
        output_path = output_dir / filename

        output_dir.mkdir(parents=True, exist_ok=True)

        logger.info(f"Saving plan to file: {output_path}")
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(result["response_agent_translate"])
        logger.info("Plan file saved successfully")

        process_time = time.time() - start_time
        logger.info(f"Plan generation completed in {process_time:.2f} seconds")

        return FileResponse(
            path=output_path, filename=filename, media_type="text/markdown"
        )

    except HTTPException as he:
        logger.error(f"HTTP Exception during plan generation: {str(he)}", exc_info=True)
        raise
    except Exception as e:
        logger.error(
            f"Unexpected error during plan generation: {str(e)}", exc_info=True
        )
        raise HTTPException(status_code=500, detail=f"Error generating plan: {str(e)}")
