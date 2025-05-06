from typing import TypedDict, Annotated
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage


# Define the state
class AgentState(TypedDict):
    climate_action_data: Annotated[
        dict, "The dictionary containing the climate action data"
    ]
    city_data: Annotated[dict, "The dictionary containing the city data"]
    response_agent_1: Annotated[AIMessage, "The response from Agent 1"]
    response_agent_2: Annotated[AIMessage, "The response from Agent 2"]
    response_agent_3: Annotated[AIMessage, "The response from Agent 3"]
    response_agent_4: Annotated[AIMessage, "The response from Agent 4"]
    # response_agent_5: Annotated[AIMessage, "The response from Agent 5"]
    # response_agent_6: Annotated[AIMessage, "The response from Agent 6"]
    response_agent_7: Annotated[AIMessage, "The response from Agent 7"]
    response_agent_8: Annotated[AIMessage, "The response from Agent 8"]
    response_agent_9: Annotated[AIMessage, "The response from Agent 9"]
    response_agent_10: Annotated[AIMessage, "The response from Agent 10"]
    response_agent_combine: Annotated[str, "The combined response from all agents"]
    response_agent_translate: Annotated[
        str, "The translated response from Agent combine"
    ]
    language: Annotated[str, "The language of the response"]
    messages: Annotated[list, "The list of messages exchanged between agents"]
