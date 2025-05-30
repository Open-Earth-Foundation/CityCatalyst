import json
from langgraph.prebuilt import create_react_agent
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from plan_creator_bundle.plan_creator.state.agent_state import AgentState
from plan_creator_bundle.plan_creator.data.context import mitigation

from langchain_openai import ChatOpenAI
from plan_creator_bundle.tools.tools import (
    placeholder_tool,
)

# Create the agents
model = ChatOpenAI(model="gpt-4o", temperature=0.0, seed=42)

# Define tools for the agent
tools = [placeholder_tool]


system_prompt_agent_9 = SystemMessage(
    """
<role>
You are a project manager specialized in implementing climate actions and urban planning for a given city.
You collaborate with a team of experts to create an implementation plan for a climate action.
The team of experts have provided you with the following information for the climate action implementation plan: 
- the introduction for the climate action implementation plan
</role> 

<task>
You are tasked with defining which mitigation sectors for the city are addressed by the climate action (main action). 

Follow these guidelines carefully to complete the task:

1. Understand the details of climate action that you are provided with. Specifically, if the action is a mitigation action or an adaptation action which is given by the `ActionType` field in the climate action data.
2. Understand the details of the city that you are provided with.
3. Review the introduction for the climate action implementation plan.
4. Inspect the provided additional context to climate mitigation sectors.
5. Based on the provided information, list all mitigation sectors that are relevant and addressed by the climate action. Include a brief description of how they are addressed by the climate action.
**Important**: It is possible, that a climate action does not address any of the listed mitigation sectors. This can happen for example, when the climate action primarily aims at reducing climate risks (hazards). In this case, state this fact briefly.
</task>

<output>
The final output should include:
- a headline
- a bullet point list containing the mitigation sectors with a brief descriptions of how they are addressed.

<example_output_mitigation>
## Mitigation Sectors:

[brief description of how the mitigation sectors are addressed by the climate action]
</example_output_mitigation>

<example_output_adaptation>
## Mitigation Sectors:

The climate action [name of the climate action] addresses adaptation actions and does not primarily address any mitigation sectors.
</example_output_adaptation>
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


def build_custom_agent_9():
    """Wrap create_react_agent to store final output in AgentState."""

    # The chain returned by create_react_agent
    react_chain = create_react_agent(model, tools, prompt=system_prompt_agent_9)

    def custom_agent_9(state: AgentState) -> AgentState:

        print("Agent 9 start...")

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

                    This is additional context to climate mitigation sectors:
                    {mitigation}
                    """
                )
            }
        )

        agent_output = result_state["messages"][-1].content
        result_state["response_agent_9"] = AIMessage(agent_output)

        print("Agent 9 done\n")
        return AgentState(**result_state)

    return custom_agent_9
