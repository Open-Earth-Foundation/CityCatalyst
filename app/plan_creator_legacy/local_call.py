"""
This module provides functionality to create a climate action plan.

Args:
    climate_action_id: ID of the climate action
    locode: Locode of the city
    language: Language of the response

Example:
Run the script with the following command from the app/ directory:

python -m plan_creator_legacy.local_call --climate_action_id "c40_0028" --locode "BR CCI" --language "en"
"""

import json
import argparse
from pathlib import Path
from plan_creator_legacy.graph_definition import create_graph
from plan_creator_legacy.state.agent_state import AgentState
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from plan_creator_legacy.utils.get_vectorstore_from_s3 import get_vectorstore


def mock_api_body(climate_action_id: str, locode: str):
    """
    Function that mocks the API request body for the climate action and city data.
    """
    # Path to data
    climate_action_data_path = (
        Path(__file__).parent
        / "data"
        / "input_local_testing"
        / (climate_action_id + ".json")
    )
    city_data_path = (
        Path(__file__).parent / "data" / "input_local_testing" / (locode + ".json")
    )

    with open(climate_action_data_path, "r") as f:
        climate_action_data = json.load(f)

    with open(city_data_path, "r") as f:
        city_data = json.load(f)

    return climate_action_data, city_data


def create_plan(climate_action_data: dict, city_data: dict, language: str):

    # Create the graph
    graph = create_graph()

    # Initial shared state
    initial_state = AgentState(
        climate_action_data=climate_action_data,
        city_data=city_data,
        response_agent_1=AIMessage(""),
        response_agent_2=AIMessage(""),
        response_agent_3=AIMessage(""),
        response_agent_4=AIMessage(""),
        # response_agent_5=AIMessage(""),
        # response_agent_6=AIMessage(""),
        response_agent_7=AIMessage(""),
        response_agent_8=AIMessage(""),
        response_agent_9=AIMessage(""),
        response_agent_10=AIMessage(""),
        response_agent_combine="",
        response_agent_translate="",
        language=language,
        messages=[],
    )

    # Invoke the compiled graph
    result = graph.invoke(input=initial_state)

    print("Plan created successfully.")


if __name__ == "__main__":

    parser = argparse.ArgumentParser(description="Create a climate action plan.")
    parser.add_argument(
        "--climate_action_id",
        type=str,
        required=True,
        help="The ID of the climate action to create a plan for. E.g. 'c40_xxxx' or 'ipcc_xxxx'.",
    )
    parser.add_argument(
        "--locode",
        type=str,
        required=True,
        help="The locode of the city data for the climate action. E.g. BR CCI",
    )
    parser.add_argument(
        "--language",
        type=str,
        required=True,
        choices=["en", "es", "pt"],
        help="The language of the response. One of 'en', 'es' or 'pt'.",
    )

    args = parser.parse_args()

    climate_action_data, city_data = mock_api_body(
        climate_action_id=args.climate_action_id, locode=args.locode
    )

    vector_store_path = Path(__file__).parent / "vector_stores"

    print("Loading vector store...")
    # Attempt to get the vector store
    success = get_vectorstore(
        collection_name="all_docs_db_small_chunks", local_path=str(vector_store_path)
    )

    if success:
        print("\nSUCCESS: Vector store is available locally")
        print("Creating plan...")
        create_plan(
            climate_action_data=climate_action_data,
            city_data=city_data,
            language=args.language,
        )
    else:
        print("\nFAILED: Could not get vector store")
        print("Ending...")
