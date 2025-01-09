from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.prebuilt import create_react_agent
from langchain.tools import tool

from utils.utils import render_graph
from state.agent_state import AgentState


# Define tools for each agent (placeholders)
@tool
def tool_agent_1():
    """Placeholder for Agent 1's tool"""
    pass  # Placeholder for Agent 1's tool


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


# Define prompts for each agent (placeholders)
prompt_agent_1 = "You are Agent 1. Call your tool exactly 3 times. After this give a summary of the climate action plan and the city data."
prompt_agent_2 = "You are Agent 2. Your task is to..."
prompt_agent_3 = "You are Agent 3. Your task is to..."
prompt_agent_4 = "You are Agent 4. Your task is to..."


# Create the agents
model = ChatOpenAI(model="gpt-4o-mini")


agent_1 = create_react_agent(model, [tool_agent_1], state_modifier=prompt_agent_1)
agent_2 = create_react_agent(model, [tool_agent_2], state_modifier=prompt_agent_2)
agent_3 = create_react_agent(model, [tool_agent_3], state_modifier=prompt_agent_3)
agent_4 = create_react_agent(model, [tool_agent_4], state_modifier=prompt_agent_4)


# # Define the state for the graph
# class CustomState(MessagesState):
#     pass


def create_graph():
    # Build the graph
    builder = StateGraph(AgentState)
    builder.add_node("agent_1", agent_1)
    builder.add_node("agent_2", agent_2)
    builder.add_node("agent_3", agent_3)
    builder.add_node("agent_4", agent_4)

    # Define the edges between agents (example flow)
    builder.add_edge(START, "agent_1")
    builder.add_edge("agent_1", "agent_2")
    builder.add_edge("agent_2", "agent_3")
    builder.add_edge("agent_3", "agent_4")
    builder.add_edge("agent_4", END)

    # Compile the graph
    compiled_graph = builder.compile()

    render_graph(compiled_graph)

    return compiled_graph
