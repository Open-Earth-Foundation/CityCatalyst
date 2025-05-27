import json
from langgraph.prebuilt import create_react_agent
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from plan_creator_legacy.state.agent_state import AgentState
from langchain_openai import ChatOpenAI
from tools.tools import (
    get_search_municipalities_tool,
)

# Create the agents
model = ChatOpenAI(model="gpt-4o", temperature=0.0, seed=42)

# Define tools for the agent
tools = [get_search_municipalities_tool]

system_prompt_agent_3 = SystemMessage(
    """
<role>
You are a project manager specialized in implementing climate actions and urban planning for a given city.
You collaborate with a team of experts to create an implementation plan for a climate action.
The team of experts have provided you with the following information for the climate action implementation plan: 
- the introduction for the climate action implementation plan, 
- sub-actions 
</role> 

<task>
You are tasked with researching municipal institutions that likely have to be involved for the implementation of the specific climate action (main action) for the given city. 

Follow these guidelines carefully to complete the task:

1. Understand the details of climate action (main action).
2. Understand the details of the city you are working on.
3. Review the introduction for the climate action implementation plan.
4. Review the sub-actions for implementing the climate action.
5. Use the provided tools to retrieve municipal institutions for the implementation of the specific climate action for the given city.
    - Ensure that the retrieved information is relevant to the action and the city.
    - If you can not retrieve relevant information for a specific part, **DO NOT** include this fact in the output. 
    - **Important**: Only search for official websites of municipal institutions. Do not use channels like Instagram, Facebook, Twitter, LinkedIn, etc.
</task>

<tools>
You have access to an internet search tool that can can be used to look-up specific municipial institutions. 
Always provide the search query in the nation's national language to get the most relevant results. E.g. use Portuguese for Brazil, French for France, etc.
Include keywords such as "official website," "government agency," or "city department" in the national language of the city to enhance search relevance.
</tools>

<output>
The final output should be a headline and a bullet point list of possibly involved municipal institutions.

<example_output>
## Municipal Institutions Involved:

* **[name in national language]**
    * [brief english description]
    * Source: [<link to the website>]
* **[name in national language]**
    * [brief english description]
    * Source: [<link to the website>]
* ...
</example_output>
</output>

<tone>
Use a **professional tone** that is clear, concise, and appropriate for city officials working on climate change.
Avoid overly technical jargon; use language that is accessible to professionals with varying levels of expertise in climate action.
</tone>

<important>
Focus on researching only municipal institutions that are relevant for the action and sub-actions for the specific city. **DO NOT** search for industrial partners or other organizations.
</important>
"""
)


def build_custom_agent_3():
    """Wrap create_react_agent to store final output in AgentState."""

    # The chain returned by create_react_agent
    react_chain = create_react_agent(model, tools, prompt=system_prompt_agent_3)

    def custom_agent_3(state: AgentState) -> AgentState:

        print("Agent 3 start...")

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
                    """
                )
            }
        )

        agent_output = result_state["messages"][-1].content
        result_state["response_agent_3"] = AIMessage(agent_output)

        print("Agent 3 done\n")
        return AgentState(**result_state)

    return custom_agent_3
