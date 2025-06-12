from fastapi import HTTPException, APIRouter
from fastapi.responses import FileResponse, JSONResponse
import httpx

# from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pathlib import Path
import json
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

# Setup logging configuration
setup_logger()
logger = logging.getLogger(__name__)

router = APIRouter()

# Define output directory
output_dir = Path(__file__).parent / "data" / "output"
logger.info(f"Output directory set to: {output_dir}")

# Define city data path
city_data_path = Path(__file__).parent / "data" / "city_data.json"
logger.info(f"City data path set to: {city_data_path}")

# Storage for task status and results
task_storage = {}


class PlanRequest(BaseModel):
    action: Dict[str, Any] = Field(..., description="The action dictionary")
    city_name: str = Field(..., description="The actual city name and not the locode")
    language: str = "en"  # Default to English


def load_city_data():
    """Load city data from JSON file."""
    try:
        logger.info(f"Loading city data from {city_data_path}")
        with open(city_data_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error loading city data: {str(e)}", exc_info=True)
        raise


def get_city_by_name(city_name: str) -> Dict[str, Any]:
    """Get city data by name."""
    city_data = load_city_data()

    # Case-insensitive search
    city_name_lower = city_name.lower()

    for city in city_data:
        if city["name"].lower() == city_name_lower:
            logger.info(f"Found city data for: {city['name']}")
            return city

    logger.error(f"City not found: {city_name}")
    raise ValueError(f"City not found: {city_name}")


def _execute_plan_creation(task_uuid: str, request: PlanRequest):
    """Background task to execute plan creation"""
    try:
        # Update status to running
        task_storage[task_uuid]["status"] = "running"
        logger.info(
            f"Task {task_uuid}: Starting plan creation for action ID: {request.action.get('ActionID', 'unknown')}"
        )
        logger.info(
            f"Task {task_uuid}: City name: {request.city_name}, Requested language: {request.language}"
        )

        start_time = time.time()

        # Get city data
        try:
            city_data = get_city_by_name(request.city_name)
            logger.info(f"Task {task_uuid}: Found city data for {request.city_name}")
        except ValueError as e:
            logger.error(f"Task {task_uuid}: {str(e)}")
            task_storage[task_uuid]["status"] = "failed"
            task_storage[task_uuid]["error"] = str(e)
            return

        # 1. Initialize the graph and state
        logger.info(f"Task {task_uuid}: Creating computation graph")
        graph = create_graph()
        logger.info(f"Task {task_uuid}: Graph created successfully")

        logger.info(f"Task {task_uuid}: Initializing agent state")
        initial_state = AgentState(
            climate_action_data=request.action,
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
            language=request.language,
            messages=[],
        )
        logger.info(f"Task {task_uuid}: Agent state initialized successfully")

        # 2. Generate the plan
        try:
            logger.info(
                f"Task {task_uuid}: Starting graph execution for plan generation"
            )
            result = graph.invoke(input=initial_state)
            logger.info(f"Task {task_uuid}: Graph execution completed successfully")
        except Exception as e:
            logger.error(
                f"Task {task_uuid}: Error during graph execution: {str(e)}",
                exc_info=True,
            )
            task_storage[task_uuid]["status"] = "failed"
            task_storage[task_uuid]["error"] = f"Error during graph execution: {str(e)}"
            return

        # 3. Save the plan
        timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M")
        action_id = request.action.get("ActionID", "unknown")
        filename = f"{timestamp}_{action_id}_{request.city_name.replace(' ', '_')}_{request.language}_climate_action_implementation_plan.md"
        output_path = output_dir / filename
        output_dir.mkdir(parents=True, exist_ok=True)

        logger.info(f"Task {task_uuid}: Saving plan to file: {output_path}")
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(result["response_agent_translate"])
        logger.info(f"Task {task_uuid}: Plan file saved successfully")

        # Store the result
        task_storage[task_uuid]["status"] = "completed"
        task_storage[task_uuid]["filename"] = filename
        task_storage[task_uuid]["output_path"] = str(output_path)

        process_time = time.time() - start_time
        logger.info(
            f"Task {task_uuid}: Plan generation completed in {process_time:.2f} seconds"
        )

    except Exception as e:
        logger.error(
            f"Task {task_uuid}: Unexpected error during plan generation: {str(e)}",
            exc_info=True,
        )
        task_storage[task_uuid]["status"] = "failed"
        task_storage[task_uuid]["error"] = f"Error generating plan: {str(e)}"


@router.post("/start_plan_creation", deprecated=True)
async def start_plan_creation(request: PlanRequest):
    """Start asynchronous plan creation process"""
    # Generate a unique task ID
    task_uuid = str(uuid.uuid4())
    logger.info(f"Received plan creation request, assigned task ID: {task_uuid}")
    logger.info(f"City name: {request.city_name}")
    logger.info(f"Requested language: {request.language}")

    # Validate city name
    try:
        get_city_by_name(request.city_name)
    except ValueError as e:
        logger.error(f"Invalid city name: {request.city_name}")
        raise HTTPException(status_code=404, detail=str(e))

    # Initialize task status
    task_storage[task_uuid] = {
        "status": "pending",
        "created_at": datetime.now().isoformat(),
        "action_id": request.action.get("ActionID", "unknown"),
        "city_name": request.city_name,
    }

    # Start background thread for processing
    thread = threading.Thread(target=_execute_plan_creation, args=(task_uuid, request))
    thread.daemon = True
    thread.start()

    logger.info(f"Started background processing for task: {task_uuid}")

    # Return the task ID immediately
    return JSONResponse(
        status_code=202, content={"task_id": task_uuid, "status": "pending"}
    )


@router.get("/check_progress/{task_uuid}", deprecated=True)
async def check_progress(task_uuid: str):
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


@router.get("/get_plan/{task_uuid}", deprecated=True)
async def get_plan(task_uuid: str):
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
async def create_plan(request: PlanRequest):
    logger.warning(
        "Deprecated /create_plan endpoint called. Consider using the new asynchronous API."
    )
    start_time = time.time()
    action_id = request.action.get("ActionID", "unknown")
    logger.info(f"Starting plan creation for action ID: {action_id}")
    logger.info(f"City name: {request.city_name}")
    logger.info(f"Requested language: {request.language}")

    try:
        # Get city data
        try:
            city_data = get_city_by_name(request.city_name)
            logger.info(f"Found city data for {request.city_name}")
        except ValueError as e:
            logger.error(f"City not found: {request.city_name}")
            raise HTTPException(status_code=404, detail=str(e))

        # 1. Initialize the graph and state
        logger.info("Creating computation graph")
        graph = create_graph()
        logger.info("Graph created successfully")

        logger.info("Initializing agent state")
        initial_state = AgentState(
            climate_action_data=request.action,
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
            language=request.language,
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
        filename = f"{timestamp}_{action_id}_{request.city_name.replace(' ', '_')}_{request.language}_climate_action_implementation_plan.md"
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
