from state.agent_state import AgentState
from pathlib import Path
from datetime import datetime
from styles.styles import styles_block
import markdown

OUTPUT_PATH = Path(__file__).parent.parent / "data" / "output"


def custom_agent_combine(state: AgentState) -> AgentState:

    print("Finalizing outputs...")

    # Get meta data
    climate_action_id = state["climate_action_data"]["ActionID"]
    city_locode = state["city_data"]["locode"]

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
        f"{styles_block}\n\n"
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

    # Convert Markdown to HTML
    html_content = markdown.markdown(combined_markdown, extensions=["extra"])

    # File output
    OUTPUT_PATH.mkdir(parents=True, exist_ok=True)

    # Get current date/time in hh:mm format
    current_time = datetime.now().strftime("%Y%m%d_%H%M")

    file_name = (
        f"{current_time}_{city_locode}_{climate_action_id}_implementation_plan.md"
    )
    file_name_html = (
        f"{current_time}_{city_locode}_{climate_action_id}_implementation_plan.html"
    )

    # Write the combined Markdown text to a local file
    with open(OUTPUT_PATH / file_name, "w", encoding="utf-8") as md_file:
        md_file.write(combined_markdown)

    # Write the html to a local file
    with open(OUTPUT_PATH / file_name_html, "w", encoding="utf-8") as md_file:
        md_file.write(html_content)

    print("Outputs finalized\n")

    # Return an AgentState with the updated responses
    return AgentState(**result_state)
