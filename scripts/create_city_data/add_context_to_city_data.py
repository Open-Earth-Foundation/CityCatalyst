"""
Use this script to add or update city context data in the city data stored inside 'data/cities'.

The city context data includes information such as:
- Basic city information (name, region, population)
- Geographic data (area, elevation, biome)
- Socio-economic factors
- Access to public services

Inputs: locode of the city to add/update the context data for
"""

from pathlib import Path
import argparse
import json
from typing import Dict, Any
from get_context import get_context

# Define the base path to the project root
BASE_DIR = Path(__file__).parent.parent.parent
BASE_PATH_CITIES = BASE_DIR / "data" / "cities"


def add_context_to_city_data(locode: str, context_data: Dict[str, Any]) -> None:

    # Load the city data
    full_path = BASE_PATH_CITIES / "city_data.json"

    if not full_path.exists():
        raise FileNotFoundError(f"City data file not found: {full_path}")

    with open(full_path, "r", encoding="utf-8") as file:
        city_data = json.load(file)

    if city_data:
        city_found = False

        # Update or add the context data for the city
        for city in city_data:
            if city["locode"] == locode:
                # Update existing city with new context data
                city.update(context_data)
                city_found = True
                break

        if not city_found:
            # Add new city with context data
            context_data["locode"] = locode
            city_data.append(context_data)

        # Save the updated JSON file in-place
        with open(full_path, "w", encoding="utf-8") as file:
            json.dump(city_data, file, indent=2)

        print(f"City data with context values saved to {full_path}")

    else:
        print(f"No city data found in {full_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Add or update city context data.")

    parser.add_argument(
        "--locode",
        type=str,
        required=True,
        help="The locode of the city to get the context data for and to add/update in city data e.g. 'BR SER'.",
    )

    args = parser.parse_args()

    try:
        context_data = get_context(args.locode)
        if context_data is None:
            print("Failed to fetch city context data")
            exit(1)

        add_context_to_city_data(args.locode, context_data)

    except Exception as e:
        print(f"Error: {e}")
