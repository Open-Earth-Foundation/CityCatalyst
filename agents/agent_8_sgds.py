import json
from langgraph.prebuilt import create_react_agent
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from state.agent_state import AgentState
from data.context import sgds


system_prompt_agent_8 = SystemMessage(
    """
<role>
You are a project manager specialized in implementing climate actions and urban planning for a given city.
</role> 

<task>
You are tasked with mapping relevant United Nations (UN) smart development goals (SGDs) to the climate action plan for the city you are working on.
You need to identify, which SGDs are addressed by the climate action and how they are addressed.

Follow these guidlines carefully to complete the task:

1. Understand the details of climate action.
2. Understand the details of the city you are working on.
3. Analyse the the national and city-level climate strategies and the main action description.
4. Based on the overall action and description, list all SGDs that are relevant and addressed. Include a brief description of how they are addressed by the climate action.
</task>

<output>
- The final output should be a list of addressed SGDs together with a short description on how these are addressed.
<example_output>
1. SGD X - [short description]
2. SGD Y - [short description]
3. ...
</example_output>
</output>

<important>
Only list SGDs that are relevant and addressed by the climate action.
</important>
"""
)


def build_custom_agent_8(model, tools):
    """Wrap create_react_agent to store final output in AgentState."""

    # The chain returned by create_react_agent
    react_chain = create_react_agent(model, tools, state_modifier=system_prompt_agent_8)

    def custom_agent_8(state: AgentState) -> AgentState:

        result_state = react_chain.invoke(
            {
                "messages": HumanMessage(
                    f"""
                    This is the climate action data: 
                    {json.dumps(state['climate_action_data'], indent=4)}

                    This is the city data: 
                    {json.dumps(state['city_data'], indent=4)}

                    This is the response from Agent 1 containing the nation and city-level strategies as well as the climate action plan (main action) description:
                    {json.dumps(state['response_agent_1'].content, indent=4)}

                    These are all the SGDs. Map the relevant ones to the climate action:
                    {sgds}
                    """
                )
            }
        )

        agent_output = result_state["messages"][-1].content
        result_state["response_agent_8"] = AIMessage(agent_output)
        return AgentState(**result_state)

    return custom_agent_8
