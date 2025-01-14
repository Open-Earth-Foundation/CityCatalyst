import json
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, MessagesState, START, END
from langchain.tools import tool
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from utils.render_graph import render_graph
from state.agent_state import AgentState
from utils.load_vectorstore import load_vectorstore

from agents.agent_1_main_action import build_custom_agent_1
from agents.agent_2_sub_actions import build_custom_agent_2
from agents.agent_3_involved_partners import build_custom_agent_3
from agents.agent_4_goals_milestones import build_custom_agent_4
from agents.agent_5_timeline import build_custom_agent_5
from agents.agent_6_cost_budget import build_custom_agent_6
from agents.agent_7_mer import build_custom_agent_7
from agents.agent_8_sgds import build_custom_agent_8

from langchain_community.tools.tavily_search import TavilySearchResults


# 1. Brazil_NDC_November2024.pdf
#    - Document Name: Brazil's Nationally Determined Contribution (NDC) to the Paris Agreement
#    - Content: This document outlines Brazil's climate action plan strategy.

# 2. Green_Cities_Brazil.pdf
#    - Document Name: Green Cities: Cities and Climate Change in Brazil
#    - Content: This report from the World Bank discusses opportunities for mitigating urban greenhouse gas emissions in sectors like transport, land use, energy efficiency, waste management, and urban forestry in Brazil.

# Both documents are limited in scope to Brazil's climate action plan and its implementation.


# Define tools for each agent
@tool
def document_retriever_tool(search_query: str):
    """
        Use this tool to retrieve chunks of text from a local Chroma database.

    The Chroma database contains documents limited in scope to Brazil's climate action plan and its implementation.
    Use this tool to retrieve relevant information about cities within Brazil.

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


search = TavilySearchResults(
    max_results=5,
    search_depth="advanced",
    description="Search for municipal institutions and partners and their contact information for the implementation of the specific climate action for the given city. Perform the search in English und Portugues.",
)


@tool
def placeholder_tool():
    """
    A placeholder tool that does not have any functionality.
    Never call this tool!
    """


# Create the agents
model = ChatOpenAI(model="gpt-4o-mini", temperature=0.0, seed=42)

placeholder_tools = [placeholder_tool]


agent_1 = build_custom_agent_1(model, [document_retriever_tool])
agent_2 = build_custom_agent_2(model, placeholder_tools)
agent_3 = build_custom_agent_3(
    model, placeholder_tools
)  # for debugging purposes, 'search' tool is not provided to save on API calls. Add [search] to the list of tools to enable search tool.
agent_4 = build_custom_agent_4(model, placeholder_tools)
agent_5 = build_custom_agent_5(model, placeholder_tools)
agent_6 = build_custom_agent_6(model, placeholder_tools)
agent_7 = build_custom_agent_7(model, placeholder_tools)
agent_8 = build_custom_agent_8(model, placeholder_tools)


def create_graph():
    # Build the graph
    builder = StateGraph(AgentState)
    builder.add_node("agent_1", agent_1)
    builder.add_node("agent_2", agent_2)
    builder.add_node("agent_3", agent_3)
    builder.add_node("agent_4", agent_4)
    builder.add_node("agent_5", agent_5)
    builder.add_node("agent_6", agent_6)
    builder.add_node("agent_7", agent_7)
    builder.add_node("agent_8", agent_8)

    # Define the edges
    builder.add_edge(START, "agent_1")
    builder.add_edge("agent_1", "agent_2")
    builder.add_edge("agent_2", "agent_3")
    builder.add_edge("agent_3", "agent_4")
    builder.add_edge("agent_4", "agent_5")
    builder.add_edge("agent_5", "agent_6")
    builder.add_edge("agent_6", "agent_7")
    builder.add_edge("agent_7", "agent_8")
    builder.add_edge("agent_8", END)

    # Compile the graph
    compiled_graph = builder.compile()

    render_graph(compiled_graph)

    return compiled_graph
