import os
import csv
from dotenv import load_dotenv
from openai import OpenAI
import re
import json

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
CITY_INVENTORY_FILE = "CAP_data/city_inventory.csv"
ACTION_FILE = "path/to/long_list_action.csv"
OUTPUT_FILE = "path/to/output.csv"


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
    inventory_data = []
    with open(CITY_INVENTORY_FILE, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            for field in [
                "co2eq", "co2eq_years", "activity_value", "co2eq-2", 
                "gas_amount", "emissions_per_activity"
            ]:
                if row[field]:
                    row[field] = float(row[field].replace(",", ""))
                else:
                    row[field] = None
            inventory_data.append(row)
    return inventory_data


def read_actions():
    actions = []
    with open("EXAMPLE_3.JSON", "r") as f:
        data = json.load(f)
        for item in data:
            action = {
                "ActionID": item.get("ActionID"), 
                "ActionName": item.get("ActionName"), 
                "ActionType": item.get("ActionType"), # string category adaptation or mitigation
                "AdaptationCategory": item.get("AdaptationCategory"), # string pointing to a category in c40 list (ecoengineering, infrastructure, etc)
                
                "Hazard": item.get("Hazard"), #  # only for adaptation actions 
                "Sector": item.get("Sector"), #
                "Subsector": item.get("Subsector"), #
                "PrimaryPurpose": item.get("PrimaryPurpose"), ##
                # probably a city data will have data on what and how they want to do 
                "InterventionType": item.get("InterventionType"), ###  # there are 5 categories of it in the notion
                "Description": item.get("Description"), ###
                "BehaviouralChangeTargeted": item.get("BehaviouralChangeTargeted"), ###
                "CoBenefits": item.get("CoBenefits"), ###
                "EquityAndInclusionConsiderations": item.get("EquityAndInclusionConsiderations"), ###
                # this will be categories 10-15 15-20 and so on per sector - look for a sector in the inventory
                "GHGReductionPotential": item.get("GHGReductionPotential"), # 
                # low medium or high - where higher is better
                "AdaptationEffectiveness": item.get("AdaptationEffectiveness"), #
                # also high medium low where low is better
                "CostInvestmentNeeded": item.get("CostInvestmentNeeded"), #
                # 
                "TimelineForImplementation": item.get("TimelineForImplementation"), #
                "Dependencies": item.get("Dependencies"),#
                "KeyPerformanceIndicators": item.get("KeyPerformanceIndicators"),##
                "Impacts": item.get("Impacts"), #
            }
            actions.append(action)
    return actions


def quantitative_score(city, action):
    score = 0

    # Emissions reduction score
    if action["GHGReductionPotential"]["energy"] != "none":
        emissions_reduction = float(action["GHGReductionPotential"]["energy"].replace("%", "")) / 100
        score += (min(emissions_reduction, MAX_EMISSIONS_REDUCTIONS) / MAX_EMISSIONS_REDUCTIONS) * SCORE_MAX

    # Adaptation effectiveness score
    if action["AdaptationEffectiveness"]:
        score += scale_scores.get(action["AdaptationEffectiveness"], 0) * SCORE_MAX

    # Environment match score
    if action["Sector"] and city["environment"] in action["Sector"]:
        score += SCORE_MAX

    # Population match score - used when we have city data 
    #if city["population"]:
    #    diff = abs(city["population"] - city["population"]) 
    #    ratio = min(city["population"] / diff, 1.0) if diff else 1.0
    #    score += ratio * SCORE_MAX

    # Time in years score
    if action["TimelineForImplementation"]:
        time_in_years = int(action["TimelineForImplementation"].replace("<", "").replace(">", "").replace(" years", ""))
        score += (1 - (min(time_in_years, MAX_TIME_IN_YEARS) / MAX_TIME_IN_YEARS)) * SCORE_MAX

    # Cost score (assuming cost is not provided in the JSON)
    if city["budget"]:
        ratio = min(city["budget"], city["budget"]) / city["budget"] if city["budget"] else 1.0
        score += (1 - ratio) * SCORE_MAX

    return score


def qualitative_score(city, action):
    prompt = f"""
    According to the rules given, how would you prioritize the following action for the city with name {city["name"]},
    population {city["population"]}, area {city["area"]}, environment {city["environment"]}, budget {city["budget"]},
    total GHG emissions in CO2eq {city["total_emission"]}, energy {city["energy_emissions"]}, 
    transportation emissions {city["transportation_emissions"]}, waste emissions {city["waste_emissions"]}, and risk {city["risk"]}?

    Action: {action["name"]}, cost {action["cost"]}, GHG emissions reduction in CO2eq {action["emissions_reduction"]}, risk reduction {action["risk_reduction"]}, environment {action["environment"]}, population {action["population"]}, time {action["time_in_years"]}

    Please return a score from 0 to 100, where 0 is the worst possible action and 100 is the best possible action.

    Response format: [SCORE]
    """
    llm_response = send_to_llm(prompt)
    match = re.search(r"\[(\d+)\]", llm_response)
    score = int(match.group(1)) if match else 0
    return score, llm_response


def quantitative_prioritizer(cities, actions):
    all_scores = []
    for city in cities:
        scores = {}
        for action in actions:
            score = quantitative_score(city, action)
            scores[action["name"]] = score
            all_scores.append({
                "city": city["name"],
                "action": action["name"],
                "score": score
            })
    sorted_scores = sorted(all_scores, key=lambda x: x["score"], reverse=True)
    return sorted_scores[:20]  # Top 20 actions


def qualitative_prioritizer(top_quantitative):
    qualitative_scores = []
    for entry in top_quantitative:
        city, action = entry["city"], entry["action"]
        score, llm_output = qualitative_score(city, action)
        qualitative_scores.append({
            "city": city,
            "action": action,
            "score": score,
            "llm_output": llm_output
        })
    return qualitative_scores


def write_output(top_actions):
    with open(OUTPUT_FILE, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["city", "action", "score", "llm_output"])
        writer.writeheader()
        for action in top_actions:
            writer.writerow(action)


def main():
    cities = read_city_inventory()
    actions = read_actions()
    top_quantitative = quantitative_prioritizer(cities, actions)
    top_qualitative = qualitative_prioritizer(top_quantitative)
    write_output(top_qualitative)


if __name__ == "__main__":
    main()
