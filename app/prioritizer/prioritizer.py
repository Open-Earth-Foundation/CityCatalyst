"""
This file is the main file for the prioritizer.
It is used to prioritize climate actions for a given city.

It uses the following files:
- reading_writing_data.py: for reading and writing data to files
- additional_scoring_functions.py: for additional scoring functions
- prompt.py: for the prompt
- ml_comparator.py: for the ML comparator
- get_actions.py: for getting the actions from the API

Usage:
python prioritizer.py --locode <locode>

Example:
Run it from the /app folder of the project with the following command:

python -m prioritizer.prioritizer --locode "BR CII"
"""

import argparse
import sys
import os
import random
from dotenv import load_dotenv
from openai import OpenAI
import json
from pydantic import BaseModel
from typing import List
from pathlib import Path
from prioritizer.utils.reading_writing_data import (
    read_city_inventory,
    write_output,
)
from prioritizer.utils.additional_scoring_functions import (
    count_matching_hazards,
    find_highest_emission,
)
from prioritizer.utils.prompt import return_prompt
from prioritizer.utils.ml_comparator import ml_compare
from prioritizer.services.get_actions import get_actions
import logging
from prioritizer.utils.tournament import tournament_ranking
from prioritizer.utils.filter_actions_by_biome import filter_actions_by_biome

logger = logging.getLogger(__name__)

load_dotenv()

api_key = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=api_key)

scale_scores = {
    "Very High": 1.0,
    "High": 0.75,
    "Medium": 0.5,
    "Low": 0.25,
    "Very Low": 0.0,
}
scale_adaptation_effectiveness = {"low": 0.33, "medium": 0.66, "high": 0.99}

# Define the mapping for timeline options
timeline_mapping = {"<5 years": 1.0, "5-10 years": 0.5, ">10 years": 0}
ghgi_potential_mapping = {
    "0-19": 0.20,
    "20-39": 0.4,
    "40-59": 0.6,
    "60-79": 0.8,
    "80-100": 1.0,
}


def calculate_emissions_reduction(city, action):
    # Define the mapping for percentage ranges
    reduction_mapping = {
        "0-19": 0.1,
        "20-39": 0.3,
        "40-59": 0.5,
        "60-79": 0.7,
        "80-100": 0.9,
    }
    # Initialize total emissions reduction
    total_reduction = 0

    # Get the GHGReductionPotential from the action
    ghg_potential = action.get("GHGReductionPotential", {})
    if not ghg_potential:
        # print("There was no GHGReductionPotential")
        return 0

    # Define the sectors and corresponding city emissions keys
    sectors = {
        "stationary_energy": "stationaryEnergyEmissions",
        "transportation": "transportationEmissions",
        "waste": "wasteEmissions",
        "ippu": "industrialProcessEmissions",
        "afolu": "landUseEmissions",
    }

    # Iterate over the sectors
    for sector, city_emission_key in sectors.items():
        reduction_str = ghg_potential.get(sector) if ghg_potential else None
        if reduction_str is None:
            continue
        elif reduction_str and reduction_str in reduction_mapping:
            # print("Reduction string:", reduction_str)
            # print("Reduction mapping:", reduction_mapping[reduction_str])
            reduction_percentage = reduction_mapping[reduction_str]
            city_emission = city.get(city_emission_key, 0)
            # print("City emission: " + str(city_emission) + " for " + city_emission_key)
            reduction_amount = city_emission * reduction_percentage
            total_reduction += reduction_amount

    return total_reduction


