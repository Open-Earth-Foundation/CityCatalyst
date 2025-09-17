import os
import json
from langgraph.prebuilt import create_react_agent
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from plan_creator_bundle.plan_creator_legacy.state.agent_state import AgentState
from langchain_openai import ChatOpenAI
from plan_creator_bundle.plan_creator_legacy.prompts.agent_1_prompt import (
    agent_1_system_prompt,
    agent_1_user_prompt,
)

from plan_creator_bundle.tools.tools import (
    retriever_main_action_tool,
)

OPENAI_MODEL_NAME_PLAN_CREATOR_LEGACY = os.environ[
    "OPENAI_MODEL_NAME_PLAN_CREATOR_LEGACY"
]

# Create the agents
model = ChatOpenAI(
    model=OPENAI_MODEL_NAME_PLAN_CREATOR_LEGACY, temperature=0.0, seed=42
)

# Define tools for the agent
tools = [retriever_main_action_tool]

# Define prompts for each agent
system_prompt_agent_1 = SystemMessage(agent_1_system_prompt)


def build_custom_agent_1():
    """Wrap create_react_agent to store final output in AgentState."""

    # The chain returned by create_react_agent
    react_chain = create_react_agent(model, tools, prompt=system_prompt_agent_1)

    def custom_agent_1(state: AgentState) -> AgentState:

        print("Agent 1 start...")

        result_state = react_chain.invoke(
            {
                "messages": HumanMessage(
                    agent_1_user_prompt.format(
                        climate_action_data=json.dumps(
                            state["climate_action_data"], indent=4
                        ),
                        city_data=json.dumps(state["city_data"], indent=4),
                    )
                )
            }
        )

        agent_output = result_state["messages"][-1].content
        result_state["response_agent_1"] = AIMessage(agent_output)

        print("Agent 1 done\n")
        return AgentState(**result_state)

    return custom_agent_1
