import json
from langgraph.prebuilt import create_react_agent
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from plan_creator_bundle.plan_creator_legacy.state.agent_state import AgentState
from langchain_openai import ChatOpenAI
from plan_creator_bundle.tools.tools import placeholder_tool
from plan_creator_bundle.plan_creator_legacy.prompts.agent_6_prompt import (
    agent_6_system_prompt,
    agent_6_user_prompt,
)

# Create the agents
model = ChatOpenAI(model="gpt-4o", temperature=0.0, seed=42)

# Define tools for the agent
tools = [placeholder_tool]

system_prompt_agent_6 = SystemMessage(agent_6_system_prompt)


def build_custom_agent_6():
    """Wrap create_react_agent to store final output in AgentState."""

    # The chain returned by create_react_agent
    react_chain = create_react_agent(model, tools, prompt=system_prompt_agent_6)

    def custom_agent_6(state: AgentState) -> AgentState:

        print("Agent 6 start...")

        result_state = react_chain.invoke(
            {
                "messages": HumanMessage(
                    agent_6_user_prompt.format(
                        climate_action_data=json.dumps(
                            state["climate_action_data"], indent=4
                        ),
                        city_data=json.dumps(state["city_data"], indent=4),
                        response_agent_1=json.dumps(
                            state["response_agent_1"].content, indent=4
                        ),
                        response_agent_2=json.dumps(
                            state["response_agent_2"].content, indent=4
                        ),
                        response_agent_4=json.dumps(
                            state["response_agent_4"].content, indent=4
                        ),
                    )
                )
            }
        )

        agent_output = result_state["messages"][-1].content
        result_state["response_agent_6"] = AIMessage(agent_output)

        print("Agent 6 done\n")
        return AgentState(**result_state)

    return custom_agent_6
