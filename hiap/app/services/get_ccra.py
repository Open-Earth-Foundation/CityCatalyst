"""
This script is used to fetch the CCRA data for a city and scenario.

The CCRA data is fetched from the CCRA API.

Run it from the root of the project with the following command:
python scripts/get_ccra.py --locode "BR CCI"
"""

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from pathlib import Path
import argparse
import json
import logging

BASE_DIR = Path(__file__).parent.parent.parent


def get_ccra(locode, scenario_name):
    # Base URL for the API
    base_url = "https://ccglobal.openearth.dev/api/v0/ccra/risk_assessment/city"
    # Construct the API endpoint URL
    url = f"{base_url}/{locode}/{scenario_name}"

    # Configure retry strategy similar to get_actions
    retry_strategy = Retry(
        total=3,
        backoff_factor=1,
        status_forcelist=[500, 502, 503, 504],
        allowed_methods=["GET"],
    )

    session = requests.Session()
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session.mount("https://", adapter)
    session.mount("http://", adapter)

    try:
        logger = logging.getLogger(__name__)
        logger.info(f"Fetching CCRA from {url} ...")
        # Add connection/read timeouts
        response = session.get(url, timeout=(10, 30))
        logger.info(f"Response status code: {response.status_code}")
        logger.debug(f"Response headers: {response.headers}")
        response.raise_for_status()
        return response.json()
    except requests.exceptions.Timeout:
        logger = logging.getLogger(__name__)
        logger.error("Request timed out when fetching CCRA")
        return None
    except requests.exceptions.RequestException as e:
        logger = logging.getLogger(__name__)
        logger.error(f"Error fetching data: {e}")
        return None
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(f"An unexpected error occurred: {e}")
        return None
    finally:
        session.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Fetch CCRA data for a city and scenario."
    )
    parser.add_argument(
        "--locode",
        type=str,
        required=True,
        help="The actor ID (locode) for the city (e.g., BR FLN).",
    )
    parser.add_argument(
        "--scenario_name",
        type=str,
        default="current",
        help="The scenario name (e.g., current).",
    )

    args = parser.parse_args()

    data = get_ccra(args.locode, args.scenario_name)
    if data:
        print("Successfully fetched CCRA data")
        print(json.dumps(data, indent=2))
