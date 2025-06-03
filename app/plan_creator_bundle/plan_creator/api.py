from datetime import datetime, UTC
import time
import uuid
import threading
from typing import Dict, Any

from fastapi import HTTPException, APIRouter

import logging
from utils.logging_config import setup_logger

from utils.build_city_data import build_city_data
from services.get_context import get_context
from services.get_actions import get_actions

from plan_creator_bundle.plan_creator.graph_definition import create_graph
from plan_creator_bundle.plan_creator.state.agent_state import AgentState
from plan_creator_bundle.plan_creator.models import (
    PlanRequest,
    StartPlanCreationResponse,
    CheckProgressResponse,
    PlanResponse,
    Introduction,
    SubactionList,
    InstitutionList,
    MilestoneList,
    MerIndicatorList,
    MitigationList,
    AdaptationList,
    SDGList,
    Timeline,
    CostBudget,
    PlanCreatorMetadata,
    PlanContent,
)

setup_logger()
logger = logging.getLogger(__name__)

router = APIRouter()


# Storage for task status and results
task_storage = {}


def _execute_plan_creation(task_uuid: str, background_task_input: Dict[str, Any]):
    """Background task to execute plan creation"""
    try:
        # Update status to running
        task_storage[task_uuid]["status"] = "running"
        logger.info(
            f"Task {task_uuid}: Starting plan creation for locode={background_task_input['cityData']['locode']} action={background_task_input['action']['ActionID']} language={background_task_input['language']}"
        )

        start_time = time.time()
        logger.debug(
            f"Task {task_uuid}: Initializing computation graph and agent state"
        )
        graph = create_graph()
        initial_state: AgentState = {
            "climate_action_data": background_task_input["action"],
            "city_data": background_task_input["cityData"],
            "response_agent_1": Introduction(title="", description=""),
            "response_agent_2": SubactionList(subactions=[]),
            "response_agent_3": InstitutionList(institutions=[]),
            "response_agent_4": MilestoneList(milestones=[]),
            "response_agent_5": Timeline(),
            "response_agent_6": CostBudget(),
            "response_agent_7": MerIndicatorList(merIndicators=[]),
            "response_agent_8": MitigationList(mitigations=[]),
            "response_agent_9": AdaptationList(adaptations=[]),
            "response_agent_10": SDGList(sdgs=[]),
            "response_agent_translate": {},
            "language": background_task_input["language"],
            "messages": [],
        }

        # 2. Generate the plan
        try:
            logger.info(f"Task {task_uuid}: Executing graph for plan generation")
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

        # 3. Parse the plan result into PlanResponse
        try:
            # Step 1: Create metadata
            metadata = PlanCreatorMetadata(
                locode=result["city_data"]["locode"],
                cityName=result["city_data"]["name"],
                actionId=result["climate_action_data"]["ActionID"],
                actionName=result["climate_action_data"]["ActionName"],
                createdAt=datetime.now(UTC),
            )

            # Step 2: Create PlanContent
            translated = result["response_agent_translate"]
            content = PlanContent(
                introduction=Introduction.model_validate(
                    translated["response_agent_1"]
                ),
                subactions=SubactionList.model_validate(translated["response_agent_2"]),
                institutions=InstitutionList.model_validate(
                    translated["response_agent_3"]
                ),
                milestones=MilestoneList.model_validate(translated["response_agent_4"]),
                timeline=[Timeline.model_validate(translated["response_agent_5"])],
                costBudget=[CostBudget.model_validate(translated["response_agent_6"])],
                merIndicators=MerIndicatorList.model_validate(
                    translated["response_agent_7"]
                ),
                mitigations=MitigationList.model_validate(
                    translated["response_agent_9"]
                ),
                adaptations=AdaptationList.model_validate(
                    translated["response_agent_8"]
                ),
                sdgs=SDGList.model_validate(translated["response_agent_10"]),
            )

            # Step 3: Wrap in PlanResponse
            plan_response = PlanResponse(
                metadata=metadata, content={result["language"]: content}
            )

        except Exception as e:
            logger.error(
                f"Task {task_uuid}: Error parsing plan response: {str(e)}",
                exc_info=True,
            )
            task_storage[task_uuid]["status"] = "failed"
            task_storage[task_uuid]["error"] = f"Error parsing plan response: {str(e)}"
            return

        # Store the result
        task_storage[task_uuid]["status"] = "completed"
        task_storage[task_uuid]["plan_response"] = plan_response

        process_time = time.time() - start_time
        logger.info(
            f"Task {task_uuid}: Plan generation completed in {process_time:.2f}s"
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
    logger.info(f"Task {task_uuid}: Received plan creation request")
    logger.info(f"Task {task_uuid}: Locode: {request.cityData.cityContextData.locode}")
    logger.info(f"Task {task_uuid}: Requested language: {request.language}")

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
        logger.error(
            f"Task {task_uuid}: No city context data found from global API.",
            exc_info=True,
        )
        raise HTTPException(
            status_code=404, detail="No city context data found from global API."
        )

    # 4. Combine city context and city data
    cityData = build_city_data(cityContext, requestData)

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
        if item["ActionID"] == request.actionId:
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
        "cityData": cityData,
        "action": action,
        "language": request.language,
    }
    # 7. Start background thread for processing
    try:
        thread = threading.Thread(
            target=_execute_plan_creation, args=(task_uuid, background_task_input)
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
async def check_progress(task_uuid: str):
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
async def get_plan(task_uuid: str):
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
