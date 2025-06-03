import json
from langgraph.prebuilt import create_react_agent
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from plan_creator_bundle.plan_creator.state.agent_state import AgentState
from plan_creator_bundle.plan_creator.data.context import sgds
from langchain_openai import ChatOpenAI
from plan_creator_bundle.tools.tools import (
    placeholder_tool,
)
from plan_creator_bundle.plan_creator.models import SDGList

from utils.logging_config import setup_logger
import logging

setup_logger()
logger = logging.getLogger(__name__)

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
The final output should be a JSON object with an `sdgs` field, which is an array of objects, each with the following fields:
{
  "sdgs": [
    {
      "title": "<SDG number and name>",
      "description": "<short description of how it is addressed>"
    },
    ...
  ]
}
If no SDGs are addressed by the climate action, output an empty list for the `sdgs` field, e.g. `{ "sdgs": [] }`.
Only output valid JSON format without any additional text or formatting like ```
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
    react_chain = create_react_agent(
        model, tools, prompt=system_prompt_agent_10, response_format=SDGList
    )

    def custom_agent_10(state: AgentState) -> AgentState:
        logger.info("Agent 10 start...")

        result_state = react_chain.invoke(
            {
                "messages": HumanMessage(
                    f"""
                    This is the climate action (main action) data: 
                    {json.dumps(state['climate_action_data'], indent=2)}

                    This is the city data: 
                    {json.dumps(state['city_data'], indent=2)}

                    This is the response from Agent 1 containing the introduction for the climate action implementation plan:
                    {json.dumps(state['response_agent_1'].model_dump(), indent=2)}

                    The following is the context for all the SGDs:
                    {json.dumps(sgds, indent=2)}
                    """
                )
            }
        )

        # Extract the structured response from the result_state
        agent_output_structured: SDGList = result_state["structured_response"]
        result_state["response_agent_10"] = agent_output_structured

        logger.info("Agent 10 done\n")
        return AgentState(**result_state)

    return custom_agent_10
