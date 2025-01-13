import json
from langgraph.prebuilt import create_react_agent
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from state.agent_state import AgentState

# Define prompts for each agent
system_prompt_agent_1 = SystemMessage(
    """
<role>
You are a project manager specialized in implementing climate actions for a given city.
</role> 

<task>
You are tasked with creating the in-depth main action description of the climate action plan.

Follow these guidlines carefully to complete the task:

1. Information retrievel
    a. Retrieve general relevant information about climate strategies within Brazil.
    b. Retrieve specific information about climate strategies relevant to the given action description.
    c. Retrieve specific information about climate strategies relevant to the city you are working on.
    When using information from the documents, ensure that the information is relevant to the city you are working on.
    Include the source of the information in the final output using the format: `[source: <document title and page>]`.
    Important: If you could not retrieve any information, do not make up any information but instead state that you could not find any relevant information in the provided documents.
2. Broad climate strategy
    a. Start by providing a concise overview of the climate strategy in Brazil based on the retreived information. Inlcude both national and city-level strategies.
3. Action Description
    a. Create a concise in-depth main action description of the climate action plan related to the city you are working on.
    b. Ensure that the description is relevant to the city you are working on.
</task>

<tools>
You have access to a document retrieval tool that can retrieve relevant information about climate strategies within Brazil.
Use this tool to gather general information about Brazils climate strategy to enrich the action description.
</tools>

<output>
- The final output should be structured into two main sections:
    1. Broad Climate Strategy (National + City-Level)  
    2. In-Depth Main Action Description  
- Provide information only for the main action description (and the concise overview of the climate strategy), and no other fields.

<sample_output>
## 1. Broad Climate Strategy
[Concise overview of Brazil's national and city-level strategies, with references]

## 2. Main Action Description
[Detailed plan for the city, referencing relevant documents where applicable]

Sources:
[source: DocumentXYZ]
</sample_output>
</output>

<important>
When using information from the documents, ensure that the information is relevant to the city you are working on.
Include the scource of the information in the final output.
</important>
"""
)


def build_custom_agent_1(model, tools):
    """Wrap create_react_agent to store final output in AgentState."""

    # The chain returned by create_react_agent
    react_chain = create_react_agent(model, tools, state_modifier=system_prompt_agent_1)

    def custom_agent_1(state: AgentState) -> AgentState:

        result_state = react_chain.invoke(
            {
                "messages": HumanMessage(
                    f"""
                    This is the climate action data: 
                    {json.dumps(state['climate_action_data'], indent=4)}

                    This is the city data: 
                    {json.dumps(state['city_data'], indent=4)}
                    """
                )
            }
        )

        agent_output = result_state["messages"][-1].content
        result_state["response_agent_1"] = AIMessage(agent_output)
        return AgentState(**result_state)

    return custom_agent_1
