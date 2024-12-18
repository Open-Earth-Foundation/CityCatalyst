import argparse
import sys
import os
import json
from pathlib import Path
from utils.reading_writing_data import read_city_inventory, read_actions, write_output
from utils.additional_scoring_functions import (
    count_matching_hazards,
    find_highest_emission,
    calculate_emissions_reduction,
    adaptation_effectiveness_score,
    time_implementation_score,
    cost_score,
    dependency_count_score,
    load_mappings
)
from utils.prompt import return_prompt
from pydantic import BaseModel
from typing import List
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

api_key = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=api_key)

class Action(BaseModel):
    action_id: str
    action_name: str
    actionPriority: int
    explanation: str
    city_name: str

class PrioritizedActions(BaseModel):
    actions: List[Action]

def send_to_llm(prompt):
    response = client.beta.chat.completions.parse(
        model="gpt-4o-2024-08-06",
        messages=[
            {"role": "user", "content": prompt},
        ],
        response_format=PrioritizedActions,
        temperature=0.0,
    )
    return response.choices[0].message.parsed

def qualitative_score(city, action):
    prompt = return_prompt(action, city)
    llm_response = send_to_llm(prompt)
    return llm_response

def quantitative_score(city, action):
    """
    Calculates a quantitative score for a given action in a city based on several criteria.

    Args:
        city (dict): A dictionary containing information about the city, including its budget.
        action (dict): A dictionary containing information about the action.

    Returns:
        float: The calculated quantitative score for the action.
    """

    # Load weights and mappings
    weights_path = "CAP_data/weights.json"
    with open(weights_path, "r", encoding="utf-8") as f:
        weights = json.load(f)

    mappings = load_mappings()

    scores = 0

    # Hazard matching score
    print("# Calculating hazard matching score")
    hazard_weight = weights.get("Hazard", 1)
    scores += count_matching_hazards(city, action) * hazard_weight
    print(f"Score after hazard matching: {scores}")

    # Dependencies penalty
    print("# Calculating dependencies penalty")
    dependencies_weight = weights.get("Dependencies", 1)
    scores -= dependency_count_score(action) * dependencies_weight
    print(f"Score after dependencies penalty: {scores}")

    # Emissions reduction score
    print("# Calculating emissions reduction score")
    ghg_weight = weights.get("GHGReductionPotential", 1)
    emissions_reduction = calculate_emissions_reduction(city, action)
    scores += emissions_reduction * ghg_weight
    print(f"Score after emissions reduction: {scores}")

    # Sector match score
    print("# Calculating sector emissions match score")
    most_emissions, percentage_emissions_value = find_highest_emission(city)
    if action.get("Sector") == most_emissions:
        sector_weight = weights.get("GHGReductionPotential", 1)
        scores += (percentage_emissions_value / 100) * sector_weight
    print(f"Score after sector match: {scores}")

    # Adaptation effectiveness score
    print("# Calculating adaptation effectiveness score")
    adaptation_weight = weights.get("AdaptationEffectiveness", 1)
    adaptation_score = adaptation_effectiveness_score(action)
    scores += adaptation_score * adaptation_weight
    print(f"Score after adaptation effectiveness: {scores}")

    # Time for implementation score
    print("# Calculating time for implementation score")
    timeline_weight = weights.get("TimelineForImplementation", 1)
    implementation_score = time_implementation_score(action, mappings)
    scores += implementation_score * timeline_weight
    print(f"Score after implementation timeline: {scores}")

    # Cost score
    print("# Calculating cost score")
    cost_weight = weights.get("CostInvestmentNeeded", 1)
    cost_score_value = cost_score(action, mappings)
    scores += cost_score_value * cost_weight
    print(f"Score after cost calculation: {scores}")

    print("# Final Score:", scores)
    return scores

def quantitative_prioritizer(cities, actions):
    all_scores = []

    for action in actions:
        quant_score = quantitative_score(cities, action)
        all_scores.append(
            {
                "city": cities.get("name", "Unknown City"),
                "action_id": action["ActionID"],
                "action_type": (
                    action["ActionType"][0] if action.get("ActionType") else "Unknown"
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

    # Return top 20 for each category
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
        print("Qualitative prioritization completed.")
        return qualitative_scores
    else:
        print("No qualitative prioritization data.")
        return []

def main(locode: str):
    try:
        cities = read_city_inventory(locode)
        actions = read_actions()
    except Exception as e:
        print("Error reading data:", e)
        return

    # Quantitative prioritization
    top_adaptation, top_mitigation = quantitative_prioritizer(cities, actions)

    # Qualitative prioritization
    top_qualitative_adaptation = qualitative_prioritizer(
        top_adaptation, actions, cities
    )
    top_qualitative_mitigation = qualitative_prioritizer(
        top_mitigation, actions, cities
    )

    # Save outputs to separate files
    write_output(top_qualitative_adaptation, f"output_{locode}_adaptation.json")
    write_output(top_qualitative_mitigation, f"output_{locode}_mitigation.json")

if __name__ == "__main__":
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
