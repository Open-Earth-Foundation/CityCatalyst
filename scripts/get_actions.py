"""
This script is used to fetch the climate actions data.

The climate actions data is fetched from the global data database API.

Run it from the root of the project with the following command:
python scripts/get_actions.py
"""

import requests
from pathlib import Path
import argparse
import json
import logging

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).parent.parent.parent


def get_actions() -> list[dict] | None:
    # Base URL for the API
    base_url = "https://ccglobal.openearth.dev/api/v0/climate_actions"

    try:
        logging.info(f"Fetching data from {base_url} ...")
        response = requests.get(base_url)
        response.raise_for_status()
        logging.info("Data fetched successfully")

        # Parse and return the JSON response
        return response.json()
    except requests.exceptions.RequestException as e:
        logging.error(f"Error fetching data: {e}")
        return None
    except Exception as e:
        logging.error(f"An unexpected error occurred: {e}")
        return None


if __name__ == "__main__":
    from logger_config import setup_logger

    setup_logger(level=logging.DEBUG)

    parser = argparse.ArgumentParser(description="Fetch climate actions data.")

    args = parser.parse_args()

    data = get_actions()
    if data:
        logging.info(json.dumps(data, indent=2))
