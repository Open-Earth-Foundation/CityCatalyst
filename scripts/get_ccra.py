import requests
from pathlib import Path
import argparse


def get_ccra(actor_id, scenario_name):
    # Base URL for the API
    base_url = "https://ccglobal.openearth.dev/api/v0/ccra/risk_assessment/city"
    # Construct the API endpoint URL
    url = f"{base_url}/{actor_id}/{scenario_name}"

    try:
        response = requests.get(url)
        response.raise_for_status()

        # Parse the JSON response
        data = response.json()

        # Define the output folder and file path
        data_folder = Path("../data/ccra")
        data_folder.mkdir(parents=False, exist_ok=True)

        # Remove any spaces from the actor ID
        actor_id = actor_id.replace(" ", "")
        output_file = data_folder / f"ccra_{actor_id}_{scenario_name}.json"

        # Save the JSON response to a file
        with open(output_file, "w", encoding="utf-8") as file:
            import json

            json.dump(data, file, indent=4)

        print(f"Data successfully saved to {output_file}")
    except requests.exceptions.RequestException as e:
        print(f"Error fetching data: {e}")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Fetch CCRA data for a city and scenario."
    )
    parser.add_argument(
        "--actor_id",
        type=str,
        required=True,
        help="The actor ID for the city (e.g., BR FLN).",
    )
    parser.add_argument(
        "--scenario_name",
        type=str,
        default="current",
        help="The scenario name (e.g., current).",
    )

    args = parser.parse_args()

    get_ccra(args.actor_id, args.scenario_name)
