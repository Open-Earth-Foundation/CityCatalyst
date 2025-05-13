import random
import logging
from typing import Callable, Any, List, Tuple


def single_elimination_bracket(
    city: dict, actions: List[dict], comparator: Callable[[dict, dict, dict], int]
) -> Tuple[Any, List[dict]]:
    """
    Performs a single-elimination bracket on the given list of actions,
    with a wildcard if there's an odd number of participants.
    Uses the provided comparator function to determine winners.

    Returns:
      winner  - the single best from this bracket
      losers  - all other participants (who lost at some stage)
    """
    if not actions:
        return None, []

    random.shuffle(actions)
    wildcard = None
    if len(actions) % 2 == 1:
        wildcard = actions.pop()

    winners = []
    losers = []

    for i in range(0, len(actions), 2):
        if i + 1 < len(actions):
            actionA = actions[i]
            actionB = actions[i + 1]
            try:
                print(
                    f"Comparing actions: {actionA['ActionID']} and {actionB['ActionID']}"
                )
                print(f"City: {city['locode']}")
                result = comparator(city, actionA, actionB)
                if result == 1:
                    winners.append(actionA)
                    losers.append(actionB)
                else:
                    winners.append(actionB)
                    losers.append(actionA)
            except Exception as e:
                logging.error(f"Error comparing actions: {e}")
                continue

    if wildcard:
        winners.append(wildcard)

    if len(winners) == 1:
        return winners[0], losers
    else:
        final_winner, final_losers = single_elimination_bracket(
            city, winners, comparator
        )
        return final_winner, losers + final_losers


# def final_bracket_for_ranking(
#     actions: List[dict], city: dict, comparator: Callable[[dict, dict, dict], int]
# ) -> List[dict]:
#     """
#     When we have fewer than 40 participants left, we do a final bracket
#     that fully orders them from best to worst.
#     This simply calls single_elimination_bracket repeatedly until no
#     participants remain, collecting winners in order.
#     Returns:
#       ranking (list): from best to worst among the given actions.
#     """
#     participants = actions[:]
#     ranking = []
#     rank = 1

#     while participants:
#         winner, losers = single_elimination_bracket(participants, city, comparator)
#         if not winner:
#             logging.debug("  No winner found, breaking")
#             break
#         logging.debug(f"  Rank #{rank}: {winner.get('ActionID', 'Unknown')}")
#         ranking.append(winner)
#         participants = losers
#         rank += 1

#     logging.debug(f"=== Final bracket complete. Ranked {len(ranking)} actions ===")
#     return ranking


def tournament_ranking(
    city: dict,
    actions: List[dict],
    comparator: Callable[[dict, dict, dict], int],
    top_n: int = 20,
) -> List[tuple]:
    """
    Repeatedly runs single elimination brackets, where losers compete in subsequent brackets
    to determine the next ranks. Continues until we have top_n ranked actions.
    Returns:
      A list of (action, rank_index).
    """
    logging.info(
        f"\n\n========== STARTING TOURNAMENT RANKING WITH {len(actions)} ACTIONS =========="
    )
    remaining = actions[:]
    full_ranking = []
    current_rank = 1

    while remaining and current_rank <= top_n:
        winner, losers = single_elimination_bracket(city, remaining, comparator)
        if not winner:
            logging.debug("No winner found, breaking")
            break
        logging.debug(f"Rank #{current_rank}: {winner.get('ActionID', 'Unknown')}")
        full_ranking.append((winner, current_rank))
        current_rank += 1
        remaining = losers

    logging.info(
        f"\n========== TOURNAMENT RANKING COMPLETE. RANKED {len(full_ranking)} ACTIONS =========="
    )
    return full_ranking
