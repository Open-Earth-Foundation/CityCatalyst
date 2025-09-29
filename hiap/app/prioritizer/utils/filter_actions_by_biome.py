import logging
from typing import List, Dict

# Setup logging configuration
logger = logging.getLogger(__name__)


def filter_actions_by_biome(city: dict, actions: List[dict]) -> List[dict]:
    """
    Filter actions based on city's biome only if both city and action have biomes defined.
    Actions without a biome field are included in the output.
    If city has no biome, return all actions unfiltered.
    """

    logger.info(f"Filtering actions by biome for city: {city['locode']}")
    logger.info(
        f"Number of total actions (mitigation and adaptation) before filtering: {len(actions)}"
    )

    city_biome = city.get("biome")

    actions_final = []
    skipped_actions = 0
    if not city_biome:
        logger.info("City has no biome, returning all actions.")
        return actions
    else:
        logger.debug(f"City biome: {city_biome}")

        for action in actions:
            action_biome = action.get("biome")
            logger.debug(f"Action biome: {action_biome}")
            if action_biome:
                # If the action biome matches the city biome, add the action to the list
                if action_biome == city_biome:
                    actions_final.append(action)
                else:
                    # If the action biome does not match the city biome, skip the action
                    # and increment the counter
                    skipped_actions += 1
                    continue
            else:
                # If there is no biome, add the action to the list
                actions_final.append(action)

    logger.info(f"Actions skipped by filtering: {skipped_actions}")
    logger.info(
        f"Actions final after filtering (mitigation and adaptation): {len(actions_final)}"
    )
    return actions_final
