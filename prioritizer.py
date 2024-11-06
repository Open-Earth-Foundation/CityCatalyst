import os
import csv
from dotenv import load_dotenv
from openai import OpenAI
import re

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
    with open(ACTION_FILE, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            for field in [
                "emissions_reduction", "population", "time_in_years", "cost"
            ]:
                if row[field]:
                    row[field] = int(row[field].replace(",", ""))
                else:
                    row[field] = None
            actions.append(row)
    return actions


def quantitative_score(city, action):
    score = 0

    if action["emissions_reduction"]:
        score += (
            min(action["emissions_reduction"], MAX_EMISSIONS_REDUCTIONS)
            / MAX_EMISSIONS_REDUCTIONS
        ) * SCORE_MAX

    if action["risk_reduction"]:
        score += scale_scores.get(action["risk_reduction"], 0) * SCORE_MAX

    if action["environment"] == city["environment"]:
        score += SCORE_MAX

    if action["population"] and city["population"]:
        diff = abs(action["population"] - city["population"])
        ratio = min(city["population"] / diff, 1.0) if diff else 1.0
        score += ratio * SCORE_MAX

    if action["time_in_years"]:
        score += (1 - (min(action["time_in_years"], MAX_TIME_IN_YEARS) / MAX_TIME_IN_YEARS)) * SCORE_MAX

    if city["budget"] and action["cost"]:
        ratio = min(action["cost"], city["budget"]) / city["budget"] if city["budget"] else 1.0
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
