"""
This script is used to fetch the city context data for a city.

The city context data includes information such as:
- Basic city information (name, region, population)
- Geographic data (area, elevation, biome)
- Socio-economic factors
- Access to public services

Run it from the root of the project with the following command:
python scripts/create_city_data/get_context.py --locode "BR ATM"
"""

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from pathlib import Path
import argparse
import json
import logging

BASE_DIR = Path(__file__).parent.parent.parent


def get_context(locode):
    # Base URL for the API
    base_url = "https://ccglobal.openearth.dev/api/v0/city_context/city"
    # Construct the API endpoint URL
    url = f"{base_url}/{locode}"

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
        logger.info(f"Fetching city context from {url} ...")
        # Add connection/read timeouts
        response = session.get(url, timeout=(10, 30))
        logger.info(f"Response status code: {response.status_code}")
        logger.debug(f"Response headers: {response.headers}")
        response.raise_for_status()
        return response.json()
    except requests.exceptions.Timeout:
        logger = logging.getLogger(__name__)
        logger.error("Request timed out when fetching city context")
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
        description="Fetch city context data including population, geographic, and socio-economic information."
    )
    parser.add_argument(
        "--locode",
        type=str,
        required=True,
        help="The locode of the city (e.g., BR SER).",
    )

    args = parser.parse_args()

    data = get_context(args.locode)
    if data:
        print("Successfully fetched city context data")
        print(json.dumps(data, indent=4))
