import os
import csv


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

    prompt = """
    here are the rules for prioritizing a climate action for a city:

    - lower cost actions are better than higher cost actions
    - High emissions reductions are better than low emissions reductions
    - High risk reduction is better than low risk reduction
    - Actions that match the environment are better than those that don't
    - Actions that match the population are better than those that don't
    - Actions that take less time are better than those that take more time

    Given these rules, how would you prioritize the following action for the city of {city} with name {city.Name}, population {city.population},
    area {city.area}, environment	{city.environment}, budget {city.budget}, total GHG emissions in CO2eq {city.total_emission} energy {city.energy_emissions}, transportation emissions {city.transportation_emissions}, waste emissions {city.waste_emissions} and risk
    {city.risk}?

    Action: {action.Name}, cost {action.cost}, GHG emissions in CO2eq {action.emissions}, risk {action.risk}, environment {action.environment}, population {action.population}, time {action.time_in_years}

    Please return a score from 0 to 100, where 0 is the worst possible action and 100 is the best possible action.

    """

    score = send_to_llm(prompt)
    return score


# return a score from 0 to 100, each property counts for 16.67 "points"
# equal weighting per property

SCORE_MAX = 100/6

def quantitative_score(city, action):
    score = 0
    score += (1 / action.cost) * SCORE_MAX
    # scores added
    pass


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
