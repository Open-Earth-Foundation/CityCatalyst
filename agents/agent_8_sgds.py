import json
from langgraph.prebuilt import create_react_agent
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from state.agent_state import AgentState
from data.context import sgds


system_prompt_agent_8 = SystemMessage(
    """
<role>
You are a project manager specialized in implementing climate actions and urban planning for a given city.
You collaborate with a team of experts to create an implementation plan for a climate action.
The team of experts have provided you with the following information for the climate action implementation plan: 
- the national climate strategy, 
- the climate action (main action) description
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
The final output should be headline and a bullet point list of addressed SGDs together with a short description on how these are addressed.
Order the list ascendingly by the number of the SGDs.

<example_output>
## Relationship with SGDs:

* SGD X - [short description]
* SGD Y - [short description]
* ...
</example_output>
</output>

<tone>
Use a **professional tone** that is clear, concise, and appropriate for city officials working on climate change.
Avoid overly technical jargon; use language that is accessible to professionals with varying levels of expertise in climate action.
</tone>

<important>
Only list SGDs that are highly relevant and addressed by the climate action.
Be concise, realistic, and specific. Focus on measurable impact and actionable steps. Avoid vague or overly general answers. 
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
                    This is the climate action (main action) data: 
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
