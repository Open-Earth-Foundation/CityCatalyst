import json
from langgraph.prebuilt import create_react_agent
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from plan_creator_bundle.plan_creator.state.agent_state import AgentState
from langchain_openai import ChatOpenAI
import logging
import os

from utils.vector_store_retrievers import (
    _serialize_vector_results,
    retriever_vectorstore_national_strategy_tool,
)
from utils.prompt_data_filters import build_prompt_inputs

from plan_creator_bundle.plan_creator.models import Introduction
from plan_creator_bundle.plan_creator.prompts.agent_1_prompt import (
    agent_1_system_prompt,
    agent_1_user_prompt,
)

OPENAI_MODEL_NAME_PLAN_CREATOR = os.environ["OPENAI_MODEL_NAME_PLAN_CREATOR"]

# Create the agents
model = ChatOpenAI(model=OPENAI_MODEL_NAME_PLAN_CREATOR, temperature=0.0, seed=42)

# Define tools for the agent
tools = []

# Define prompts for each agent
system_prompt_agent_1 = SystemMessage(agent_1_system_prompt)

logger = logging.getLogger(__name__)


def build_custom_agent_1():
    """Wrap create_react_agent to store final output in AgentState."""

    # The chain returned by create_react_agent
    react_chain = create_react_agent(
        model, tools, prompt=system_prompt_agent_1, response_format=Introduction
    )

    def custom_agent_1(state: AgentState) -> AgentState:

        logger.info("Agent 1 start...")
        logger.info(f"Country code: {state['country_code']}")

        action_type = state["climate_action_data"].get("ActionType")
        if action_type is None:
            logger.error(
                f"Action type is None for action_id={state['climate_action_data']['ActionID']}"
            )
            return AgentState(**state)
        # Action type is a list of strings, extract the first element
        # Action type always only has one value
        action_type = action_type[0]

        action_name = state["climate_action_data"].get("ActionName")
        action_description = state["climate_action_data"].get("Description")

        # Retrieve vector-store context or fall back to None if inputs are missing
        retrieved_national_strategy = None
        if action_type is None or action_name is None or action_description is None:
            logger.warning(
                f"Action type, name, or description is None for action_id={state['climate_action_data']['ActionID']}"
            )
            logger.warning(
                f"Action type: {action_type}, Action name: {action_name}, Action description: {action_description}"
            )
        else:
            search_query = (
                f"Action name: {action_name}\n Action description: {action_description}"
            )

            retrieved_national_strategy = retriever_vectorstore_national_strategy_tool(
                action_type=action_type,
                search_query=search_query,
                country_code=state["country_code"],
            )

        national_strategy_for_prompt = []

        if (
            isinstance(retrieved_national_strategy, str)
            or retrieved_national_strategy is None
        ):
            # If the retrieved national strategy is a string or None, it means that the vector store is not found or the inputs are missing
            # We will return an empty list
            logger.warning(
                f"Could not retrieve national strategies from vector store for action_id={state['climate_action_data']['ActionID']}"
            )

        if isinstance(retrieved_national_strategy, list):
            # Retrieved national strategy is a list of tuples
            # Convert retrieved documents to a JSON-serializable structure
            national_strategy_for_prompt = _serialize_vector_results(
                retrieved_national_strategy
            )

        # Build shallow-copied and pruned dictionaries for the prompt
        city_data_for_prompt, climate_action_data_for_prompt = build_prompt_inputs(
            city_data=state["city_data"],
            action_data=state["climate_action_data"],
            action_type=action_type,
        )

        result_state = react_chain.invoke(
            {
                "messages": HumanMessage(
                    agent_1_user_prompt.format(
                        national_strategy=json.dumps(
                            national_strategy_for_prompt, indent=2, ensure_ascii=False
                        ),
                        climate_action_data=json.dumps(
                            climate_action_data_for_prompt, indent=2, ensure_ascii=False
                        ),
                        city_data=json.dumps(
                            city_data_for_prompt, indent=2, ensure_ascii=False
                        ),
                        country_code=state["country_code"],
                    )
                )
            }
        )

        # Extract the structured response from the AIMessage containing the Introduction model
        agent_output_structured: Introduction = result_state["structured_response"]

        result_state["response_agent_1"] = agent_output_structured

        logger.info("Agent 1 done\n")
        return AgentState(**result_state)

    return custom_agent_1
