from pathlib import Path
import json

BASE_DIR = Path(__file__).resolve().parent.parent
ACTION_DATA_PATH = BASE_DIR / "CAP_data/long_actions.json"
CITY_DATA_PATH = BASE_DIR / "CAP_data/city_data.json"
OUTPUT_FILE = BASE_DIR / "new_output.json"


def read_city_inventory():
    """
    Reads city inventory data from a JSON file.

    Returns:
        dict: The city inventory data.
    """
    city_data_path = CITY_DATA_PATH
    with city_data_path.open("r", encoding="utf-8") as f:
        city_data = json.load(f)
    return city_data[0]  # Adjust as needed for multiple cities

def read_actions():
    actions = []
    with open(ACTION_DATA_PATH, "r") as f:
        data = json.load(f)
        for item in data:
            action = {
                "ActionID": item.get("ActionID"), 
                "ActionName": item.get("ActionName"), 
                "ActionType": item.get("ActionType"),
                "AdaptationCategory": item.get("AdaptationCategory"),
                "Hazard": item.get("Hazard"),
                "Sector": item.get("Sector"),
                "Subsector": item.get("Subsector"),
                "PrimaryPurpose": item.get("PrimaryPurpose"),
                "InterventionType": item.get("InterventionType"),
                "Description": item.get("Description"),
                "BehaviouralChangeTargeted": item.get("BehaviouralChangeTargeted"),
                "CoBenefits": item.get("CoBenefits"),
                "EquityAndInclusionConsiderations": item.get("EquityAndInclusionConsiderations"),
                "GHGReductionPotential": item.get("GHGReductionPotential"),
                "AdaptationEffectiveness": item.get("AdaptationEffectiveness"),
                "CostInvestmentNeeded": item.get("CostInvestmentNeeded"),
                "TimelineForImplementation": item.get("TimelineForImplementation"),
                "Dependencies": item.get("Dependencies"),
                "KeyPerformanceIndicators": item.get("KeyPerformanceIndicators"),
                "Impacts": item.get("Impacts"),
            }
            actions.append(action)
    return actions

def count_matching_hazards(city, action):
    city_hazards = set(city.get("hazards", []))
    if action.get("Hazard") is None:
        return 0
    action_hazards = set(action.get("Hazard", []))
    
    matching_hazards = city_hazards.intersection(action_hazards)
    
    return len(matching_hazards)

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
    highest_percentage = (highest_value / total_emissions) * 100
    
    return highest_emission, highest_percentage