def quantitative_score(city, action):
    """
    Calculates a quantitative score for a given action in a city based on several criteria.
    The score is calculated as follows:
    1. Emissions reduction score: Based on the GHG reduction potential of the action.
    2. Adaptation effectiveness score: Based on the adaptation effectiveness of the action.
    3. Time in years score: Based on the timeline for implementation of the action.
    4. Cost score: Based on the budget of the city.
    Args:
        city (dict): A dictionary containing information about the city, including its budget.
        action (dict): A dictionary containing information about the action, including GHG reduction potential, adaptation effectiveness, and timeline for implementation.
    Returns:
        float: The calculated quantitative score for the action.
    """

    def load_weights():
        # Get the directory of the current script (prioritizer.py)
        script_dir = Path(__file__).resolve().parent

        # Construct the full path to the weights.json file
        weights_path = script_dir / "CAP_data" / "weights.json"

        # weights_path = "CAP_data/weights.json"
        with open(weights_path, "r", encoding="utf-8") as f:
            weights = json.load(f)
        return weights

    weights = load_weights()
    score = 0
    # Hazard calculation -  agreed adding the hazard into the city data and filtering it from them to see how many match
    # there should be weights adjusted for the hazards based on CCRA data listing the most important ones for the city
    matching_hazards_count = count_matching_hazards(city, action)
    if matching_hazards_count > 0:
        hazards_weight = weights.get("Hazard", 1)
        # check if it's not 0
        score += matching_hazards_count * hazards_weight
    # print("Score after hazard:", score)

    # Dependencies - caculate the number of dependencies and give a minus score based on that very low impact
    dependencies = action.get("Dependencies", [])
    dependencies_weights = weights.get("Dependencies", 1)
    if isinstance(dependencies, list):
        score -= round(len(dependencies) * dependencies_weights, 3)
    # print("Score after dependencies:", score)
    # ActionName - pass
    # AdaptationCategory - pass this time
    # Subsector - skip for now maybe more data needed as now we are covering per sector
    # PrimaryPurpose - use only for LLM

    # Sector - if it matches the most emmissions intensive sectors gets bonus points
    total_emission_reduction_all_sectors = calculate_emissions_reduction(city, action)
    # print(
    #     "Total emissions reduction for all sectors:",
    #     total_emission_reduction_all_sectors,
    # )
    weights_emissions = weights.get("GHGReductionPotential", 1)
    if total_emission_reduction_all_sectors > 0:
        total_emissions = city.get("totalEmissions", 1)  # Avoid division by zero
        # print("Total emissions of a city:", total_emissions)
        reduction_percentage = total_emission_reduction_all_sectors / total_emissions
        # print("Reduction percentage:", reduction_percentage)
        score += round(reduction_percentage * weights_emissions, 3)
    # print("Score after emissions reduction:", score)

    # Calculate for every sector
    weights_emissions = weights.get("GHGReductionPotential", 1)
    most_emissions, percentage_emissions_value = find_highest_emission(city)
    if action.get("Sector") == most_emissions:
        score += (percentage_emissions_value / 100) * weights_emissions
    # print("Score after sector emission reduction:", score)
    # InterventionType - skip for now
    # Description - use only for LLM
    # BehavioralChangeTargeted - skip for now

    # Adaptation effectiveness score - skip adding score if value is null or zero
    adaptation_effectiveness = action.get("AdaptationEffectiveness")
    if adaptation_effectiveness in scale_adaptation_effectiveness:
        effective_value = scale_adaptation_effectiveness[adaptation_effectiveness]
        if effective_value:  # Only add score if effective_value is non-zero (non-falsy)
            adaptation_weight = weights.get("AdaptationEffectiveness", 1)
            score += effective_value * adaptation_weight
    # print("Score after adaptation effectiveness:", score)

    # Time in years score
    timeline_str = action.get("TimelineForImplementation", "")
    if timeline_str is None:
        pass
    elif timeline_str in timeline_mapping:
        time_score_weight = weights.get("TimelineForImplementation", 1)
        time_score = timeline_mapping[timeline_str]
        score += time_score * time_score_weight
    else:
        logging.debug("Invalid timeline:", timeline_str)

    # print("Score after time in years:", score)

    # Cost score
    if "CostInvestmentNeeded" in action:
        cost_investment_needed = action["CostInvestmentNeeded"]
        cost_score_weight = weights.get("CostInvestmentNeeded", 1)
        cost_score = scale_adaptation_effectiveness.get(cost_investment_needed, 0)
        score += cost_score * cost_score_weight

    # print("Score after cost:", score)
    # print("-------------")
    return score


class Action(BaseModel):
    action_id: str
    action_name: str
    actionPriority: int
    explanation: str
    city_name: str


class PrioritizedActions(BaseModel):
    actions: List[Action]


def send_to_llm2(prompt):

    response = client.beta.chat.completions.parse(
        model="gpt-4o-2024-08-06",
        messages=[
            {"role": "user", "content": prompt},
        ],
        response_format=PrioritizedActions,
        temperature=0.0,
    )
    return response.choices[0].message.parsed


def send_to_llm(prompt: str) -> PrioritizedActions:
    # Using the o3-mini reasoning model and no max_tokens parameter.
    response = client.beta.chat.completions.parse(
        model="o3-mini",  # Changed from gpt-4o to o3-mini.
        messages=[
            {"role": "user", "content": prompt},
        ],
        # Specify structured output using the Pydantic class.
        response_format=PrioritizedActions,
    )
    # Return the parsed structured output.
    return response.choices[0].message.parsed  # type: ignore


def qualitative_score(city, action):
    prompt = return_prompt(action, city)
    llm_response = send_to_llm(prompt)
    return llm_response


def quantitative_prioritizer(cities, actions):
    all_scores = []

    for action in actions:
        quant_score = quantitative_score(cities, action)
        all_scores.append(
            {
                "city": cities.get("name", "Unknown City"),
                "action_id": action[
                    "ActionID"
                ],  # Use ActionID for unique identification
                "action_type": (
                    action["ActionType"][0] if action["ActionType"] else "Unknown"
                ),
                "action_name": action["ActionName"],
                "quantitative_score": quant_score,
            }
        )

    sorted_scores = sorted(
        all_scores, key=lambda x: x["quantitative_score"], reverse=True
    )

    # Filter Adaptation and Mitigation actions
    adaptation_actions = [
        score for score in sorted_scores if score["action_type"] == "adaptation"
    ]
    mitigation_actions = [
        score for score in sorted_scores if score["action_type"] == "mitigation"
    ]

    # Return top 15 for each category
    return adaptation_actions[:20], mitigation_actions[:20]


