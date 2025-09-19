import time
from datetime import datetime
import logging
from pathlib import Path
from plan_creator_bundle.plan_creator_legacy.graph_definition import create_graph
from plan_creator_bundle.plan_creator_legacy.state.agent_state import AgentState
from fastapi.responses import FileResponse
from plan_creator_bundle.plan_creator_legacy.utils import get_city_by_name, output_dir
from langchain_core.messages import AIMessage
from plan_creator_bundle.plan_creator_legacy.task_storage import task_storage


def _execute_plan_creation(task_uuid: str, request):
    """Background task to execute plan creation"""
    try:
        # Update status to running
        task_storage[task_uuid]["status"] = "running"
        logger = logging.getLogger(__name__)
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
        logger = logging.getLogger(__name__)
        logger.error(
            f"Task {task_uuid}: Unexpected error during plan generation: {str(e)}",
            exc_info=True,
        )
        task_storage[task_uuid]["status"] = "failed"
        task_storage[task_uuid]["error"] = f"Error generating plan: {str(e)}"
