import json
from langgraph.prebuilt import create_react_agent
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from state.agent_state import AgentState
from langchain_openai import ChatOpenAI
from tools.tools import placeholder_tool

# Create the agents
model = ChatOpenAI(model="gpt-4o", temperature=0.0, seed=42)

# Define tools for the agent
tools = [placeholder_tool]

system_prompt_agent_6 = SystemMessage(
    """
<role>
You are a project manager specialized in implementing climate actions and urban planning for a given city.
You collaborate with a team of experts to create an implementation plan for a climate action.
The team of experts have provided you with the following information for the climate action implementation plan: 
- the introduction for the climate action implementation plan, 
- sub-actions,
- milestones,
- timeline
</role> 

<task>
You are tasked with creating 'cost and budget considerations' for implementing the climate action (main action) and sub-actions for the given city with the given milestones and timeline. 

Follow these guidelines carefully to complete the task:

1. Understand the details of climate action that you are provided with.
2. Understand the details of the city that you are provided with.
3. Review the national and city-level climate strategies and the main action description you are provided with.
4. Review the sub-actions for implementing the climate action that you are provided with.
5. Review the milestones for the implementation of the climate action that you are provided with.
6. Review the timeline for the implementation of the climate action that you are provided with.
7. Based on the main action, sub-actions, the milestones and timeline for the implementation of the climate action for the given city, create cost and budget considerations for the implementation of the climate action.
</task>

<output>
The final output should be a headline and a bullet point list containing the 'cost and budget considerations'.

<example_output>
## Cost and budget considerations:

* Cost and budget consideration 1
* Cost and budget consideration 2
* Cost and budget consideration 3
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


def build_custom_agent_6():
    """Wrap create_react_agent to store final output in AgentState."""

    # The chain returned by create_react_agent
    react_chain = create_react_agent(model, tools, prompt=system_prompt_agent_6)

    def custom_agent_6(state: AgentState) -> AgentState:

        print("Agent 6 start...")

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

                    This is the response from Agent 2 containing the proposed sub-actions for the climate action:
                    {json.dumps(state['response_agent_2'].content, indent=4)}

                    This is the response from Agent 4 containing the milestones for the climate action:
                    {json.dumps(state['response_agent_4'].content, indent=4)}
                    """
                )
            }
        )

        agent_output = result_state["messages"][-1].content
        result_state["response_agent_6"] = AIMessage(agent_output)

        print("Agent 6 done\n")
        return AgentState(**result_state)

    return custom_agent_6
