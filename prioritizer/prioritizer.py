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
from utils.utils import count_matching_hazards, read_city_inventory, read_actions, find_highest_emission

load_dotenv()

api_key = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=api_key)

# Constants for quantitative scoring
SCORE_MAX = 100 / 5
MAX_EMISSIONS_REDUCTIONS = 500000
scale_scores = {
    "Very High": 1.0,
    "High": 0.75,
    "Medium": 0.5,
    "Low": 0.25,
    "Very Low": 0.0,
}
MAX_TIME_IN_YEARS = 20
MAX_COST = 60000000
# Dynamically construct the file paths based on the script's location
BASE_DIR = Path(__file__).resolve().parent
ACTION_DATA_PATH = BASE_DIR / "CAP_data/long_actions.json"
CITY_DATA_PATH = BASE_DIR / "CAP_data/city_data.json"
OUTPUT_FILE = BASE_DIR / "new_output.json"



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
    # Emissions reduction score
    ghg_potential = action.get("GHGReductionPotential", {})
    emissions_reduction = 0
    if ghg_potential:
        for sector in ["stationary_energy", "transportation", "waste", "ippu", "afolu"]:
            reduction_str = ghg_potential.get(sector)
            if reduction_str and reduction_str.lower() != "none" and reduction_str.lower() != "null":
                reduction_str = reduction_str.replace("%", "")
                if "-" in reduction_str:
                    reductions = [float(r) for r in reduction_str.split("-")]
                    reduction = sum(reductions) / len(reductions)
                else:
                    try:
                        reduction = float(reduction_str)
                    except ValueError:
                        reduction = 0
                emissions_reduction += reduction
    else:
        print("GHG NULL")
        score += 0
    # Now normalize and add to score
    if emissions_reduction > 0:
        emissions_reduction_percentage = emissions_reduction  # Since it's already in percentage
        emissions_reduction_score = emissions_reduction_percentage/100 * SCORE_MAX
        ghg_weight = weights.get("GHGReductionPotential", 1)
        emissions_reduction_score *= ghg_weight
        score += emissions_reduction_score
    print("Score after GHG reduction:", score)

       # Hazard calculation -  agreed adding the hazard into the city data and filtering it from them to see how many match
    # there should be weights adjusted for the hazards based on CCRA data listing the most important ones for the city
    matching_hazards_count = count_matching_hazards(city, action)
    if matching_hazards_count > 0:
        hazards_weight = weights.get("Hazard", 1)
        score += (matching_hazards_count / len(city.get("hazards", []))) * SCORE_MAX * hazards_weight
    
    # Dependencies - caculate the number of dependencies and give a minus score based on that very low impact
    dependencies = action.get("Dependencies", [])
    if isinstance(dependencies, list):
        score -= len(dependencies)
    # ActionName - pass
    # AdaptationCategory - pass this time
    # Subsector - skip for now maybe more data needed as now we are covering per sector 
    # PrimaryPurpose - use only for LLM

    # Sector - if it matches the most emmissions intensive sectors gets bonus points
    # TODO Require additional rework
    most_emissions, percentage_emissions_value = find_highest_emission(city)
    if action.get("Sector") == most_emissions:
        score += (percentage_emissions_value / 100) * SCORE_MAX

    # InterventionType - skip for now
    # Description - use only for LLM
    # BehavioralChangeTargeted - skip for now

    # Adaptation effectiveness score
    adaptation_effectiveness = action.get("AdaptionEffectiveness")
    if adaptation_effectiveness in scale_scores:
        adaptation_weight = weights.get("AdaptationEffectiveness", 1)
        score += scale_scores[adaptation_effectiveness] * SCORE_MAX * adaptation_weight
    print("Score after adaptation effectiveness:", score)

    # Define the mapping for timeline options
    timeline_mapping = {
        "<5 years": 10,
        "5-10 years": 5,
        ">10 years": 0
    }

    # Time in years score
    timeline_str = action.get("TimelineForImplementation", "")
    if timeline_str is None:
        pass
    elif timeline_str in timeline_mapping:
        time_score_weight = weights.get("TimelineForImplementation", 1)
        time_score = timeline_mapping[timeline_str]
        score += time_score*time_score_weight
    else:
        print("Invalid timeline:", timeline_str)

    print("Score after time in years:", score)

    # Cost score
    if "CostInvestmentNeeded" in action:
        cost_investment_needed = action["CostInvestmentNeeded"]
        if isinstance(cost_investment_needed, list):
            cost_investment_needed = cost_investment_needed[0]  # Extract the first element if it's a list
        cost_category = action.get("CostCategory", "").lower()
        cost_score_map = {
            "small": 15,
            "medium": 10,
            "big": 5
        }
        cost_score_weight = weights.get("CostInvestmentNeeded", 1)
        cost_score = cost_score_map.get(cost_investment_needed, 0)
        score += (cost_score / 15) * SCORE_MAX * cost_score_weight

    print("Score after cost:", score)
    print("-------------")
    return score

