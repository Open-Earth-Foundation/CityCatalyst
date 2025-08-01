import os
import json
import logging
from langgraph.prebuilt import create_react_agent
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from plan_creator_bundle.plan_creator.state.agent_state import AgentState
from langchain_openai import ChatOpenAI
from plan_creator_bundle.plan_creator.models import InstitutionList
from plan_creator_bundle.tools.tools import (
    openai_web_search_tool,
)
from plan_creator_bundle.plan_creator.prompts.agent_3_prompt import (
    agent_3_system_prompt,
    agent_3_user_prompt,
)

logger = logging.getLogger(__name__)

OPENAI_MODEL_NAME_PLAN_CREATOR = os.getenv(
    "OPENAI_MODEL_NAME_PLAN_CREATOR", "gpt-4.1-mini"
)

# Create the agents
model = ChatOpenAI(model=OPENAI_MODEL_NAME_PLAN_CREATOR, temperature=0.0, seed=42)

tools = [openai_web_search_tool]

system_prompt_agent_3 = SystemMessage(agent_3_system_prompt)


def build_custom_agent_3():
    """Wrap create_react_agent to store final output in AgentState."""

    # The chain returned by create_react_agent
    react_chain = create_react_agent(
        model=model,
        tools=tools,
        prompt=system_prompt_agent_3,
        response_format=InstitutionList,
    )

    def custom_agent_3(state: AgentState) -> AgentState:
        logger.info("Agent 3 start...")

        result_state = react_chain.invoke(
            {
                "messages": HumanMessage(
                    agent_3_user_prompt.format(
                        climate_action_data=json.dumps(
                            state["climate_action_data"], indent=2
                        ),
                        city_data=json.dumps(state["city_data"], indent=2),
                        response_agent_1=json.dumps(
                            state["response_agent_1"].model_dump(), indent=2
                        ),
                        response_agent_2=json.dumps(
                            state["response_agent_2"].model_dump(), indent=2
                        ),
                    )
                )
            }
        )

        logger.info(f"Agent 3 output: {result_state}")

        # Extract the structured response from the result_state
        agent_output_structured: InstitutionList = result_state["structured_response"]
        result_state["response_agent_3"] = agent_output_structured

        logger.info("Agent 3 done\n")
        return AgentState(**result_state)

    return custom_agent_3
