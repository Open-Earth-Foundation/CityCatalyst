"""
Use this script to CCRA values retrieved by
the ccra API and add them to the city data stored inside 'data/cities'.

Inputs: locode of the city to add the emissions data to
"""

from pathlib import Path
import argparse
import json
from typing import List, Dict, Any
from get_ccra import get_ccra

# Define the base path to the project root
BASE_DIR = Path(__file__).parent.parent.parent
BASE_PATH_CITIES = BASE_DIR / "data" / "cities"


def extract_ccras(ccra_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not ccra_data:
        print("No CCRA data provided")
        return []

    print("Processing CCRA data")
    list_extracted_ccras = []

    for ccra in ccra_data:
        list_extracted_ccras.append(
            {
                "keyimpact": ccra["keyimpact"],
                "hazard": ccra["hazard"],
                "normalised_risk_score": ccra["normalised_risk_score"],
            }
        )

    return list_extracted_ccras


def add_extracted_ccras_to_city_data(
    locode: str, list_extracted_ccras: List[Dict[str, Any]]
) -> None:

    # Load the city data
    full_path = BASE_PATH_CITIES / "city_data.json"

    if not full_path.exists():
        raise FileNotFoundError(f"City data file not found: {full_path}")

    with open(full_path, "r", encoding="utf-8") as file:
        city_data = json.load(file)

    if city_data:
        city_found = False

        # Add the list of extracted CCRA values to that city under ccra key
        for city in city_data:
            if city["locode"] == locode:
                city["ccra"] = list_extracted_ccras
                city_found = True
                break

        if not city_found:
            raise ValueError(f"City with locode {locode} not found in city data.")

        # Save the updated JSON file in-place
        with open(full_path, "w", encoding="utf-8") as file:
            json.dump(city_data, file, indent=2)

        print(f"City data with CCRA values saved to {full_path}")

    else:
        print(f"No city data found in {full_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Add CCRAs to city data.")

    parser.add_argument(
        "--locode",
        type=str,
        required=True,
        help="The locode of the city to get the ccras for and to add to that city e.g. 'BR MGE'.",
    )

    args = parser.parse_args()

    try:

        ccra_data = get_ccra(args.locode, "current")
        if ccra_data is None:
            print("Failed to fetch CCRA data")
            exit(1)
        list_extracted_ccras = extract_ccras(ccra_data)

        if not list_extracted_ccras:
            print("No CCRA data to add.")
        else:
            add_extracted_ccras_to_city_data(args.locode, list_extracted_ccras)

    except Exception as e:
        print(f"Error: {e}")
