import json
import logging
import os
from langgraph.prebuilt import create_react_agent
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from plan_creator_bundle.plan_creator.state.agent_state import AgentState
from plan_creator_bundle.plan_creator.data.context import adaptation
from langchain_openai import ChatOpenAI
from plan_creator_bundle.tools.tools import (
    placeholder_tool,
)
from plan_creator_bundle.plan_creator.models import AdaptationList
from plan_creator_bundle.plan_creator.prompts.agent_8_prompt import (
    agent_8_system_prompt,
    agent_8_user_prompt,
)

logger = logging.getLogger(__name__)

OPENAI_MODEL_NAME_PLAN_CREATOR = os.environ["OPENAI_MODEL_NAME_PLAN_CREATOR"]

# Create the agents
model = ChatOpenAI(model=OPENAI_MODEL_NAME_PLAN_CREATOR, temperature=0.0, seed=42)

# Define tools for the agent
tools = [placeholder_tool]

system_prompt_agent_8 = SystemMessage(agent_8_system_prompt)


def build_custom_agent_8():
    """Wrap create_react_agent to store final output in AgentState."""

    # The chain returned by create_react_agent
    react_chain = create_react_agent(
        model, tools, prompt=system_prompt_agent_8, response_format=AdaptationList
    )

    def custom_agent_8(state: AgentState) -> AgentState:
        logger.info("Agent 8 start...")

        result_state = react_chain.invoke(
            {
                "messages": HumanMessage(
                    agent_8_user_prompt.format(
                        climate_action_data=json.dumps(
                            state["climate_action_data"], indent=2
                        ),
                        city_data=json.dumps(state["city_data"], indent=2),
                        response_agent_1=json.dumps(
                            state["response_agent_1"].model_dump(), indent=2
                        ),
                        adaptation=adaptation,
                        action_type=state["climate_action_data"]["ActionType"],
                    )
                )
            }
        )

        # Extract the structured response from the result_state
        agent_output_structured: AdaptationList = result_state["structured_response"]
        result_state["response_agent_8"] = agent_output_structured

        logger.info("Agent 8 done\n")
        return AgentState(**result_state)

    return custom_agent_8
