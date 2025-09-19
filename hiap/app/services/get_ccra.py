"""
This script is used to fetch the CCRA data for a city and scenario.

The CCRA data is fetched from the CCRA API.

Run it from the root of the project with the following command:
python scripts/get_ccra.py --locode "BR CCI"
"""

import requests
from pathlib import Path
import argparse
import json

BASE_DIR = Path(__file__).parent.parent.parent


def get_ccra(locode, scenario_name):
    # Base URL for the API
    base_url = "https://ccglobal.openearth.dev/api/v0/ccra/risk_assessment/city"
    # Construct the API endpoint URL
    url = f"{base_url}/{locode}/{scenario_name}"

    try:
        response = requests.get(url)
        response.raise_for_status()

        # Parse and return the JSON response
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error fetching data: {e}")
        return None
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        return None


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
