import json
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.prebuilt import create_react_agent
from langchain.tools import tool
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from utils.render_graph import render_graph
from state.agent_state import AgentState
from utils.load_vectorstore import load_vectorstore


# Define tools for each agent
@tool
def document_retriever_tool(search_query: str):
    """
        Use this tool to retrieve chunks of text from a local Chroma database.

    The Chroma database contains the following documents:

    1. Brazil_NDC_November2024.pdf
       - Document Name: Brazil's Nationally Determined Contribution (NDC) to the Paris Agreement
       - Content: This document outlines Brazil's climate action plan strategy.

    2. Green_Cities_Brazil.pdf
       - Document Name: Green Cities: Cities and Climate Change in Brazil
       - Content: This report from the World Bank discusses opportunities for mitigating urban greenhouse gas emissions in sectors like transport, land use, energy efficiency, waste management, and urban forestry in Brazil.

    Both documents are limited in scope to Brazil's climate action plan and its implementation.
    Do not use this tool to retrieve information about cities outside of Brazil.

    **Input**: A user query (string).

    **Output**: A list of tuples in the form `[(document, relevance_score)]`.
    - Relevance scores range from `0` (lowest) to `1` (highest).
    - If you retrieve more than one document, give higher priority to the most relevant document.
    """

    vector_store = load_vectorstore("chroma_db", "text-embedding-3-large")

    if not vector_store:
        return "Could not load vector store. Please ensure your vector DB is created."

    docs_and_scores = vector_store.similarity_search_with_relevance_scores(
        query=search_query,
        k=4,
        score_threshold=0.40,
    )

    return docs_and_scores


@tool
def tool_agent_2():
    """Placeholder for Agent 2's tool"""
    pass  # Placeholder for Agent 2's tool


@tool
def tool_agent_3():
    """Placeholder for Agent 3's tool"""
    pass  # Placeholder for Agent 3's tool


@tool
def tool_agent_4():
    """Placeholder for Agent 4's tool"""
    pass  # Placeholder for Agent 4's tool


# Define prompts for each agent
system_prompt_agent_1 = SystemMessage(
    """
<role>
You are a project manager specialized in implementing climate actions for a given city.
</role> 

<task>
You are tasked with creating the in-depth main action description of the climate action plan.
To do this, refer to the provided climate action plan template and the given doc strings to know, which information is required. 
You only provide information for the main action description and no other fields.
</task>
"""
)
system_prompt_agent_2 = SystemMessage(
    "You are Agent 2. What is the weird test sentence about?"
)
system_prompt_agent_3 = SystemMessage(
    "You are Agent 3. Do nothing for now. You will be prompted later."
)
system_prompt_agent_4 = SystemMessage(
    "You are Agent 4. Do nothing for now. You will be prompted later."
)


# Create the agents
model = ChatOpenAI(model="gpt-4o-mini", temperature=0.0, seed=42)


def build_custom_agent_1(model, tools):
    """Wrap create_react_agent to store final output in AgentState."""

    # The chain returned by create_react_agent
    react_chain = create_react_agent(model, tools, state_modifier=system_prompt_agent_1)

    def custom_agent_1(state: AgentState) -> AgentState:
        # 1) Run the chain
        # result_state = react_chain.invoke(state)

        result_state = react_chain.invoke(
            {
                "messages": HumanMessage(
                    f"""
                    This is the climate action data: 
                    {json.dumps(state['climate_action_data'], indent=4)}

                    This is the city data: 
                    {json.dumps(state['city_data'], indent=4)}

                    This is the relevant part of the climate action plan template: 
                    {json.dumps(state['climate_action_plan_template']["in_depth_main_action_description"], indent=4)}
                    """
                )
            }
        )

        # 2) The result might be in result_state["messages"][-1]["content"]
        #    or in the 'output' key, depending on how your chain returns data.
        #    Adjust to your chain’s specifics. For example:
        agent_output = result_state["messages"][-1].content

        # 3) Store the output under "response_agent_1"
        # result_state["response_agent_1"] = AIMessage(agent_output)
        result_state["response_agent_1"] = AIMessage(agent_output)

        # 4) Return the updated state
        return AgentState(**result_state)
        # return AgentState(**state)

    return custom_agent_1


def build_custom_agent_2(model, tools):
    """Wrap create_react_agent to store final output in AgentState."""

    # The chain returned by create_react_agent
    react_chain = create_react_agent(model, tools, state_modifier=system_prompt_agent_2)

    def custom_agent_2(state: AgentState) -> AgentState:
        # 1) Run the chain
        # result_state = react_chain.invoke(state)

        result_state = react_chain.invoke(
            {
                "messages": HumanMessage(
                    f"""
                    This is the werid test sentence: 
                    {json.dumps(state['test'], indent=4)}
                    """
                )
            }
        )

        # 2) The result might be in result_state["messages"][-1]["content"]
        #    or in the 'output' key, depending on how your chain returns data.
        #    Adjust to your chain’s specifics. For example:
        agent_output = result_state["messages"][-1].content

        # 3) Store the output under "response_agent_1"
        result_state["response_agent_2"] = AIMessage(agent_output)

        # 4) Return the updated state
        return AgentState(**result_state)

    return custom_agent_2


agent_1 = build_custom_agent_1(model, [document_retriever_tool])
agent_2 = build_custom_agent_2(model, [tool_agent_2])
agent_3 = create_react_agent(
    model, [tool_agent_3], state_modifier=system_prompt_agent_3
)
agent_4 = create_react_agent(
    model, [tool_agent_4], state_modifier=system_prompt_agent_4
)


def create_graph():
    # Build the graph
    builder = StateGraph(AgentState)
    builder.add_node("agent_1", agent_1)
    builder.add_node("agent_2", agent_2)
    builder.add_node("agent_3", agent_3)
    builder.add_node("agent_4", agent_4)

    # Define the edges
    builder.add_edge(START, "agent_1")
    builder.add_edge("agent_1", "agent_2")
    builder.add_edge("agent_2", "agent_3")
    builder.add_edge("agent_3", "agent_4")
    builder.add_edge("agent_4", END)

    # Compile the graph
    compiled_graph = builder.compile()

    render_graph(compiled_graph)

    return compiled_graph
