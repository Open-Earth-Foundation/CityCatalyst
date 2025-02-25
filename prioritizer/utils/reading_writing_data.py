from pathlib import Path
import json
import sys

BASE_DIR = Path(__file__).resolve().parent.parent
# ACTION_DATA_PATH = BASE_DIR / "CAP_data/long_actions.json"
# CITY_DATA_PATH = BASE_DIR / "CAP_data/city_data.json"
# OUTPUT_FILE = BASE_DIR / "new_output.json"

# Set constants for file paths
# BASE_DIR = Path("../data")
ACTION_DATA_PATH = BASE_DIR / "../data/climate_actions/output/merged.json"
CITY_DATA_PATH = BASE_DIR / "../data/cities/city_data.json"
OUTPUT_PATH = BASE_DIR / "../data/prioritized/"


def read_city_inventory(locode: str) -> dict:
    """
    Reads city inventory data from a JSON file.

    Returns:
        dict: The city inventory data.
    """
    city_data_path = CITY_DATA_PATH
    with city_data_path.open("r", encoding="utf-8") as f:
        city_data = json.load(f)

    if not city_data:
        print("City data is empty.")
        sys.exit(1)

    # Find the city by its 'locode'
    for city in city_data:
        if city["locode"] == locode:
            return city

    raise ValueError(f"City with locode '{locode}' not found in the data.")


def read_actions():
    """
    Reads action data from the defined ACTION_DATA_PATH and returns a list of
    dictionaries that match the structure of the new action example.
    """
    actions = []
    with open(ACTION_DATA_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    if not data:
        print("Action data is empty.")
        sys.exit(1)

    for item in data:
        # Removed keys that are not in the new example:
        #    'AdaptationCategory', 'InterventionType', 'BehaviouralChangeTargeted', 'Impacts'
        # Added 'PowersAndMandates', which appears in the new example.
        action = {
            "ActionID": item.get("ActionID"),
            "ActionName": item.get("ActionName"),
            "ActionType": item.get("ActionType"),
            "Hazard": item.get("Hazard"),
            "Sector": item.get("Sector"),
            "Subsector": item.get("Subsector"),
            "PrimaryPurpose": item.get("PrimaryPurpose"),
            "Description": item.get("Description"),
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
            "PowersAndMandates": item.get("PowersAndMandates"),  # Added key
        }
        actions.append(action)
    return actions


def write_output(top_actions, filename):
    """
    Writes the given list of actions (top_actions) to a JSON file in the OUTPUT_PATH.
    Creates the directory if it does not exist.
    """
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
