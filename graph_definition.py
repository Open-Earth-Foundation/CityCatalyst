from langgraph.graph import StateGraph, START, END
from utils.render_graph import render_graph
from state.agent_state import AgentState

from agents.agent_1_main_action import build_custom_agent_1
from agents.agent_2_sub_actions import build_custom_agent_2
from agents.agent_3_involved_municipalities import build_custom_agent_3
from agents.agent_4_goals_milestones import build_custom_agent_4

# from agents.agent_5_timeline import build_custom_agent_5
# from agents.agent_6_cost_budget import build_custom_agent_6
from agents.agent_7_mer import build_custom_agent_7
from agents.agent_8_adaptation import build_custom_agent_8
from agents.agent_9_mitigation import build_custom_agent_9
from agents.agent_10_sgds import build_custom_agent_10
from agents.agent_combine import custom_agent_combine


agent_1 = build_custom_agent_1()
agent_2 = build_custom_agent_2()
agent_3 = build_custom_agent_3()
agent_4 = build_custom_agent_4()
# agent_5 = build_custom_agent_5()
# agent_6 = build_custom_agent_6()
agent_7 = build_custom_agent_7()
agent_8 = build_custom_agent_8()
agent_9 = build_custom_agent_9()
agent_10 = build_custom_agent_10()
agent_combine = custom_agent_combine


def create_graph():
    # Build the graph
    builder = StateGraph(AgentState)
    builder.add_node("agent_1", agent_1)
    builder.add_node("agent_2", agent_2)
    builder.add_node("agent_3", agent_3)
    builder.add_node("agent_4", agent_4)
    # builder.add_node("agent_5", agent_5)
    # builder.add_node("agent_6", agent_6)
    builder.add_node("agent_7", agent_7)
    builder.add_node("agent_8", agent_8)
    builder.add_node("agent_9", agent_9)
    builder.add_node("agent_10", agent_10)
    builder.add_node("agent_combine", agent_combine)

    # Define the edges
    builder.add_edge(START, "agent_1")
    builder.add_edge("agent_1", "agent_2")
    builder.add_edge("agent_2", "agent_3")
    builder.add_edge("agent_3", "agent_4")
    builder.add_edge("agent_4", "agent_7")
    builder.add_edge("agent_7", "agent_8")
    builder.add_edge("agent_8", "agent_9")
    builder.add_edge("agent_9", "agent_10")
    builder.add_edge("agent_10", "agent_combine")
    builder.add_edge("agent_combine", END)

    # Compile the graph
    compiled_graph = builder.compile()

    render_graph(compiled_graph)

    return compiled_graph
