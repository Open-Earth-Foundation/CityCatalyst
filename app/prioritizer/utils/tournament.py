import random
import logging
from typing import Callable, Any, List, Tuple

# Setup logging configuration
logger = logging.getLogger(__name__)


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
