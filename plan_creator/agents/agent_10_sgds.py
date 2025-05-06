import json
from langgraph.prebuilt import create_react_agent
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from state.agent_state import AgentState
from data.context import sgds
from langchain_openai import ChatOpenAI
from tools.tools import (
    placeholder_tool,
)

# Create the agents
model = ChatOpenAI(model="gpt-4o", temperature=0.0, seed=42)

# Define tools for the agent
tools = [placeholder_tool]

system_prompt_agent_10 = SystemMessage(
    """
<role>
You are a project manager specializing in climate action implementation and urban planning. 
You work with a team of experts to develop an implementation plan for a city's climate action.
The team of experts have provided you with the following information for the climate action implementation plan: 
- the introduction for the climate action implementation plan
</role> 

<task>
You are tasked with mapping relevant United Nations (UN) smart development goals (SGDs) to the climate action plan for the city you are working on.
You need to identify, which SGDs are addressed by the climate action and how they are addressed.

Follow these guidlines carefully to complete the task:

1. Understand the details of climate action (main action).
2. Understand the details of the city you are working on.
3. Review the introduction for the climate action implementation plan.
4. Based on the description of the climate action, the city context, and the introduction for the climate action implementation plan, list all SGDs that are relevant and addressed.
</task>

<output>
The final output should be headline and a bullet point list of addressed SGDs together with a short description on how these are addressed.
Order the list ascendingly by the number of the SGDs.

<example_output>
## Relationship with SGDs:

* SGD [number]: [name]
* SGD [number]: [name]
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


def build_custom_agent_10():
    """Wrap create_react_agent to store final output in AgentState."""

    # The chain returned by create_react_agent
    react_chain = create_react_agent(model, tools, prompt=system_prompt_agent_10)

    def custom_agent_10(state: AgentState) -> AgentState:

        print("Agent 10 start...")

        result_state = react_chain.invoke(
            {
                "messages": HumanMessage(
                    f"""
                    This is the climate action (main action) data: 
                    {json.dumps(state['climate_action_data'], indent=4)}

                    This is the city data: 
                    {json.dumps(state['city_data'], indent=4)}

                    This is the response from Agent 1 containing the introduction for the climate action implementation plan:
                    {json.dumps(state['response_agent_1'].content, indent=4)}

                    The following is the context for all the SGDs:
                    {json.dumps(sgds, indent=4)}
                    """
                )
            }
        )

        agent_output = result_state["messages"][-1].content
        result_state["response_agent_10"] = AIMessage(agent_output)

        print("Agent 10 done\n")
        return AgentState(**result_state)

    return custom_agent_10
