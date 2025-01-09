from graph_definition import create_graph
from state.agent_state import AgentState

# Create the graph
graph = create_graph()

# Initial shared state
initial_state = AgentState(
    climate_action_data={
        "name": "Climate Action Plan",
        "parts": ["Main Action Description", "Goals", "Implementation Plan"],
    },
    city_data={"name": "New York City", "population": 8_336_817},
    messages=[{"role": "user", "content": "Start the process."}],
)

# Invoke the compiled graph
result = graph.invoke(input=initial_state)

# Print the result
print(result)
