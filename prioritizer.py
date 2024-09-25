import os
import csv
from dotenv import load_dotenv
from openai import OpenAI

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
            cities.append(row)
    return cities


def read_actions(action_file):
    actions = []
    with open(action_file, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            actions.append(row)
    return actions


def write_output(output_file, top_actions):
    with open(output_file, "w") as f:
        writer = csv.DictWriter(f, fieldnames=["city", "action", "score"])
        writer.writeheader()
        for city, action, score in top_actions:
            writer.writerow({"city": city, "action": action, "score": score})


# TODO: maybe prefilter actions that are not applicable to a city


def qualitative_score(city, action):

    prompt = f"""
    According to the rules given, how would you prioritize the following action for the city of with name {city["name"]}, population {city["population"]},
    area {city["area"]}, environment {city["environment"]}, budget {city["budget"]}, total GHG emissions in CO2eq {city["total_emission"]} energy {city["energy_emissions"]}, transportation emissions {city["transportation_emissions"]}, waste emissions {city["waste_emissions"]} and risk
    {city["risk"]}?

    Action: {action["name"]}, cost {action["cost"]}, GHG emissions in CO2eq {action["emissions"]}, risk {action["risk"]}, environment {action["environment"]}, population {action["population"]}, time {action["time_in_years"]}

    Please return a score from 0 to 100, where 0 is the worst possible action and 100 is the best possible action.

    Response format: [SCORE]

    """

    score = send_to_llm(prompt)
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
    score += (
        min(action["emissions_reduction"], MAX_EMISSIONS_REDUCTIONS)
        / MAX_EMISSIONS_REDUCTIONS
    ) * SCORE_MAX
    # Add score for risk_reduction
    score += scale_scores[action["risk"]] * SCORE_MAX
    # Add score for environment
    score += SCORE_MAX if (action["environment"] == city["environment"]) else 0.0
    # Add score for population
    if action["population"] is None:
        score += SCORE_MAX / 2.0
    else:
        score += (
            min(
                city["population"] / abs(action["population"] - city["population"]), 1.0
            )
            * SCORE_MAX
        )
    # Add score for time_in_years
    score += (
        1 - (min(action["time_in_years"], MAX_TIME_IN_YEARS) / MAX_TIME_IN_YEARS)
    ) * SCORE_MAX
    # Add score for cost
    # TODO: we are treating the budget as if all of it can be devoted
    # to climate actions. check this!
    score += (1 - (min(action["cost"], city["budget"]) / city["budget"])) * SCORE_MAX
    # scores added
    return score


# score one-by-one
def qualitative_prioritizer(cities, actions, number_of_actions=5):
    top_actions = []
    for city in cities:
        scores = {}
        for action in actions:
            scores[action] = qualitative_score(city, action)
        actions = scores.keys()
        actions = sorted(actions, key=lambda x: scores[x], reverse=True)
        top_action_names = actions[:number_of_actions]
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
            scores[action] = quantitative_score(city, action)
        actions = scores.keys()
        actions = sorted(actions, key=lambda x: scores[x], reverse=True)
        top_action_names = actions[:number_of_actions]
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
    pass


def main(city_file, action_file, output_file, quantitative, number_of_actions):
    cities = read_cities(city_file)
    actions = read_actions(action_file)
    if quantitative:
        top_actions = quantitative_prioritizer(cities, actions, number_of_actions)
    else:
        top_actions = qualitative_prioritizer(cities, actions, number_of_actions)
    write_output(top_actions, output_file)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--city-file", required=True)
    parser.add_argument("--action-file", required=True)
    parser.add_argument("--output-file", required=True)
    parser.add_argument("--quantitative", action="store_true")
    parser.add_argument("--number-of-actions", type=int, default=5)
    args = parser.parse_args()
    main(
        args.city_file,
        args.action_file,
        args.output_file,
        args.quantitative,
        args.number_of_actions,
    )
