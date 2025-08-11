import json
import logging
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


def get_json_from_file(file_name: str) -> Optional[Dict[Any, Any]]:
    """
    Loads a JSON file from the predefined directory.

    The path is constructed relative to this script's location, assuming the script is in
    `utils/` and the JSON files are in `runtime_data/json_files/`.

    Args:
        file_name (str): The name of the JSON file (without the .json extension).
                         For example, 'br_country_strategy' for 'br_country_strategy.json'.

    Returns:
        A dictionary with the JSON content, or None if the file is not found or is invalid.
    """
    try:
        # Construct the path to the JSON file relative to the current file.
        # Path(__file__).parent -> .../utils/
        # .parent -> .../app/
        # then -> runtime_data/json_files/
        base_path = Path(__file__).parent.parent / "runtime_data" / "json_files"
        json_file_path = base_path / f"{file_name}.json"

        logger.info(f"Attempting to load JSON file from: {json_file_path}")

        if not json_file_path.is_file():
            logger.error(f"JSON file not found at {json_file_path}")
            return None

        with open(json_file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        logger.info(f"Successfully loaded JSON file: {json_file_path}")
        return data

    except json.JSONDecodeError:
        logger.error(f"Error decoding JSON from file: {json_file_path}")
        return None
    except Exception as e:
        logger.error(f"An unexpected error occurred while reading the JSON file: {e}")
        return None
