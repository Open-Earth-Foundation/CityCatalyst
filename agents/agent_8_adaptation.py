import json
from langgraph.prebuilt import create_react_agent
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from state.agent_state import AgentState
from data.context import adaptation


system_prompt_agent_8 = SystemMessage(
    """
<role>
You are a project manager specialized in implementing climate actions and urban planning for a given city.
You collaborate with a team of experts to create an implementation plan for a climate action.
The team of experts have provided you with the following information for the climate action implementation plan: 
- the relevant climate strategies, 
- the climate action (main action) description
</role> 

<task>
You are tasked with defining which climate risks (hazards) for the city are addressed by the climate action (main action). 

Follow these guidelines carefully to complete the task:

1. Understand the details of climate action that you are provided with.
2. Understand the details of the city that you are provided with.
3. Review the national and city-level climate strategies and the main action description you are provided with.
4. Inspect the provided additional context to climate risks (hazards).
5. Based on the provided information, list all climate risks (hazards) that are relevant and addressed by the climate action. Include a brief description of how they are addressed by the climate action.
**Important**: It is possible, that a climate action does not address any of the listed climate risks (hazards). This can happen for example, when the climate action primarily aims at mitigating emissions. In this case, state this fact briefly.
</task>

<output>
The final output should include: 
- a headline
- a bullet point list containing climate risks (hazards) with a brief descriptions of how they are addressed.

<example_output>
## Climate Risks:

* Climate risk 1: [brief description]
* Climate risk 2: [brief description]
* ...
</example_output>
</output>

<tone>
Use a **professional tone** that is clear, concise, and appropriate for city officials working on climate change.
Avoid overly technical jargon; use language that is accessible to professionals with varying levels of expertise in climate action.
</tone>

<important>
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

                    This is the response from Agent 1 containing the national and city-level strategies as well as the climate action plan (main action) description:
                    {json.dumps(state['response_agent_1'].content, indent=4)}

                    This is additional context to climate risks (hazards):
                    {adaptation}
                    """
                )
            }
        )

        agent_output = result_state["messages"][-1].content
        result_state["response_agent_8"] = AIMessage(agent_output)
        return AgentState(**result_state)

    return custom_agent_8
