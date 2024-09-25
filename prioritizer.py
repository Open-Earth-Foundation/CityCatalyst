import os


def read_cities(args):
    pass


def read_actions(args):
    pass


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

    Given these rules, how would you prioritize the following actions for the city of {city} with name {city.Name}, population {city.population},
    area {city.area}, environment	{city.environment}, budget {city.budget}, total GHG emissions in CO2eq {city.total_emission} energy {city.energy_emissions}, transportation emissions {city.transportation_emissions}, waste emissions {city.waste_emissions} and risk
    {city.risk}?

    Action: {action.Name}, cost {action.cost}, GHG emissions in CO2eq {action.emissions}, risk {action.risk}, environment {action.environment}, population {action.population}, time {action.time}

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
def qualitative_prioritizer(cities, actions):
    score = {}
    for city in cities:
        score[city] = {}
        for action in actions:
            score[city][action] = qualitative_score(city, action)
    # Get actions with maximum score
    pass


def quantitative_prioritizer(cities, actions):
    score = {}
    for city in cities:
        score[city] = {}
        for action in actions:
            score[city][action] = quantitative_score(city, action)
    # Get actions with maximum score
    pass


def prioritized_actions(cities, actions, args):
    if quantitative_prioritizer(args):
        return prioritize_by_quantitative(cities, actions)
    else:
        return prioritize_by_qualitative(cities, actions)


def main(args):
    cities = read_cities(args)
    actions = read_actions(args)
    top_actions = prioritized_actions(cities, actions, args)
    write_output(top_actions, args)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--city-file", required=True)
    parser.add_argument("--action-file", required=True)
    parser.add_argument("--output-file", required=True)
    parser.add_argument("--quantitative", action="store_true")
    args = parser.parse_args()
    main(args)
