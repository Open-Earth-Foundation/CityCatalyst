import json
from langgraph.prebuilt import create_react_agent
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from plan_creator_bundle.plan_creator.state.agent_state import AgentState
from langchain_openai import ChatOpenAI
from plan_creator_bundle.plan_creator.models import SubactionList

from utils.logging_config import setup_logger
import logging

from plan_creator_bundle.tools.tools import (
    retriever_sub_action_tool,
)

setup_logger()
logger = logging.getLogger(__name__)

# Create the agents
model = ChatOpenAI(model="gpt-4o", temperature=0.0, seed=42)

# Define tools for the agent
tools = [retriever_sub_action_tool]


system_prompt_agent_2 = SystemMessage(
    """
<role>
You are a project manager specialized in implementing climate actions and urban planning for a given city.
You collaborate with a team of experts to create an implementation plan for a climate action.
The team of experts have provided you with the following information for the climate action implementation plan: 
- the introduction for the climate action implementation plan
</role> 

<task>
You are tasked with creating actionable sub-actions for implementing a specific climate action (main action) for a given city.

Follow these guidlines carefully to complete the task:

1. Understand the details of the climate action (main action).
2. Understand the details of the city you are working on.
3. Review the introduction for the climate action implementation plan.
4. Use the provided retriever_sub_action_tool to retrieve relevant documents about detailed steps for implementing the climate action.
5. Create a list of actionable sub-actions for implementing the climate action. The sub-actions should consider dependencies and be in chronological order if possible.
**Important**: 
    - If you can not retrieve relevant information for a specific part, **DO NOT** include this fact in the output. 
    - Do not include any sources in the output.
</task>

<tools>
You have access to the following tools:
- retriever_sub_action_tool:
    A document retrieval tool that can retrieve relevant information from a vector store. 
    Use this tool to gather specific information on how to implement a certain climate action and which steps (sub actions) are required.
    When using this tool, optimize the search query for retrieval from a vector database using similarity search. This means that the search query should be a concise representation of the information you are looking for.
    Use multiple concise queries over one long query for better results.
    Start with broad queries and progressively narrow down the search query.
</tools>

<output>
The final output should be a JSON object with an 'items' field containing an array of subaction objects.
<example_output>
{
  "items": [
    {
      "number": 1,
      "title": "Sub-action 1",
      "description": "Description of sub-action 1"
    },
    {
      "number": 2,
      "title": "Sub-action 2",
      "description": "Description of sub-action 2"
    },
    {
      "number": 3,
      "title": "Sub-action 3",
      "description": "Description of sub-action 3"
    }
  ]
}
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


def build_custom_agent_2():
    """Wrap create_react_agent to store final output in AgentState."""

    # The chain returned by create_react_agent
    react_chain = create_react_agent(
        model, tools, prompt=system_prompt_agent_2, response_format=SubactionList
    )

    def custom_agent_2(state: AgentState) -> AgentState:

        logger.info("Agent 2 start...")

        result_state = react_chain.invoke(
            {
                "messages": HumanMessage(
                    f"""
                    This is the climate action (main action) data: 
                    {json.dumps(state['climate_action_data'], indent=2)}

                    This is the city data: 
                    {json.dumps(state['city_data'], indent=2)}

                    This is the response from Agent 1 containing the nation and city-level strategies as well as the climate action plan (main action) description:
                    {json.dumps(state['response_agent_1'].model_dump(), indent=2)}

                    # INSTRUCTIONS FOR OUTPUT FORMAT
                    Please output your response as a JSON object with a `items` field, which is an array of objects, each with the following fields:
                    {{
                    "items": [
                        {{
                        "number": <number of the subaction>,
                        "title": "<title of the subaction>",
                        "description": "<description of the subaction>"
                        }},
                        {{
                        "number": <number of the subaction>,
                        "title": "<title of the subaction>",
                        "description": "<description of the subaction>"
                        }},
                        ...
                    ]
                    }}
                    Only output valid JSON format without any additional text or formatting like ```
                    """
                )
            }
        )

        # Extract the structured response from the result_state
        agent_output_structured: SubactionList = result_state["structured_response"]
        result_state["response_agent_2"] = agent_output_structured

        logger.info("Agent 2 done\n")
        return AgentState(**result_state)

    return custom_agent_2
