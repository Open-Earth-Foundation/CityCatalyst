from typing import TypedDict, Annotated


# Define the state
class AgentState(TypedDict):
    climate_action_data: Annotated[
        dict, "The dictionary containing the climate action data"
    ]
    city_data: Annotated[dict, "The dictionary containing the city data"]
    response_agent_1: Annotated[str, "The response from Agent 1"]
    messages: Annotated[list, "The list of messages exchanged between agents"]
