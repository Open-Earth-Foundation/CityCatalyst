"""
Use this script to CCRA values retrieved by
the ccra API and stored inside a folder called 'data/ccra'
to the city data stored inside 'data/cities'.

Inputs: locode of the city to add the emissions data to
"""

from pathlib import Path
import argparse
import json

# Define the base path to the project root
BASE_DIR = Path(__file__).parent.parent.parent
BASE_PATH_CCRAS = BASE_DIR / "data" / "ccra"
BASE_PATH_CITIES = BASE_DIR / "data" / "cities"


def extract_ccras(locode: str) -> list:
    full_path = BASE_PATH_CCRAS / f"ccra_{locode}_current.json"

    if not full_path.exists():
        raise FileNotFoundError(f"CCRA file not found: {full_path}")

    with open(full_path, "r", encoding="utf-8") as file:
        ccras = json.load(file)

    if ccras:
        print(f"CCRA data loaded from {full_path}")

        list_extracted_ccras = []

        for ccra in ccras:

            # print(ccra["keyimpact"])
            list_extracted_ccras.append(
                {
                    "keyimpact": ccra["keyimpact"],
                    "hazard": ccra["hazard"],
                    "normalised_risk_score": ccra["normalised_risk_score"],
                }
            )

        return list_extracted_ccras
    else:
        print(f"No CCRA data found in {full_path}")
        return []


def add_extracted_ccras_to_city_data(locode: str, list_extracted_ccras: list) -> None:
    # Load the city data
    full_path = BASE_PATH_CITIES / "city_data.json"

    if not full_path.exists():
        raise FileNotFoundError(f"City data file not found: {full_path}")

    with open(full_path, "r", encoding="utf-8") as file:
        city_data = json.load(file)

    if city_data:

        city_found = False

        # Search for the city data with the given locode and return index

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
            json.dump(city_data, file, indent=4, ensure_ascii=False)

        print(f"City data with CCRA values saved to {full_path}")

    else:
        print(f"No city data found in {full_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Add CCRAs to city data.")

    parser.add_argument(
        "--locode",
        type=str,
        required=True,
        help="The locode of the city to get the ccras for and to add to that city e.g. BRMGE.",
    )

    args = parser.parse_args()

    # Remove any spaces from the locode e.g. BR CCI -> BRCCI
    args.locode = args.locode.replace(" ", "")

    try:
        list_extracted_ccras = extract_ccras(args.locode)

        if not list_extracted_ccras:
            print("No CCRA data to add.")
        else:
            add_extracted_ccras_to_city_data(args.locode, list_extracted_ccras)

    except Exception as e:
        print(f"Error: {e}")
