from pathlib import Path
import json
from datetime import datetime
import time
import logging
import uuid
import threading
from typing import Optional, List, Dict, Any

from fastapi import HTTPException, APIRouter
from fastapi.responses import FileResponse
from langchain_core.messages import AIMessage

from utils.build_city_data import build_city_data
from services.get_context import get_context
from services.get_actions import get_actions

from plan_creator.graph_definition import create_graph
from plan_creator.state.agent_state import AgentState
from plan_creator.models import (
    PlanRequest,
    StartPlanCreationResponse,
    CheckProgressResponse,
)


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


def _execute_plan_creation(task_uuid: str, background_task_input: Dict[str, Any]):
    """Background task to execute plan creation"""
    try:
        # Update status to running
        task_storage[task_uuid]["status"] = "running"
        logger.info(
            f"""Task {task_uuid}: Starting plan creation for: 
            locode {background_task_input["cityData"]["locode"]}, 
            action: {background_task_input["action"]}
            language: {background_task_input["language"]}
            """
        )

        start_time = time.time()

        # 1. Initialize the graph and state
        logger.info(f"Task {task_uuid}: Creating computation graph")
        graph = create_graph()
        logger.info(f"Task {task_uuid}: Graph created successfully")

        logger.info(f"Task {task_uuid}: Initializing agent state")
        initial_state = AgentState(
            climate_action_data=background_task_input["action"],
            city_data=background_task_input["cityData"],
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
            language=background_task_input["language"],
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
        action_id = background_task_input["action"].get("ActionID", "unknown")
        filename = f"{timestamp}_{action_id}_{background_task_input["cityData"]["locode"]}_{background_task_input["language"]}_climate_action_implementation_plan.md"
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


@router.post(
    "/v1/start_plan_creation", response_model=StartPlanCreationResponse, status_code=202
)
async def start_plan_creation(request: PlanRequest):
    """Start asynchronous plan creation process"""
    # Generate a unique task ID
    task_uuid = str(uuid.uuid4())
    logger.info(f"Received plan creation request, assigned task ID: {task_uuid}")
    logger.info(f"Locode: {request.cityData.cityContextData.locode}")
    logger.info(f"Requested language: {request.language}")

    # 1. Initialize task status
    task_storage[task_uuid] = {
        "status": "pending",
        "created_at": datetime.now().isoformat(),
        "action_id": request.actionId,
        "locode": request.cityData.cityContextData.locode,
    }

    # 2. Extract needed data from request into requestData
    requestData = {}
    # Extract city context data
    requestData["locode"] = request.cityData.cityContextData.locode
    requestData["populationSize"] = request.cityData.cityContextData.populationSize

    # Extract city emissions data
    requestData["stationaryEnergyEmissions"] = (
        request.cityData.cityEmissionsData.stationaryEnergyEmissions
    )
    requestData["transportationEmissions"] = (
        request.cityData.cityEmissionsData.transportationEmissions
    )
    requestData["wasteEmissions"] = request.cityData.cityEmissionsData.wasteEmissions
    requestData["ippuEmissions"] = request.cityData.cityEmissionsData.ippuEmissions
    requestData["afoluEmissions"] = request.cityData.cityEmissionsData.afoluEmissions

    # 3. Fetch general city context data from global API
    cityContext = get_context(requestData["locode"])
    if not cityContext:
        raise HTTPException(
            status_code=404, detail="No city context data found from global API."
        )

    # 4. Combine city context and city data
    cityData = build_city_data(cityContext, requestData)

    # 5. Fetch actions from API and filter by actionId
    actions = get_actions()
    if not actions:
        raise HTTPException(
            status_code=404, detail="No actions data found from global API."
        )

    action = None
    for item in actions:
        if item["ActionID"] == request.actionId:
            action = item
            break
    if not action:
        raise HTTPException(
            status_code=404,
            detail="Action not found within retrieved actions from global API.",
        )

    # 6. Build dictionary with data for background task
    background_task_input = {
        "cityData": cityData,
        "action": action,
        "language": request.language,
    }
    # 7. Start background thread for processing
    thread = threading.Thread(
        target=_execute_plan_creation, args=(task_uuid, background_task_input)
    )
    thread.daemon = True
    thread.start()

    logger.info(f"Started background processing for task: {task_uuid}")

    # Return the task ID immediately
    return StartPlanCreationResponse(taskId=task_uuid, status="pending")


@router.get("/v1/check_progress/{task_uuid}", response_model=CheckProgressResponse)
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

    return CheckProgressResponse(**response_data)


@router.get("/v1/get_plan/{task_uuid}")
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
    try:
        response = FileResponse(
            path=output_path, filename=filename, media_type="text/markdown"
        )
        return response
    finally:
        # Clean up task data after attempt to return the file,
        # even if an error occurred (e.g., file not found, disk error, etc.)
        del task_storage[task_uuid]
        logger.info(f"Task {task_uuid} data cleaned up after retrieval attempt")
