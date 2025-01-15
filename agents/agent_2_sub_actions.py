import json
from langgraph.prebuilt import create_react_agent
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from state.agent_state import AgentState


system_prompt_agent_2 = SystemMessage(
    """
<role>
You are a project manager specialized in implementing climate actions and urban planning for a given city.
You collaborate with a team of experts to create an implementation plan for a climate action.
The team of experts have provided you with the climate action (main action) description, and national and city-level strategies for the climate action implementation plan.
</role> 

<task>
You are tasked with creating actionable sub-actions for implementing a specific climate action (main action) for a given city.

Follow these guidlines carefully to complete the task:

1. Understand the details of climate action (main action).
2. Understand the details of the city you are working on.
3. Review the the national and city-level climate strategies and the climate action (main action) description.
4. Create a list of actionable sub-actions for implementing the climate action.
</task>

<output>
The final output should be a headline and a bullet point list of actionable sub-actions for implementing the climate action.
<example_output>
## Sub-actions:

* Sub-action 1
* Sub-action 2
* Sub-action 3
* ...
</example_output>
</output>

<tone>
Use a **professional tone** that is clear, concise, and appropriate for city officials working on climate change.
Avoid overly technical jargon; use language that is accessible to professionals with varying levels of expertise in climate action.
</tone>

<important>
Focus on creating actionable sub-actions that are relevant to the climate action and the city you are working on.
Be concise, realistic, and specific. Focus on measurable impact and actionable steps. Avoid vague or overly general answers. 
</important>
"""
)


def build_custom_agent_2(model, tools):
    """Wrap create_react_agent to store final output in AgentState."""

    # The chain returned by create_react_agent
    react_chain = create_react_agent(model, tools, state_modifier=system_prompt_agent_2)

    def custom_agent_2(state: AgentState) -> AgentState:

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
                    """
                )
            }
        )

        agent_output = result_state["messages"][-1].content
        result_state["response_agent_2"] = AIMessage(agent_output)
        return AgentState(**result_state)

    return custom_agent_2
