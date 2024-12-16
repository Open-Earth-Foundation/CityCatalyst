from pathlib import Path
import json
import argparse


# # Load the city data from the CSV file
# PATH_ACTIONSLIST = Path("../data/climate_actions/output/combined_output.json")
# BASE_PATH_PRIORITIZED_ACTIONS = Path("../data/prioritized/")
# BASE_PATH_OUTPUT = Path("../data/frontend/")

# Define the base directory relative to the script's location
SCRIPT_DIR = Path(__file__).resolve().parent
BASE_DIR = SCRIPT_DIR.parent  # Go one level up from the script's directory

# Load paths dynamically relative to the base directory
PATH_ACTIONSLIST = (
    BASE_DIR / "data" / "climate_actions" / "output" / "combined_output.json"
)
BASE_PATH_PRIORITIZED_ACTIONS = BASE_DIR / "data" / "prioritized"
BASE_PATH_OUTPUT = BASE_DIR / "data" / "frontend"


def process_city(locode, action_type):
    print(f"Processing city: {locode}, action type: {action_type}")
    """Process a city and generate enriched JSON output."""

    # Read the JSON files with prioritized actions based on action types
    with open(
        BASE_PATH_PRIORITIZED_ACTIONS / f"output_{locode}_{action_type}.json",
        "r",
        encoding="utf-8",
    ) as f:
        priority_list = json.load(f)

    with open(PATH_ACTIONSLIST, "r", encoding="utf-8") as f:
        generic_action_list = json.load(f)

    # Create a map of actions by ActionID for quick lookup
    action_map = {action["ActionID"]: action for action in generic_action_list}

    # Add action properties to the respective entry in the priority list
    enriched_priority_list = []
    for entry in priority_list:
        action = action_map.get(entry["actionId"])
        if not action:
            print(f"No action found for Action ID: {entry['actionId']}", entry)
        enriched_entry = {**entry, "action": action}
        enriched_priority_list.append(enriched_entry)

    # Create the output directory if it doesn't exist
    if not BASE_PATH_OUTPUT.exists():
        BASE_PATH_OUTPUT.mkdir(parents=True, exist_ok=True)
        print(f"Created directory: {BASE_PATH_OUTPUT}")

    # Write the enriched data to a file dynamically named <locode>_formatted.json
    file_path = BASE_PATH_OUTPUT / f"output_{locode}_{action_type}_enriched.json"
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(enriched_priority_list, f, indent=4)
    print(f"File written: {file_path}")


def main(locode: str, action_type: str):
    # tuples = [
    #     {"locode": "BRCCI", "action_type": "adaptation"},
    #     {"locode": "BRCCI", "action_type": "mitigation"},
    #     # {"city": "camacari", "pathName": TYPE["ADAPTATION"]},
    #     # {"city": "camacari", "pathName": TYPE["MITIGATION"]},
    #     # {"city": "caxias_do_sul", "pathName": TYPE["ADAPTATION"]},
    #     # {"city": "caxias_do_sul", "pathName": TYPE["MITIGATION"]},
    #     # {"city": "corumba", "pathName": TYPE["ADAPTATION"]},
    #     # {"city": "corumba", "pathName": TYPE["MITIGATION"]},
    #     # {"city": "rio_branco", "pathName": TYPE["ADAPTATION"]},
    #     # {"city": "rio_branco", "pathName": TYPE["MITIGATION"]},
    # ]

    # for entry in tuples:
    process_city(locode, action_type)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Create enriched JSON files for frontend"
    )

    parser.add_argument(
        "--locode",
        type=str,
        required=True,
        help="The city LOCODE to process",
    )

    parser.add_argument(
        "--action_type",
        type=str,
        required=True,
        help="The action type to process",
    )

    args = parser.parse_args()
    main(args.locode, args.action_type)
