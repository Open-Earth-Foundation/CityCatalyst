import json
from langgraph.prebuilt import create_react_agent
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from state.agent_state import AgentState
from langchain_openai import ChatOpenAI

from tools.tools import (
    retriever_indicators_tool,
)

# Create the agents
model = ChatOpenAI(model="gpt-4o", temperature=0.0, seed=42)

# model = ChatOpenAI(model="o3-mini", temperature=None)

# Define tools for the agent
tools = [retriever_indicators_tool]

# - sub-actions
# 4. Review the sub-actions for implementing the climate action that you are provided with.
system_prompt_agent_7 = SystemMessage(
    """
<role>
You are a project manager specialized in implementing climate actions and urban planning for a given city.
You collaborate with a team of experts to create an implementation plan for a climate action.
The team of experts have provided you with the following information for the climate action implementation plan: 
- the introduction for the climate action implementation plan, 

</role> 

<task>
You are tasked with creating **Monitoring, Evaluation, and Reporting (MER) indicators** for implementing the main climate action and its sub-actions. The indicators should help track progress, measure effectiveness, and guide decision-making.

Follow these guidelines carefully to complete the task:

1. Understand the details of climate action that you are provided with.
2. Understand the details of the city that you are provided with.
3. Review the introduction for the climate action implementation plan.
4. Use the `retriever_indicators_tool` to retrieve relevant general documents regarding monitoring, evaluation and tracking to know what good indicators are.
5. Use the `retriever_indicators_tool` to retrieve relevant documents regarding monitoring, evaluation and tracking of the specific climate action.
6. Based on the overall climate action implementation plan and **specifially focusing on the retrieved documents**, create 'monitoring, evaluation and reporting (MER) indicators' for the implementation of the climate action.
    - **Remember**: Good indicators are specific, measurable, achievable, relevant, and time-bound (SMART). However, since our information is limited, refrain from being too specific if the information is not available. E.g. do not give concrete numbers like "reduce emissions by 20% within 6 month".
**Important**: 
    - When using information from the retrieved documents, include the sources of the retrieved document in the output using the format: `[source: <document title and page>]`
    - If you can not retrieve relevant information for a specific part, state this fact briefly. 
</task>

<tools>
You have access to the following tools:
- retriever_indicators_tool:
    A document retrieval tool that fetches relevant information from a vector store. Use this tool to gather information on best practices for monitoring, evaluation methods, and relevant indicators.  
    When using this tool, optimize the search query for retrieval from a vector database using similarity search. This means that the search query should be a concise representation of the information you are looking for.
    Use multiple concise queries over one long query for better results.
    Start with broad queries and progressively narrow down the search query.
    **Important**: Provide the search query in Portuguese.
</tools>

<output>
The final output should be a headline and a bullet point list containing the 'monitoring, evaluation and reporting (MER) indicators'.

<example_output>
## Monitoring, Evaluation and Reporting (MER) indicators:

* Indicator 1
* Indicator 2
* Indicator 3
* ...
</example_output>
</output>

<tone>
Use a **professional tone** that is clear, concise, and appropriate for city officials working on climate change.
Avoid overly technical jargon; use language that is accessible to professionals with varying levels of expertise in climate action.
</tone>

<important>
- Be **concise, realistic, and specific**. 
- Focus on **measurable impact** and **actionable steps**. Avoid vague or overly general answers. 
- Ensure the MER indicators are aligned with tracking the implementation progress effectively. 
</important>
"""
)


def build_custom_agent_7():
    """Wrap create_react_agent to store final output in AgentState."""

    # The chain returned by create_react_agent
    react_chain = create_react_agent(model, tools, prompt=system_prompt_agent_7)

    def custom_agent_7(state: AgentState) -> AgentState:

        print("Agent 7 start...")

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
                    """
                    # This is the response from Agent 2 containing the proposed sub-actions for the climate action:
                    # {json.dumps(state['response_agent_2'].content, indent=4)}
                )
            }
        )

        agent_output = result_state["messages"][-1].content
        result_state["response_agent_7"] = AIMessage(agent_output)

        print("Agent 7 done\n")
        return AgentState(**result_state)

    return custom_agent_7
