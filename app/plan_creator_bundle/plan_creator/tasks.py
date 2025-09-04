from datetime import datetime, UTC
import time
import logging
from plan_creator_bundle.plan_creator.graph_definition import create_graph
from plan_creator_bundle.plan_creator.state.agent_state import AgentState
from plan_creator_bundle.plan_creator.models import (
    Introduction,
    SubactionList,
    InstitutionList,
    MilestoneList,
    Timeline,
    CostBudget,
    MerIndicatorList,
    MitigationList,
    AdaptationList,
    SDGList,
    PlanCreatorMetadata,
    PlanContent,
    PlanResponse,
)
from plan_creator_bundle.plan_creator.task_storage import task_storage

logger = logging.getLogger(__name__)


def _execute_plan_creation(task_uuid: str, background_task_input):
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
            "country_code": background_task_input["countryCode"],
            "climate_action_data": background_task_input["action"],
            "city_data": background_task_input["cityData"],
            "response_agent_1": Introduction(
                city_description="",
                action_description="",
                national_strategy_explanation="",
            ),
            "response_agent_2": SubactionList(items=[]),
            "response_agent_3": InstitutionList(items=[]),
            "response_agent_4": MilestoneList(items=[]),
            "response_agent_5": Timeline(),
            "response_agent_6": CostBudget(),
            "response_agent_7": MerIndicatorList(items=[]),
            "response_agent_8": MitigationList(items=[]),
            "response_agent_9": AdaptationList(items=[]),
            "response_agent_10": SDGList(items=[]),
            "response_agent_translate": {},
            "language": background_task_input["language"],
            "messages": [],
        }

        # 2. Generate the plan
        try:
            logger.info(f"Task {task_uuid}: Executing graph for plan generation")
            logger.info(
                f"Task {task_uuid}: Country code: {initial_state['country_code']}"
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

        # 3. Parse the plan result into PlanResponse
        try:
            # Step 1: Create metadata
            metadata = PlanCreatorMetadata(
                locode=result["city_data"]["locode"],
                cityName=result["city_data"]["name"],
                actionId=result["climate_action_data"]["ActionID"],
                actionName=result["climate_action_data"]["ActionName"],
                language=background_task_input["language"],
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
            plan_response = PlanResponse(metadata=metadata, content=content)

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


def _execute_plan_translation(task_uuid: str, background_task_input):
    """Background task to execute plan translation"""
    try:
        # Update status to running
        task_storage[task_uuid]["status"] = "running"
        logger.info(
            f"Task {task_uuid}: Starting plan translation from language {background_task_input['inputLanguage']} to language {background_task_input['outputLanguage']}"
        )

        # Dummy result
        plan_response = PlanResponse(
            metadata=PlanCreatorMetadata(
                locode="test",
                cityName="test",
                actionId="test",
                actionName="test",
                language=background_task_input["outputLanguage"],
                createdAt=datetime.now(UTC),
            ),
            content=PlanContent(
                introduction=Introduction(
                    city_description="test",
                    action_description="test",
                    national_strategy_explanation="test",
                ),
                subactions=SubactionList(items=[]),
                institutions=InstitutionList(items=[]),
                milestones=MilestoneList(items=[]),
                timeline=[Timeline()],
                costBudget=[CostBudget()],
                merIndicators=MerIndicatorList(items=[]),
                mitigations=MitigationList(items=[]),
                adaptations=AdaptationList(items=[]),
                sdgs=SDGList(items=[]),
            ),
        )
        # Store the result
        task_storage[task_uuid]["status"] = "completed"
        task_storage[task_uuid]["plan_response"] = plan_response
    except Exception as e:
        logger.error(
            f"Task {task_uuid}: Unexpected error during plan translation: {str(e)}",
            exc_info=True,
        )
        task_storage[task_uuid]["status"] = "failed"
        task_storage[task_uuid]["error"] = f"Error translating plan: {str(e)}"
