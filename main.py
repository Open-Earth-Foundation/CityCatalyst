import json
from graph_definition import create_graph
from state.agent_state import AgentState
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from pathlib import Path

# Path to data
template_path = Path(__file__).parent / "data" / "climate_action_plan_template.json"
climate_action_data_path = Path(__file__).parent / "data" / "climate_action.json"
city_data_path = Path(__file__).parent / "data" / "city.json"

# Load the template with docstring
with open(template_path, "r") as f:
    template = json.load(f)

with open(climate_action_data_path, "r") as f:
    climate_action_data = json.load(f)

with open(city_data_path, "r") as f:
    city_data = json.load(f)

# Create the graph
graph = create_graph()

# Initial shared state
initial_state = AgentState(
    climate_action_data=climate_action_data,
    city_data=city_data,
    climate_action_plan_template=template,
    response_agent_1=AIMessage(""),
    response_agent_2=AIMessage(""),
    messages=[],
)

# Invoke the compiled graph
result = graph.invoke(input=initial_state)

# Print the result
print(result)
