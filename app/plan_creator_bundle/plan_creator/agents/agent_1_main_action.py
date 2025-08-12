import json
from langgraph.prebuilt import create_react_agent
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from plan_creator_bundle.plan_creator.state.agent_state import AgentState
from langchain_openai import ChatOpenAI
import logging
import os

from plan_creator_bundle.tools.tools import (
    retriever_vectorstore_national_strategy_tool,
)

from plan_creator_bundle.plan_creator.models import Introduction
from plan_creator_bundle.plan_creator.prompts.agent_1_prompt import (
    agent_1_system_prompt,
    agent_1_user_prompt,
)

OPENAI_MODEL_NAME_PLAN_CREATOR = os.environ["OPENAI_MODEL_NAME_PLAN_CREATOR"]

# Create the agents
model = ChatOpenAI(model=OPENAI_MODEL_NAME_PLAN_CREATOR, temperature=0.0, seed=42)

# Define tools for the agent
tools = [
    retriever_vectorstore_national_strategy_tool,
]

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

        result_state = react_chain.invoke(
            {
                "messages": HumanMessage(
                    agent_1_user_prompt.format(
                        climate_action_data=json.dumps(
                            state["climate_action_data"], indent=2
                        ),
                        city_data=json.dumps(state["city_data"], indent=2),
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
