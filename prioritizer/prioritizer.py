import os
import csv
from dotenv import load_dotenv
from openai import OpenAI
import re
import json
import pandas as pd
from pydantic import BaseModel
from typing import List
from pathlib import Path
from utils.reading_data import read_city_inventory, read_actions
from utils.additional_scoring_functions import (
    count_matching_hazards,
    find_highest_emission,
)
from utils.prompt import prompt as PROMPT

load_dotenv()

api_key = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=api_key)

# Constants for quantitative scoring
SCORE_MAX = 100 / 4
# Do a dynamic adaptation of how many fields we calculate for an action ( if there are nulls )
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
# Dynamically construct the file paths based on the script's location
BASE_DIR = Path(__file__).resolve().parent
ACTION_DATA_PATH = BASE_DIR / "CAP_data/long_actions.json"
CITY_DATA_PATH = BASE_DIR / "CAP_data/city_data.json"
OUTPUT_FILE = BASE_DIR / "new_output.json"


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
        print("There was no GHGReductionPotential")
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
            pass
        if reduction_str and reduction_str in reduction_mapping:
            print("Reduction string:", reduction_str)
            print("Reduction mapping:", reduction_mapping[reduction_str])
            reduction_percentage = reduction_mapping[reduction_str]
            city_emission = city.get(city_emission_key, 0)
            print("City emission:", city_emission)
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
        weights_path = "CAP_data/weights.json"
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
        score += matching_hazards_count * hazards_weight * SCORE_MAX
    print("Score after hazard:", score)

    # Dependencies - caculate the number of dependencies and give a minus score based on that very low impact
    dependencies = action.get("Dependencies", [])
    if isinstance(dependencies, list):
        score -= len(dependencies) * 0.5
    print("Score after dependencies:", score)
    # ActionName - pass
    # AdaptationCategory - pass this time
    # Subsector - skip for now maybe more data needed as now we are covering per sector
    # PrimaryPurpose - use only for LLM

    # Sector - if it matches the most emmissions intensive sectors gets bonus points
    total_emission_reduction_all_sectors = calculate_emissions_reduction(city, action)
    print(
        "Total emissions reduction for all sectors:",
        total_emission_reduction_all_sectors,
    )
    if total_emission_reduction_all_sectors > 0:
        total_emissions = city.get("totalEmissions", 1)  # Avoid division by zero
        reduction_percentage = (
            total_emission_reduction_all_sectors / total_emissions
        ) * 100
        print("Reduction percentage:", reduction_percentage)
        score += round((reduction_percentage / 100) * SCORE_MAX, 3)
    print("Score after emissions reduction:", score)

    # Calculate for every sector
    weights_emissions = weights.get("GHGReductionPotential", 1)
    most_emissions, percentage_emissions_value = find_highest_emission(city)
    if action.get("Sector") == most_emissions:
        score += (percentage_emissions_value / 100) * SCORE_MAX * weights_emissions
    print("Score after sector emission reduction:", score)
    # InterventionType - skip for now
    # Description - use only for LLM
    # BehavioralChangeTargeted - skip for now

    # Adaptation effectiveness score
    # TODO I can see that there is No key like that in the current version of long list of actions was this scraped or moved to another one
    adaptation_effectiveness = action.get("AdaptionEffectiveness")
    if adaptation_effectiveness in scale_adaptation_effectiveness:
        adaptation_weight = weights.get("AdaptationEffectiveness", 1)
        score += (
            scale_adaptation_effectiveness[adaptation_effectiveness]
            * SCORE_MAX
            * adaptation_weight
        )
    print("Score after adaptation effectiveness:", score)

    # Time in years score
    timeline_str = action.get("TimelineForImplementation", "")
    if timeline_str is None:
        pass
    elif timeline_str in timeline_mapping:
        time_score_weight = weights.get("TimelineForImplementation", 1)
        time_score = timeline_mapping[timeline_str]
        score += time_score * time_score_weight * SCORE_MAX
    else:
        print("Invalid timeline:", timeline_str)

    print("Score after time in years:", score)

    # Cost score
    if "CostInvestmentNeeded" in action:
        cost_investment_needed = action["CostInvestmentNeeded"]
        cost_score_weight = weights.get("CostInvestmentNeeded", 1)
        cost_score = scale_adaptation_effectiveness.get(cost_investment_needed, 0)
        score += cost_score * SCORE_MAX * cost_score_weight

    print("Score after cost:", score)
    print("-------------")
    return score


class Action(BaseModel):
    action_id: str
    action_name: str
    actionPriority: int
    explanation: str
    city_name: str


class PrioritizedActions(BaseModel):
    actions: List[Action]


def send_to_llm(prompt):
    system_prompt = PROMPT
    response = client.beta.chat.completions.parse(
        model="gpt-4o-2024-08-06",
        messages=[
            {
                "role": "system",
                "content": system_prompt,
            },
            {"role": "user", "content": prompt},
        ],
        response_format=PrioritizedActions,
    )
    return response.choices[0].message.parsed


def qualitative_score(city, action):
    prompt = f"""
    You are a climate action expert, tasked to prioritize and recommend the top 20 actions for a city based on the following guidelines:
    
    ### Guidelines for Action Prioritization:
    1. **Cost-effectiveness:** Actions with lower costs and high benefits should rank higher.
    2. **Emissions Reduction:** Actions that achieve significant greenhouse gas (GHG) emissions reduction (Scope 1, 2, and 3) should rank higher, especially those targeting the city's largest emission sectors.
    3. **Risk Reduction:** Prioritize actions that address climate hazards and reduce risks for the city effectively.
    4. **Environmental Compatibility:** Actions that align with the city's environment, such as biome and climate, should be preferred.
    5. **Socio-Demographic Suitability:** Actions should match the population size, density, and socio-economic context of the city.
    6. **Implementation Timeline:** Actions with shorter implementation timelines or faster impact should rank higher.
    7. **Dependencies:** Actions with fewer dependencies or preconditions should be prioritized.
    8. **Sector Relevance:** Actions targeting high-emission or priority sectors for the city should rank higher.
    9. **City Size and Capacity:** Actions should be suitable for the city's capacity and resources to implement.

    ### Instructions:
    - Based on the rules, evaluate the top 20 actions provided.
    - Consider both qualitative and quantitative aspects of the actions.
    - Rank all 20 actions.
    - Provide a detailed explanation for why each action was prioritized.

    ### Action Data (Top 20 Actions):
    {action}

    ### City Data:
    {city}

    RETURN ALL ACTIONS RANKED BY PRIORITY.
    """
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


def write_output(top_actions, filename):
    output_dir = os.path.dirname(filename)
    if output_dir:  # Check if there's a directory path to create
        try:
            os.makedirs(output_dir, exist_ok=True)
        except OSError as e:
            print("Error creating output directory:", e)
            return
        except Exception as e:
            print("Unexpected error creating output directory:", e)
            return

    try:
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(top_actions, f, indent=4)
        print(f"Successfully wrote to {filename}.")
    except Exception as e:
        print(f"Error writing to {filename}:", e)


def main():
    cities = read_city_inventory()
    actions = read_actions()

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
    write_output(top_qualitative_adaptation, "output_adaptation.json")
    write_output(top_qualitative_mitigation, "output_mitigation.json")


if __name__ == "__main__":
    main()
