import json
from graph_definition import create_graph
from state.agent_state import AgentState
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from pathlib import Path

# Path to template
template_path = Path(__file__).parent / "data" / "climate_action_plan_template.json"

# Load the template with docstring
with open(template_path, "r") as f:
    template = json.load(f)

# Create the graph
graph = create_graph()

# Initial shared state
initial_state = AgentState(
    climate_action_data={
        "name": "Climate Action Plan",
        "parts": ["Main Action Description", "Goals", "Implementation Plan"],
    },
    city_data={"name": "New York City", "population": 8_336_817},
    climate_action_plan_template=template,
    response_agent_1=AIMessage(""),
    response_agent_2=AIMessage(""),
    messages=[HumanMessage("Start the process.")],
    test="The content of test is a weird sentence about a blue bird.",
)

# Invoke the compiled graph
result = graph.invoke(input=initial_state)

# Print the result
print(result)
