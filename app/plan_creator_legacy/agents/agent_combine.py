from plan_creator_legacy.state.agent_state import AgentState


def custom_agent_combine(state: AgentState) -> AgentState:

    print("Finalizing outputs...")

    # Get individual responses from the agents
    response_agent_1 = state["response_agent_1"].content
    response_agent_2 = state["response_agent_2"].content
    response_agent_3 = state["response_agent_3"].content
    response_agent_4 = state["response_agent_4"].content
    # response_agent_5 = state["response_agent_5"].content
    # response_agent_6 = state["response_agent_6"].content
    response_agent_7 = state["response_agent_7"].content
    response_agent_8 = state["response_agent_8"].content
    response_agent_9 = state["response_agent_9"].content
    response_agent_10 = state["response_agent_10"].content

    # Create a new dictionary based on the existing state
    result_state = AgentState(state)

    # Concatenate the responses (all in Markdown) into one big Markdown string
    combined_markdown = (
        f"{response_agent_1}\n\n"
        f"{response_agent_2}\n\n"
        f"{response_agent_3}\n\n"
        f"{response_agent_4}\n\n"
        # f"{response_agent_5}\n\n"
        # f"{response_agent_6}\n\n"
        f"{response_agent_7}\n\n"
        f"{response_agent_8}\n\n"
        f"{response_agent_9}\n\n"
        f"{response_agent_10}"
    )

    # Store the combined Markdown response under a new key
    result_state["response_agent_combine"] = combined_markdown

    print("Outputs combined\n")

    # Return an AgentState with the updated responses
    return AgentState(**result_state)