class Action(BaseModel):
    action_id: str
    action_name: str
    actionPriority: float
    explanation: str
    city_name: str


class PrioritizedActions(BaseModel):
    actions: List[Action]

def send_to_llm(prompt):
    response = client.beta.chat.completions.parse(
        model="gpt-4o-2024-08-06",
        messages=[
            {
                "role": "system",
                "content": """
            You are a climate action expert, tasked to prioritize climate actions for cities.
             
            These are the rules to use for prioritizing a climate action for a city:
             
            - Lower cost actions are better than higher cost actions.
            - High emissions reductions are better than low emissions reductions.
            - High risk reduction is better than low risk reduction.
            - Actions that match the environment are better than those that don't.
            - Actions that match the population are better than those that don't.
            - Actions that take less time are better than those that take more time.
            - Taking into account the dependencies of the actions.
            - Take into account the emissions sector from the city data the action is in more emission sector impact should get better scoring
            - Take into account the city size actions that are more suitable to be implemented by the city size should get better scoring
            """,
            },
            {"role": "user", "content": prompt},
        ],
        response_format=PrioritizedActions,
    )
    return response.choices[0].message.parsed

def qualitative_score(city, action):
    # have to rework it later to choose x top actions not reason and score each of them
    prompt = f"""
    According to the rules given, how would you pick top 5 actions for the city.
    Here is top 20 actions:
    ###
    {action}
    ###
    Here is city data:
    ###
    {city}
    ###
    Pick only top 5 actions in the desired output format provided.
    """
    llm_response = send_to_llm(prompt)
    return llm_response

def quantitative_prioritizer(cities, actions):
    all_scores = []

    for action in actions:
        quant_score = quantitative_score(cities, action)
        all_scores.append({
            "city": cities.get("name", "Unknown City"),
            "action_id": action["ActionID"],  # Use ActionID for unique identification
            "action_type": action["ActionType"][0] if action["ActionType"] else "Unknown",
            "action_name": action["ActionName"],
            "quantitative_score": quant_score
            })

    sorted_scores = sorted(all_scores, key=lambda x: x["quantitative_score"], reverse=True)

    # Filter Adaptation and Mitigation actions
    adaptation_actions = [score for score in sorted_scores if score["action_type"] == "adaptation"]
    mitigation_actions = [score for score in sorted_scores if score["action_type"] == "mitigation"]

    # Return top 15 for each category
    return adaptation_actions[:15], mitigation_actions[:15]

def qualitative_prioritizer(top_quantitative, actions, city):
    qualitative_scores = []
    city_name = city.get("name", "Unknown City")
    city_locode = city.get("locode", "Unknown")
    city_region = city.get("region", "Unknown")
    city_regionName = city.get("regionName", "Unknown")
    llm_output = qualitative_score(city, top_quantitative)

    for action in llm_output.actions:
        qualitative_scores.append({
            "locode": city_locode,
            "cityName": city_name,
            "region": city_region,
            "regionName": city_regionName,
            "actionId": action.action_id,
            "actionName": action.action_name,
            "actionPriority": action.actionPriority,
            "explanation": action.explanation
        })
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
        with open(filename, "w", encoding='utf-8') as f:
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
    top_qualitative_adaptation = qualitative_prioritizer(top_adaptation, actions, cities)
    top_qualitative_mitigation = qualitative_prioritizer(top_mitigation, actions, cities)
    
    # Save outputs to separate files
    write_output(top_qualitative_adaptation, "output_adaptation.json")
    write_output(top_qualitative_mitigation, "output_mitigation.json")


if __name__ == "__main__":
    main()