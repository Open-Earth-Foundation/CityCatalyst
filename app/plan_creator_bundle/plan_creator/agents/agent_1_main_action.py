import json
from langgraph.prebuilt import create_react_agent
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from plan_creator_bundle.plan_creator.state.agent_state import AgentState
from langchain_openai import ChatOpenAI

import logging
from utils.logging_config import setup_logger

from plan_creator_bundle.tools.tools import (
    retriever_main_action_tool,
)

from plan_creator_bundle.plan_creator.models import Introduction

setup_logger()
logger = logging.getLogger(__name__)

# Create the agents
model = ChatOpenAI(model="gpt-4o", temperature=0.0, seed=42)

# model = ChatOpenAI(model="o3-mini", temperature=None)

# Define tools for the agent
tools = [retriever_main_action_tool]

# Define prompts for each agent
system_prompt_agent_1 = SystemMessage(
    """
<role>
You are a project manager specializing in climate action implementation and urban planning. 
You work with a team of experts to develop an implementation plan for a city's climate action.
</role> 

<task>
Your task is to create an introduction for the climate action implementation plan for the given city.

The introduction should include a short summary about the city, its population and geographical location.
Further it should include an overview of the climate action (main action) and its importance and relationship to the city.
Finally it needs to include a description of how the climate action (main action) is related to the national climate strategy of Brazil.

Follow these guidelines carefully to complete the task:

1. Understand the details of the climate action (main action) you are working on.
2. Understand the details of the city you are working on.
3. Use the `retriever_main_action_tool` to retrieve relevant documents about Brazil's climate strategy.
    - Ensure that the documents retrieved are relevant to the national climate strategy of Brazil.
4. Use the `retriever_main_action_tool` to retrieve relevant documents for the specific climate action (main action) and related background information.
    - Ensure that the documents retrieved are relevant to the climate action (main action) and the city you are working on.
5. Create a concise introduction for the climate action implementation plan incorporating the retrieved documents. 
**Important**: 
    - If you can not retrieve relevant information for a specific part, **DO NOT** include this fact in the output. 
    - Do not include any sources in the output.
</task>

<tools>
You have access to the following tools:
- retriever_main_action_tool:
    A document retrieval tool that can retrieve relevant information from a vector store. 
    Use this tool to gather information about climate strategies, climate actions and background information to enrich the introduction.
    When using this tool, optimize the search query for retrieval from a vector database using similarity search. This means that the search query should be a concise representation of the information you are looking for.
    Use multiple concise queries over one long query for better results.
    Start with broad queries and progressively narrow down the search query.
</tools>

<output>
The final output should include:
- a headline 
- the name of the climate action
- the name of the city
- the introduction for the climate action implementation plan.
Ensure the introduction remains under 300 words, presenting a structured summary that flows logically. 
Use appropriate paragraphs/spacing to organize the information.

<sample_output>
# Climate Action Implementation Plan
**City:** [name of city]<br>
**Climate action:** [name of climate action]

[Brief overview of the city, including population and geographical location]
[Summary of the main climate action and its importance to the city]
[Explanation of how the climate action aligns with national climate policies and further background information]
</sample_output>
</output>

<tone>
Use a **professional tone** that is clear, concise, and appropriate for city officials working on climate change.
Avoid overly technical jargon; use language that is accessible to professionals with varying levels of expertise in climate action.
</tone>

<important>
When using information from the documents, ensure that the information is relevant to the city you are working on.
Include the source of the information in the final output.
Be concise, realistic, and specific. Focus on measurable impact and actionable steps. Avoid vague or overly general answers. 
</important>
"""
)


def build_custom_agent_1():
    """Wrap create_react_agent to store final output in AgentState."""

    # The chain returned by create_react_agent
    react_chain = create_react_agent(
        model, tools, prompt=system_prompt_agent_1, response_format=Introduction
    )

    def custom_agent_1(state: AgentState) -> AgentState:

        logger.info("Agent 1 start...")

        result_state = react_chain.invoke(
            {
                "messages": HumanMessage(
                    f"""
                    This is the climate action (main action) data: 
                    {json.dumps(state['climate_action_data'], indent=2)}

                    This is the city data: 
                    {json.dumps(state['city_data'], indent=2)}

                    # INSTRUCTIONS FOR OUTPUT FORMAT
                    Please output your response as a JSON object with the following fields:
                    {{
                        \"title\": <headline for the plan>,
                        \"description\": <the introduction for the climate action implementation plan, as described in the system prompt>
                    }}
                    Only output valid JSON format without any additional text or formatting like ```json ```.
                    """
                )
            }
        )

        # Extract the structured response from the AIMessage containing the Introduction model
        agent_output_structured: Introduction = result_state["structured_response"]

        result_state["response_agent_1"] = agent_output_structured

        logger.info("Agent 1 done\n")
        return AgentState(**result_state)

    return custom_agent_1
