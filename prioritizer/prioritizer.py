import os
import csv
from dotenv import load_dotenv
from openai import OpenAI
import argparse
import re

load_dotenv()

api_key = os.getenv("OPENAI_API_KEY")

client = OpenAI(api_key=api_key)


def send_to_llm(prompt):

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": """
            You are a climate action expert, tasked to prioritize climate actions for cities.
             
            These are the rules to use for prioritizing a climate action for a city:
             
            - lower cost actions are better than higher cost actions
            - High emissions reductions are better than low emissions reductions
            - High risk reduction is better than low risk reduction
            - Actions that match the environment are better than those that don't
            - Actions that match the population are better than those that don't
            - Actions that take less time are better than those that take more time
            """,
            },
            {"role": "user", "content": prompt},
        ],
    )
    return response.choices[0].message.content


def read_cities(city_file):
    cities = []
    with open(city_file, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Convert appropriate fields to integers, if not blank
            for field in ["population", "area", "budget", "total_emission", "energy_emissions", "transportation_emissions", "waste_emissions"]:
                if row[field]:
                    row[field] = int(row[field].replace(',', ''))
                else:
                    row[field] = ''
            cities.append(row)
    return cities


def read_actions(action_file):
    actions = []
    with open(action_file, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Convert appropriate fields to integers, if not blank
            for field in ["emissions_reduction", "population", "time_in_years", "cost"]:
                if row[field]:
                    row[field] = int(row[field].replace(',', ''))
                else:
                    row[field] = ''
            actions.append(row)
    return actions


def write_output(output_file, top_actions):
    print(top_actions)  # Debugging print statement
    with open(output_file, "w", newline='') as f:
        writer = csv.DictWriter(f, fieldnames=["city", "action", "score"])
        writer.writeheader()
        for action in top_actions:
            writer.writerow({"city": action['city']['name'], "action": action['action'], "score": action['score']})


# TODO: maybe prefilter actions that are not applicable to a city


def qualitative_score(city, action):
    prompt = f"""
    According to the rules given, how would you prioritize the following action for the city with name {city["name"]},
    population {city["population"]}, area {city["area"]}, environment {city["environment"]}, budget {city["budget"]},
    total GHG emissions in CO2eq {city["total_emission"]} energy {city["energy_emissions"]}, 
    transportation emissions {city["transportation_emissions"]}, waste emissions {city["waste_emissions"]} and risk {city["risk"]}?

    Action: {action["name"]}, cost {action["cost"]}, GHG emissions in CO2eq {action["emissions_reduction"]}, risk {action["risk_reduction"]}, environment {action["environment"]}, population {action["population"]}, time {action["time_in_years"]}

    Please return a score from 0 to 100, where 0 is the worst possible action and 100 is the best possible action.

    Response format: [SCORE]
    """

    score = send_to_llm(prompt)
    # Extract the score from the response
    match = re.search(r'\[(\d+)\]', score)
    if match:
        score = int(match.group(1))
    else:
        print("No match found")
        score = 0  # Default score if no match is found
    print(score)
    return score


# return a score from 0 to 100, each property counts for 16.67 "points"
# equal weighting per property

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


def quantitative_score(city, action):
    score = 0

    # Add score for emissions_reduction
    if action["emissions_reduction"] == '':
        score += 0
    else:
        action_emissions_reduction = action["emissions_reduction"]
        score += (
            min(action_emissions_reduction, MAX_EMISSIONS_REDUCTIONS)
            / MAX_EMISSIONS_REDUCTIONS
        ) * SCORE_MAX

    # Add score for risk_reduction
    if action["risk_reduction"] == '':
        score += 0
    else:
        score += scale_scores.get(action["risk_reduction"], 0) * SCORE_MAX

    # Add score for environment
    if action["environment"] == '':
        score += SCORE_MAX 
    else:
        score += SCORE_MAX if (action["environment"] == city["environment"]) else 0.0

    # Add score for population
    if action["population"] == '' or city["population"] == '':
        score += SCORE_MAX / 2.0
    else:
        city_population = city["population"]
        action_population = action["population"]
        if action_population == city_population:
            score += SCORE_MAX
        else:
            diff = abs(action_population - city_population)
            if diff == 0:
                ratio = 1.0
            else:
                ratio = min(city_population / diff, 1.0)
            score += ratio * SCORE_MAX

    # Add score for time_in_years
    if action["time_in_years"] == '':
        score += 0
    else:
        score += (
            1 - (min(action["time_in_years"], MAX_TIME_IN_YEARS) / MAX_TIME_IN_YEARS)
        ) * SCORE_MAX

    # Add score for cost
    if city["budget"] == '' or action["cost"] == '':
        score += 0
    else:
        city_budget = city["budget"]
        action_cost = action["cost"]
        if city_budget == 0:
            ratio = 1.0  # Avoid division by zero
        else:
            ratio = min(action_cost, city_budget) / city_budget
        score += (1 - ratio) * SCORE_MAX

    return score


# score one-by-one
def qualitative_prioritizer(cities, actions, number_of_actions=5):
    top_actions = []
    for city in cities:
        scores = {}
        for action in actions:
            scores[action["name"]] = qualitative_score(city, action)
        actions_keys = scores.keys()
        actions_keys = sorted(actions_keys, key=lambda x: scores[x], reverse=True)
        top_action_names = actions_keys[:number_of_actions]
        top_actions.extend(
            [
                {
                    "city": city,
                    "action": action,
                    "score": scores[action],
                }
                for action in top_action_names
            ]
        )
    return top_actions


def quantitative_prioritizer(cities, actions, number_of_actions=5):
    top_actions = []
    for city in cities:
        scores = {}
        for action in actions:
            scores[action['name']] = quantitative_score(city, action)
        actions_keys = scores.keys()
        actions_keys = sorted(actions_keys, key=lambda x: scores[x], reverse=True)
        top_action_names = actions_keys[:number_of_actions]
        top_actions.extend(
            [
                {
                    "city": city,
                    "action": action,
                    "score": scores[action],
                }
                for action in top_action_names
            ]
        )
    return top_actions


def main(city_file, action_file, output_file, quantitative, number_of_actions):
    cities = read_cities(city_file)
    actions = read_actions(action_file)
    if quantitative:
        top_actions = quantitative_prioritizer(cities, actions, number_of_actions)
    else:
        top_actions = qualitative_prioritizer(cities, actions, number_of_actions)
    write_output(output_file, top_actions)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("city_file")  # First positional argument
    parser.add_argument("action_file")  # Second positional argument
    parser.add_argument("output_file")  # Third positional argument
    parser.add_argument("--quantitative", action="store_true")  # Optional flag
    parser.add_argument("number_of_actions", type=int)  # Fourth positional argument
    args = parser.parse_args()

    main(
        args.city_file,
        args.action_file,
        args.output_file,
        args.quantitative,
        args.number_of_actions,
    )
