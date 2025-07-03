"""
This script is used to fetch the climate actions data.

The climate actions data is fetched from the global data database API.

It is meant to be imported as a module in other scripts with the get_actions() function.

Run it standalone from the root of the project with the following command:
python -m scripts.get_actions
"""

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import argparse
import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Configure retry strategy
retry_strategy = Retry(
    total=3,  # number of retries
    backoff_factor=1,  # wait 1, 2, 4 seconds between retries
    status_forcelist=[500, 502, 503, 504],  # HTTP status codes to retry on
    allowed_methods=["GET"],  # only retry on GET requests
)


def get_actions(language: str = "en") -> Optional[list[dict]]:
    # Base URL for the API
    base_url = (
        f"https://ccglobal.openearth.dev/api/v0/climate_actions?language={language}"
    )

    # Create a session with retry strategy
    session = requests.Session()
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session.mount("https://", adapter)
    session.mount("http://", adapter)

    try:
        logger.info(f"Fetching data from {base_url} ...")
        # Add timeout of 30 seconds for connection and read
        response = session.get(base_url, timeout=(10, 30))

        # Log response details
        logger.info(f"Response status code: {response.status_code}")
        logger.debug(f"Response headers: {response.headers}")

        response.raise_for_status()
        logger.info("Data fetched successfully")

        num_actions = len(response.json())
        logger.info(f"Number of actions returned: {num_actions}")

        # Parse and return the JSON response
        return response.json()
    except requests.exceptions.Timeout:
        logger.error("Request timed out")
        return None
    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching data: {e}")
        return None
    except Exception as e:
        logger.error(f"An unexpected error occurred: {e}")
        return None
    finally:
        session.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch climate actions data.")

    args = parser.parse_args()

    data = get_actions()
    if data:
        logging.info(json.dumps(data, indent=2))
