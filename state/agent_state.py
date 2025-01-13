from typing import TypedDict, Annotated
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage


# Define the state
class AgentState(TypedDict):
    climate_action_data: Annotated[
        dict, "The dictionary containing the climate action data"
    ]
    city_data: Annotated[dict, "The dictionary containing the city data"]
    climate_action_plan_template: Annotated[
        dict, "The template for the climate action plan"
    ]
    response_agent_1: Annotated[AIMessage, "The response from Agent 1"]
    response_agent_2: Annotated[AIMessage, "The response from Agent 2"]
    messages: Annotated[list, "The list of messages exchanged between agents"]
