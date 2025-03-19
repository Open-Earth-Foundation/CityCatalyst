"""
This script is used to fetch the context data for a city.

The context data is fetched from the context API.

The context data is saved to the data/context folder.

Run it from the root of the project with the following command:
python scripts/get_context.py --locode "BR CCI"
"""

import requests
from pathlib import Path
import argparse
import json


BASE_DIR = Path(__file__).parent.parent.parent


def get_context(locode):
    # Base URL for the API
    base_url = "https://ccglobal.openearth.dev/api/v0/ccra/risk_assessment/city"  # TODO update with the correct endpoint once its created
    # Construct the API endpoint URL
    url = f"{base_url}/{locode}"

    try:
        response = requests.get(url)
        response.raise_for_status()

        # Parse the JSON response
        data = response.json()

        # Define the output folder and file path
        data_folder = BASE_DIR / "data" / "context"
        data_folder.mkdir(parents=False, exist_ok=True)

        # Remove any spaces from the actor ID
        locode = locode.replace(" ", "")
        output_file = data_folder / f"context_{locode}.json"

        # Save the JSON response to a file
        with open(output_file, "w", encoding="utf-8") as file:
            json.dump(data, file, indent=4)

        print(f"Data successfully saved to {output_file}")
    except requests.exceptions.RequestException as e:
        print(f"Error fetching data: {e}")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch city context data for a city.")
    parser.add_argument(
        "--locode",
        type=str,
        required=True,
        help="The actor ID (locode) for the city (e.g., BR FLN).",
    )

    args = parser.parse_args()

    get_context(args.locode)
