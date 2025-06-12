import json
from langgraph.prebuilt import create_react_agent
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from plan_creator_bundle.plan_creator.state.agent_state import AgentState
from plan_creator_bundle.plan_creator.data.context import mitigation
from langchain_openai import ChatOpenAI
from plan_creator_bundle.tools.tools import (
    placeholder_tool,
)
from plan_creator_bundle.plan_creator.models import MitigationList
from plan_creator_bundle.plan_creator.prompts.agent_9_prompt import (
    agent_9_system_prompt,
    agent_9_user_prompt,
)

from utils.logging_config import setup_logger
import logging

setup_logger()
logger = logging.getLogger(__name__)

# Create the agents
model = ChatOpenAI(model="gpt-4o", temperature=0.0, seed=42)

# Define tools for the agent
tools = [placeholder_tool]

system_prompt_agent_9 = SystemMessage(agent_9_system_prompt)


def build_custom_agent_9():
    """Wrap create_react_agent to store final output in AgentState."""

    # The chain returned by create_react_agent
    react_chain = create_react_agent(
        model, tools, prompt=system_prompt_agent_9, response_format=MitigationList
    )

    def custom_agent_9(state: AgentState) -> AgentState:
        logger.info("Agent 9 start...")

        result_state = react_chain.invoke(
            {
                "messages": HumanMessage(
                    agent_9_user_prompt.format(
                        climate_action_data=json.dumps(
                            state["climate_action_data"], indent=2
                        ),
                        city_data=json.dumps(state["city_data"], indent=2),
                        response_agent_1=json.dumps(
                            state["response_agent_1"].model_dump(), indent=2
                        ),
                        mitigation=mitigation,
                        action_type=state["climate_action_data"]["ActionType"],
                    )
                )
            }
        )

        # Extract the structured response from the result_state
        agent_output_structured: MitigationList = result_state["structured_response"]
        result_state["response_agent_9"] = agent_output_structured

        logger.info("Agent 9 done\n")
        return AgentState(**result_state)

    return custom_agent_9
