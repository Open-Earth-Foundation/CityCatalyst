from typing import Dict, Tuple


def build_prompt_inputs(
    city_data: Dict,
    action_data: Dict,
    action_type: str,
) -> Tuple[Dict, Dict]:
    """
    Return shallow-copied dictionaries of city and action data with
    irrelevant keys removed for prompt construction.

    This function mirrors the pruning logic used by both the prioritizer
    (explanations) and the plan creator (agent_1).

    Args:
        city_data: Original city data dictionary.
        action_data: Original action data dictionary.
        action_type: Either "mitigation" or "adaptation".

    Returns:
        A tuple of (city_data_for_prompt, action_data_for_prompt).
    """

    city_data_for_prompt = city_data.copy()
    action_data_for_prompt = action_data.copy()

    if action_type == "mitigation":
        city_data_for_prompt.pop("ccra", None)
        action_data_for_prompt.pop("Hazard", None)
        action_data_for_prompt.pop("AdaptationEffectiveness", None)
        action_data_for_prompt.pop("AdaptationEffectivenessPerHazard", None)

    elif action_type == "adaptation":
        city_data_for_prompt.pop("stationaryEnergyEmissions", None)
        city_data_for_prompt.pop("transportationEmissions", None)
        city_data_for_prompt.pop("wasteEmissions", None)
        city_data_for_prompt.pop("ippuEmissions", None)
        city_data_for_prompt.pop("afoluEmissions", None)
        city_data_for_prompt.pop("totalEmissions", None)
        action_data_for_prompt.pop("GHGReductionPotential", None)

    # Common removals
    city_data_for_prompt.pop("biome", None)
    action_data_for_prompt.pop("Biome", None)
    action_data_for_prompt.pop("Dependencies", None)
    action_data_for_prompt.pop("KeyPerformanceIndicators", None)
    action_data_for_prompt.pop("EquityAndInclusionConsiderations", None)
    action_data_for_prompt.pop("PrimaryPurpose", None)

    return city_data_for_prompt, action_data_for_prompt
