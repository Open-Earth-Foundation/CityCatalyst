from pathlib import Path
import json

BASE_DIR = Path(__file__).resolve().parent.parent
ACTION_DATA_PATH = BASE_DIR / "CAP_data/long_actions.json"
CITY_DATA_PATH = BASE_DIR / "CAP_data/city_data.json"
OUTPUT_FILE = BASE_DIR / "new_output.json"

# Set constants for file paths
BASE_DIR = Path("../data")
ACTION_DATA_PATH = BASE_DIR / "climate_actions/output/combined_output.json"
CITY_DATA_PATH = BASE_DIR / "cities/city_data.json"
OUTPUT_PATH = BASE_DIR / "prioritized/"


def read_city_inventory(locode: str) -> dict:
    """
    Reads city inventory data from a JSON file.

    Returns:
        dict: The city inventory data.
    """
    city_data_path = CITY_DATA_PATH
    with city_data_path.open("r", encoding="utf-8") as f:
        city_data = json.load(f)
    # return city_data[0]  # Adjust as needed for multiple cities

    # Find the city by name
    for city in city_data:
        if city["locode"] == locode:
            return city

    # Return None if city is not found
    # print(f"City '{city_name}' not found in the data.")
    raise ValueError(f"City with locode '{locode}' not found in the data.")


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
                "EquityAndInclusionConsiderations": item.get(
                    "EquityAndInclusionConsiderations"
                ),
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


def write_output(top_actions, filename):

    full_path = OUTPUT_PATH / filename
    try:
        # Create the output directory if it doesn't exist
        OUTPUT_PATH.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        print("Error creating output directory:", e)
        return
    except Exception as e:
        print("Unexpected error creating output directory:", e)
        return

    try:
        # Write JSON data to the specified file
        with full_path.open("w", encoding="utf-8") as f:
            json.dump(top_actions, f, indent=4)
        print(f"Successfully wrote to {filename}.")
    except Exception as e:
        print(f"Error writing to {filename}:", e)