def qualitative_prioritizer(top_quantitative, actions, city):
    print("Qualitative prioritization started...")
    qualitative_scores = []
    city_name = city.get("name", "Unknown City")
    city_locode = city.get("locode", "Unknown")
    city_region = city.get("region", "Unknown")
    city_regionName = city.get("regionName", "Unknown")
    llm_output = qualitative_score(city, top_quantitative)

    if llm_output:

        for action in llm_output.actions:
            qualitative_scores.append(
                {
                    "locode": city_locode,
                    "cityName": city_name,
                    "region": city_region,
                    "regionName": city_regionName,
                    "actionId": action.action_id,
                    "actionName": action.action_name,
                    "actionPriority": action.actionPriority,
                    "explanation": action.explanation,
                }
            )
        logging.debug("Qualitative prioritization completed.")
        return qualitative_scores
    else:
        logging.debug("No qualitative prioritization data.")
        return []


def main(locode: str):
    try:
        city = read_city_inventory(locode)

        # Create function here that gets all the city data from the APIs and stores it in 'city' object
        # This will substitute the city_data.json file

        # Use the API to get the actions
        actions = get_actions()
        logging.debug(json.dumps(actions, indent=2))

    except Exception as e:
        logging.error("Error reading data:", e)
        sys.exit(1)

    if not actions:
        logging.error("No actions data found from API.")
        sys.exit(1)

    if not city:
        logging.error("No city data found")
        sys.exit(1)

    # Filter actions by biome if applicable
    filtered_actions = filter_actions_by_biome(city, actions)
    logging.info(f"After biome filtering: {len(filtered_actions)} actions remain")

    # Separate adaptation and mitigation actions
    adaptation_actions = [
        action
        for action in filtered_actions
        if action.get("ActionType") is not None
        and isinstance(action["ActionType"], list)
        and "adaptation" in action["ActionType"]
    ]
    mitigation_actions = [
        action
        for action in filtered_actions
        if action.get("ActionType") is not None
        and isinstance(action["ActionType"], list)
        and "mitigation" in action["ActionType"]
    ]

    logging.info(
        f"Found {len(adaptation_actions)} adaptation actions and {len(mitigation_actions)} mitigation actions"
    )

    # Apply tournament ranking for adaptation actions
    logging.info("Starting tournament ranking for adaptation actions...")
    adaptation_ranking = tournament_ranking(
        city, adaptation_actions, comparator=ml_compare
    )

    # Format adaptation results
    top_ml_adaptation = []
    for action, rank in adaptation_ranking:
        top_ml_adaptation.append(
            {
                "locode": city.get("locode", "Unknown"),
                "cityName": city.get("name", "Unknown City"),
                "region": city.get("region", "Unknown"),
                "regionName": city.get("regionName", "Unknown"),
                "actionId": action.get("ActionID", "Unknown"),
                "actionName": action.get("ActionName", "Unknown"),
                "actionPriority": rank,
                "explanation": f"Ranked #{rank} by tournament ranking algorithm",
            }
        )

    # Apply tournament ranking for mitigation actions
    logging.debug("Starting tournament ranking for mitigation actions...")
    mitigation_ranking = tournament_ranking(
        city, mitigation_actions, comparator=ml_compare
    )

    # Format mitigation results
    top_ml_mitigation = []
    for action, rank in mitigation_ranking:
        top_ml_mitigation.append(
            {
                "locode": city.get("locode", "Unknown"),
                "cityName": city.get("name", "Unknown City"),
                "region": city.get("region", "Unknown"),
                "regionName": city.get("regionName", "Unknown"),
                "actionId": action.get("ActionID", "Unknown"),
                "actionName": action.get("ActionName", "Unknown"),
                "actionPriority": rank,
                "explanation": f"Ranked #{rank} by tournament ranking algorithm",
            }
        )

    # Save outputs to separate files
    write_output(top_ml_adaptation, f"output_{locode}_adaptation.json")
    write_output(top_ml_mitigation, f"output_{locode}_mitigation.json")
    logging.debug("Prioritization complete!")


if __name__ == "__main__":
    from utils.logging_config import setup_logger

    setup_logger(level=logging.INFO)

    parser = argparse.ArgumentParser(
        description="Prioritize climate actions for a given city."
    )
    parser.add_argument(
        "--locode",
        type=str,
        required=True,
        help="The UN/LOCODE of the city for which to prioritize actions.",
    )
    args = parser.parse_args()

    main(locode=args.locode)
