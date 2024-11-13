import os
import csv
from dotenv import load_dotenv
from openai import OpenAI
import re
import json
import pandas as pd

load_dotenv()

api_key = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=api_key)

# Constants for quantitative scoring
SCORE_MAX = 100 / 6
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

# File paths
OUTPUT_FILE = "new_output.json"

def send_to_llm(prompt):
    response = client.chat.completions.create(
        model="gpt-4o",
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
            """,
            },
            {"role": "user", "content": prompt},
        ],
    )
    return response.choices[0].message.content

def read_city_inventory():
    # Load both CSV files into DataFrames
    activities_df = pd.read_csv("CAP_data/activities_one_row_per_activity.csv")
    gases_df = pd.read_csv("CAP_data/activities_one_row_per_gas.csv")
    
    # Merge the two DataFrames on the 'id' column
    combined_df = activities_df.merge(gases_df, on='id', suffixes=('_activity', '_gas'), how='left')

    # Process and clean numeric fields as needed
    for field in ["co2eq", "co2eq_years", "activity_value", "co2eq-2", "gas_amount", "emissions_per_activity"]:
        if field in combined_df.columns:
            combined_df[field] = combined_df[field].replace(",", "", regex=True).astype(float)
    
    # Aggregating data by city (assuming all entries in the combined DataFrame belong to a single city)
    city_data = {
        "total_co2eq": combined_df.get("co2eq", pd.Series(0)).sum(),
        "total_activity_value": combined_df.get("activity_value", pd.Series(0)).sum(),
        "average_emissions_per_activity": combined_df.get("emissions_per_activity", pd.Series(0)).mean(),
        "total_gas_amount": combined_df.get("gas_amount", pd.Series(0)).sum(),
        # Add other aggregated fields as necessary
    }
    
    # Wrapping in a list to keep compatibility with original function structure
    return [city_data]

def read_actions():
    actions = []
    with open("CAP_actions/example_3.json", "r") as f:
        data = json.load(f)
        for item in data:
            action = {
                "ActionID": item.get("ActionID"), 
                "ActionName": item.get("ActionName"), 
                "ActionType": item.get("ActionType"),
                "AdaptationCategory": item.get("AdaptationCategory"),
                "Hazard": item.get("Hazard"),
                "Sector": item.get("Sector"),
                "Subsector": item.get("Subsector"),
                "PrimaryPurpose": item.get("PrimaryPurpose"),
                "InterventionType": item.get("InterventionType"),
                "Description": item.get("Description"),
                "BehaviouralChangeTargeted": item.get("BehaviouralChangeTargeted"),
                "CoBenefits": item.get("CoBenefits"),
                "EquityAndInclusionConsiderations": item.get("EquityAndInclusionConsiderations"),
                "GHGReductionPotential": item.get("GHGReductionPotential"),
                "AdaptationEffectiveness": item.get("AdaptationEffectiveness"),
                "CostInvestmentNeeded": item.get("CostInvestmentNeeded"),
                "TimelineForImplementation": item.get("TimelineForImplementation"),
                "Dependencies": item.get("Dependencies"),
                "KeyPerformanceIndicators": item.get("KeyPerformanceIndicators"),
                "Impacts": item.get("Impacts"),
            }
            actions.append(action)
    return actions

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
    score = 0
    # Emissions reduction score
    energy_reduction_str = action["GHGReductionPotential"].get("energy", "none")
    if energy_reduction_str != "none":
        energy_reduction_str = energy_reduction_str.replace("%", "")
        if "-" in energy_reduction_str:
            emissions_range = energy_reduction_str.split("-")
            emissions_reduction = sum(map(float, emissions_range)) / len(emissions_range) / 100
        else:
            emissions_reduction = float(energy_reduction_str) / 100
        score += (min(emissions_reduction, MAX_EMISSIONS_REDUCTIONS) / MAX_EMISSIONS_REDUCTIONS) * SCORE_MAX

    # Adaptation effectiveness score
    adaptation_effectiveness = action.get("AdaptationEffectiveness")
    if adaptation_effectiveness in scale_scores:
        score += scale_scores[adaptation_effectiveness] * SCORE_MAX

    # Time in years score
    if action["TimelineForImplementation"]:
        time_str = action["TimelineForImplementation"].replace("<", "").replace(">", "").replace(" years", "").strip()
        if "-" in time_str:
            time_values = time_str.split("-")
            time_in_years = sum(map(float, time_values)) / len(time_values)
        else:
            time_in_years = float(time_str)
        score += (1 - (min(time_in_years, MAX_TIME_IN_YEARS) / MAX_TIME_IN_YEARS)) * SCORE_MAX

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
        print(cost_investment_needed)
        cost_score = cost_score_map.get(cost_investment_needed, 0)
        score += (cost_score / 15) * SCORE_MAX
        #ratio = action["CostInvestmentNeeded"] / MAX_COST if action["CostInvestmentNeeded"] else 1
        #score += (1 - ratio) * SCORE_MAX

    return score

def qualitative_score(city, action):
    # have to rework it later to choose x top actions not reason and score each of them
    prompt = f"""
    According to the rules given, how would you prioritize the following action for the city,
    {action}
    Response format: [SCORE] | [REASONING]
    """
    llm_response = send_to_llm(prompt)
    match = re.search(r"\[(\d+)\]", llm_response)
    score = int(match.group(1)) if match else 0
    return score, llm_response

def quantitative_prioritizer(cities, actions):
    all_scores = []
    for city in cities:
        for action in actions:
            quant_score = quantitative_score(city, action)
            all_scores.append({
                "city": "Unknown City",
                "action": action["ActionName"],
                "quantitative_score": quant_score
            })
    sorted_scores = sorted(all_scores, key=lambda x: x["quantitative_score"], reverse=True)
    return sorted_scores[:20]  # Top 20 actions

def qualitative_prioritizer(top_quantitative, actions):
    qualitative_scores = []
    for entry in top_quantitative:
        action_name = entry["action"]
        action = next((a for a in actions if a["ActionName"] == action_name), None)
        if action:
            qual_score, llm_output = qualitative_score({}, action)
            qualitative_scores.append({
                "city": "Unknown City",
                "action": action_name,
                "quantitative_score": entry["quantitative_score"],
                "qualitative_score": qual_score,
                "llm_output": llm_output
            })
    return qualitative_scores

def write_output(top_actions):
    output_dir = os.path.dirname(OUTPUT_FILE)
    try:
        os.makedirs(output_dir, exist_ok=True)
    except OSError as e:
        print("Error creating output directory:", e)
    except Exception as e:
        print("Unexpected error creating output directory:", e)
    try:
        with open(OUTPUT_FILE, "w") as f:
            json.dump(top_actions, f, indent=4)
    except Exception as e:
        print("Error writing to output file:", e)
    print("Finished writing to output file")

def main():
    cities = read_city_inventory()
    actions = read_actions()
    top_quantitative = quantitative_prioritizer(cities, actions)
    top_qualitative = qualitative_prioritizer(top_quantitative, actions)
    write_output(top_qualitative)

if __name__ == "__main__":
    main()