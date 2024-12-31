import json

def load_mappings():
    """
    Load mappings used across various scoring functions.
    """
    scale_adaptation_effectiveness = {"low": 0.33, "medium": 0.66, "high": 0.99}
    timeline_mapping = {"<5 years": 1.0, "5-10 years": 0.5, ">10 years": 0.0}
    ghgi_potential_mapping = {
        "0-19": 0.20,
        "20-39": 0.4,
        "40-59": 0.6,
        "60-79": 0.8,
        "80-100": 1.0,
    }
    return {
        "adaptation_effectiveness": scale_adaptation_effectiveness,
        "timeline": timeline_mapping,
        "ghgi_potential": ghgi_potential_mapping,
    }

def count_matching_hazards(city, action):
    city_hazards = {entry["hazard"] for entry in city.get("ccra", []) if entry["normalised_risk_score"] > 0.5}
    action_hazards = set(action.get("Hazard", [])) if action.get("Hazard") else set()
    return len(city_hazards.intersection(action_hazards))

def dependency_count_score(action):
    return len(action.get("Dependencies", []))

def calculate_emissions_reduction(city, action):
    reduction_mapping = {
        "0-19": 0.1,
        "20-39": 0.3,
        "40-59": 0.5,
        "60-79": 0.7,
        "80-100": 0.9,
    }
    total_reduction = 0
    ghg_potential = action.get("GHGReductionPotential", {})
    if not ghg_potential:
        return 0

    sectors = {
        "stationary_energy": "stationaryEnergyEmissions",
        "transportation": "transportationEmissions",
        "waste": "wasteEmissions",
        "ippu": "industrialProcessEmissions",
        "afolu": "landUseEmissions",
    }

    for sector, city_emission_key in sectors.items():
        reduction_str = ghg_potential.get(sector)
        if reduction_str in reduction_mapping:
            reduction_percentage = reduction_mapping[reduction_str]
            city_emission = city.get(city_emission_key, 0)
            total_reduction += city_emission * reduction_percentage
    total_reduction_percentage = total_reduction / city.get("totalEmissions", 1)
    return total_reduction_percentage

def adaptation_effectiveness_score(action):
    mappings = load_mappings()
    effectiveness = action.get("AdaptationEffectiveness")
    return mappings["adaptation_effectiveness"].get(effectiveness, 0)

def time_implementation_score(action, mappings):
    timeline_str = action.get("TimelineForImplementation", "")
    return mappings["timeline"].get(timeline_str, 0)

def cost_score(action, mappings):
    cost_level = action.get("CostInvestmentNeeded")
    return mappings["adaptation_effectiveness"].get(cost_level, 0)

def find_highest_emission(city):
    emission_keys = [
        "stationaryEnergyEmissions",
        "transportationEmissions",
        "wasteEmissions",
        "industrialProcessEmissions",
        "landUseEmissions",
        "scope1Emissions",
        "scope2Emissions",
        "scope3Emissions"
    ]

    highest_emission = None
    highest_value = 0

    for key in emission_keys:
        if city.get(key, 0) > highest_value:
            highest_value = city[key]
            highest_emission = key

    total_emissions = city.get("totalEmissions", 1)  # Avoid division by zero
    highest_percentage = (highest_value / total_emissions)

    return highest_emission, highest_percentage
