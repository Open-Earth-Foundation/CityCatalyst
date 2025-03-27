"""
This script is used to fetch the city context data for a city.

The city context data includes information such as:
- Basic city information (name, region, population)
- Geographic data (area, elevation, biome)
- Socio-economic factors
- Access to public services

Run it from the root of the project with the following command:
python scripts/get_context.py --locode "BR SER"
"""

import requests
from pathlib import Path
import argparse
import json

BASE_DIR = Path(__file__).parent.parent.parent


def get_context(locode):
    # Base URL for the API
    base_url = "https://ccglobal.openearth.dev/api/v0/city_context/city"
    # Construct the API endpoint URL
    url = f"{base_url}/{locode}"

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
