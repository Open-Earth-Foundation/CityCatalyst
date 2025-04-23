"""
This script is used to enrich the prioritized actions with the action list and translations.
It will create a JSON file for each language.

Execute:
python -m scripts.upload_to_frontend.enrich_for_frontend_schema --locode "BR CCI" --action_type "mitigation"
"""

import json
import argparse
import logging
from pathlib import Path
from typing import Optional, Dict, List
from scripts.get_actions import get_actions

# Configure logging
logger = logging.getLogger(__name__)

# Define the base directory relative to the script's location
BASE_DIR = Path(__file__).parent.parent.parent

# Load paths dynamically relative to the base directory
BASE_PATH_PRIORITIZED_ACTIONS = BASE_DIR / "data" / "prioritized"
BASE_PATH_OUTPUT = BASE_DIR / "data" / "frontend"


def get_language_actions() -> Dict[str, Optional[List[dict]]]:
    """Fetch actions for all supported languages."""
    return {
        "en": get_actions(language="en"),
        "es": get_actions(language="es"),
        "pt": get_actions(language="pt"),
    }


def process_city_multilingual(locode: str, action_type: str) -> None:
    """Process a city and generate enriched JSON output for all supported languages."""
    logger.info(f"Processing city: {locode}, action type: {action_type}")

    # Read the prioritized actions (this is language-independent)
    try:
        with open(
            BASE_PATH_PRIORITIZED_ACTIONS / f"output_{locode}_{action_type}.json",
            "r",
            encoding="utf-8",
        ) as f:
            priority_list = json.load(f)
    except FileNotFoundError:
        logger.error(f"Prioritized actions file not found for {locode} {action_type}")
        return
    except json.JSONDecodeError:
        logger.error(
            f"Invalid JSON in prioritized actions file for {locode} {action_type}"
        )
        return

    # Get actions for all languages
    language_actions = get_language_actions()

    # Process each language
    for lang, actions_list in language_actions.items():
        if not actions_list:
            logger.warning(f"No actions list found for language: {lang}")
            continue

        logger.info(f"Processing language: {lang}")

        # Create a map of actions by ActionID for quick lookup
        action_map = {action["ActionID"]: action for action in actions_list}

        # Add action properties to the respective entry in the priority list
        enriched_priority_list = []
        for entry in priority_list:
            action = action_map.get(entry["actionId"])
            if not action:
                logger.warning(f"No action found for Action ID: {entry['actionId']}")
            enriched_entry = {**entry, "action": action}
            enriched_priority_list.append(enriched_entry)

        # Create the output directory if it doesn't exist
        BASE_PATH_OUTPUT.mkdir(parents=True, exist_ok=True)

        # Write the enriched data to a language-specific file
        file_path = (
            BASE_PATH_OUTPUT / f"output_{locode}_{action_type}_enriched_{lang}.json"
        )
        try:
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(enriched_priority_list, f, indent=4)
            logger.info(f"Successfully wrote file: {file_path}")
        except IOError as e:
            logger.error(f"Failed to write file {file_path}: {e}")


def main(locode: str, action_type: str) -> None:
    """Main function to process the city data."""
    process_city_multilingual(locode, action_type)


if __name__ == "__main__":
    from logger_config import setup_logger

    # Set up logging
    setup_logger(level=logging.INFO)

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
