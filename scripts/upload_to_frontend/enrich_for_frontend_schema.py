"""
This script is used to enrich the prioritized actions with the action list and translations.
It will create a JSON file for each language.

Execute:
python -m scripts.upload_to_frontend.enrich_for_frontend_schema --locode "BR CCI" --action_type "mitigation"
"""

import json
import argparse
import requests
from pathlib import Path
from requests.exceptions import RequestException

# Define the base directory relative to the script's location
BASE_DIR = Path(__file__).parent.parent.parent

# Load paths dynamically relative to the base directory
BASE_PATH_PRIORITIZED_ACTIONS = BASE_DIR / "data" / "prioritized"
BASE_PATH_OUTPUT = BASE_DIR / "data" / "frontend"

# Define the language endpoints
LANGUAGE_ENDPOINTS = {
    "en": "https://ccglobal.openearth.dev/api/v0/climate_actions?language=en",
    "es": "https://ccglobal.openearth.dev/api/v0/climate_actions?language=es",
    "pt": "https://ccglobal.openearth.dev/api/v0/climate_actions?language=pt",
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
    for lang, endpoint in LANGUAGE_ENDPOINTS.items():
        print(f"Processing language: {lang}")

        try:
            # Read the actions list for this language
            response = requests.get(endpoint)
            response.raise_for_status()  # Raise an exception for bad status codes
            actions_list = response.json()
        except RequestException as e:
            print(f"Error fetching actions for language {lang}: {str(e)}")
            continue
        except json.JSONDecodeError as e:
            print(f"Error parsing JSON response for language {lang}: {str(e)}")
            continue

        # Create a map of actions by ActionID for quick lookup
        action_map = {action["ActionID"]: action for action in actions_list}

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
