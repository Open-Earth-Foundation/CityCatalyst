"""
This script is used to enrich the prioritized actions with the action list and translations.
It will create a JSON file for each language.

Execute:
python -m scripts.upload_to_frontend.enrich_for_frontend_schema --locode "BR CCI" --action_type "mitigation"
"""

from pathlib import Path
import json
import argparse


# Define the base directory relative to the script's location
BASE_DIR = Path(__file__).parent.parent.parent

# Load paths dynamically relative to the base directory
PATH_ACTIONSLIST_EN = BASE_DIR / "data" / "climate_actions" / "output" / "merged.json"
PATH_TRANSLATIONS = BASE_DIR / "data" / "climate_actions" / "output" / "translations"
BASE_PATH_PRIORITIZED_ACTIONS = BASE_DIR / "data" / "prioritized"
BASE_PATH_OUTPUT = BASE_DIR / "data" / "frontend"

# Define supported languages and their corresponding files
LANGUAGE_FILES = {
    "en": PATH_ACTIONSLIST_EN,
    "es": PATH_TRANSLATIONS / "merged_es.json",
    "pt": PATH_TRANSLATIONS / "merged_pt.json",
}


def process_city_multilingual(locode, action_type):
    print(f"Processing city: {locode}, action type: {action_type}")
    """Process a city and generate enriched JSON output for all supported languages."""

    # Read the prioritized actions (this is language-independent)
    with open(
        BASE_PATH_PRIORITIZED_ACTIONS / f"output_{locode}_{action_type}.json",
        "r",
        encoding="utf-8",
    ) as f:
        priority_list = json.load(f)

    # Process each language
    for lang, actions_file in LANGUAGE_FILES.items():
        print(f"Processing language: {lang}")

        # Read the actions list for this language
        with open(actions_file, "r", encoding="utf-8") as f:
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

        # Write the enriched data to a language-specific file
        file_path = (
            BASE_PATH_OUTPUT / f"output_{locode}_{action_type}_enriched_{lang}.json"
        )
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(enriched_priority_list, f, indent=4)
        print(f"File written: {file_path}")


def main(locode: str, action_type: str):
    process_city_multilingual(locode, action_type)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Create enriched JSON files for frontend in multiple languages"
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
