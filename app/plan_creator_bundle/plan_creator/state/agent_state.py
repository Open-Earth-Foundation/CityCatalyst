from typing import TypedDict, Annotated
from plan_creator_bundle.plan_creator.models import (
    Introduction,
    SubactionList,
    InstitutionList,
    MilestoneList,
    MerIndicatorList,
    MitigationList,
    AdaptationList,
    SDGList,
    Timeline,
    CostBudget,
)


# Define the state
class AgentState(TypedDict):
    climate_action_data: Annotated[
        dict, "The dictionary containing the climate action data"
    ]
    city_data: Annotated[dict, "The dictionary containing the city data"]
    response_agent_1: Annotated[Introduction, "The response from Agent 1"]
    response_agent_2: Annotated[
        SubactionList, "The response from Agent 2 (list of Subaction)"
    ]
    response_agent_3: Annotated[
        InstitutionList, "The response from Agent 3 (list of Institution)"
    ]
    response_agent_4: Annotated[
        MilestoneList, "The response from Agent 4 (list of Milestone)"
    ]
    response_agent_5: Annotated[
        Timeline, "The response from Agent 5 (timeline, empty model)"
    ]
    response_agent_6: Annotated[
        CostBudget, "The response from Agent 6 (cost budget, empty model)"
    ]
    response_agent_7: Annotated[
        MerIndicatorList, "The response from Agent 7 (list of MerIndicator)"
    ]
    response_agent_8: Annotated[
        MitigationList, "The response from Agent 8 (list of Mitigation)"
    ]
    response_agent_9: Annotated[
        AdaptationList, "The response from Agent 9 (list of Adaptation)"
    ]
    response_agent_10: Annotated[SDGList, "The response from Agent 10 (list of SDG)"]
    # response_agent_combine: Annotated[str, "The combined response from all agents"]
    response_agent_translate: Annotated[
        str, "The translated response from Agent combine"
    ]
    language: Annotated[str, "The language of the response"]
    messages: Annotated[list, "The list of messages exchanged between agents"]
