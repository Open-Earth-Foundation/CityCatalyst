"""
This script is used to add GHGI emissions data to the city data.

The GHGI emissions data is provided via csv export and stored in the data/ghgi folder.

The city data is stored in the data/cities folder.

Run it from the app/ folder of the project with the following command:
python prioritizer/scripts/create_city_data/add_ghgis_to_city_data.py --file_name "inventory-BR CCI-2022.csv" --locode "BR CCI"
"""

import sys
import pandas as pd
from pathlib import Path
import argparse
import json

# Load the city data from the CSV file
BASE_DIR = Path(__file__).parent.parent.parent.parent.parent
BASE_PATH_GHGIS = BASE_DIR / "app" / "prioritizer" / "data" / "ghgi"
BASE_PATH_CITIES = BASE_DIR / "app" / "prioritizer" / "data" / "cities"


# Initialize emissions values to extract
dict_emissions = {
    "stationaryEnergyEmissions": 0.0,
    "transportationEmissions": 0.0,
    "wasteEmissions": 0.0,
    "ippuEmissions": 0.0,
    "afoluEmissions": 0.0,
    "scope1Emissions": 0.0,
    "scope2Emissions": 0.0,
    "scope3Emissions": 0.0,
}

# Mapping from GPC reference first letter to sector
GPC_TO_SECTOR = {
    "I": "stationaryEnergyEmissions",
    "II": "transportationEmissions",
    "III": "wasteEmissions",
    "IV": "ippuEmissions",
    "V": "afoluEmissions",
}

GPC_TO_SCOPE = {
    "I.1.1": 1,
    "I.1.2": 2,
    "I.1.3": 3,
    "I.2.1": 1,
    "I.2.2": 2,
    "I.2.3": 3,
    "I.3.1": 1,
    "I.3.2": 2,
    "I.3.3": 3,
    "I.4.1": 1,
    "I.4.2": 2,
    "I.4.3": 3,
    "I.4.4": 1,
    "I.5.1": 1,
    "I.5.2": 2,
    "I.5.3": 3,
    "I.6.1": 1,
    "I.6.2": 2,
    "I.63": 3,
    "I.7.1": 1,
    "I.8.1": 1,
    "II.1.1": 1,
    "II.1.2": 2,
    "II.1.3": 3,
    "II.2.1": 1,
    "II.2.2": 2,
    "II.2.3": 3,
    "II.3.1": 1,
    "II.3.2": 2,
    "II.3.3": 3,
    "II.4.1": 1,
    "II.4.2": 2,
    "II.4.3": 3,
    "II.5.1": 1,
    "II.5.2": 2,
    "III.1.1": 1,
    "III.1.2": 3,
    "III.1.3": 1,
    "III.2.1": 1,
    "III.2.2": 3,
    "III.2.3": 1,
    "III.3.1": 1,
    "III.3.2": 3,
    "III.3.3": 1,
    "III.4.1": 1,
    "III.4.2": 3,
    "III.4.3": 1,
    "IV.1": 1,
    "IV.2": 1,
    "V.1": 1,
    "V.2": 1,
    "V.3": 1,
    "VI.1": 3,
}


def extract_data(file_name: str) -> dict:
    # Create a copy of the emissions dictionary to avoid global state issues
    emissions = dict_emissions.copy()

    data = pd.read_csv(BASE_PATH_GHGIS / file_name, encoding="utf-8")

    if not data.empty:
        print(f"GHGI data loaded from {file_name}")

        # Iterate through the rows and calculate emissions
        for _, row in data.iterrows():
            gpc_ref = row["GPC Reference Number"]
            total_emissions = row["Total Emissions"]

            # Skip rows with missing GPC Reference Number or Total Emissions
            if pd.isna(gpc_ref) or pd.isna(total_emissions):
                continue

            # Extract the sector from the GPC Reference Number
            sector_key = gpc_ref.split(".")[
                0
            ]  # Get the first part of GPC (e.g., "I" from "I.1.1")
            sector = GPC_TO_SECTOR.get(sector_key)

            if sector:
                emissions[sector] += total_emissions

            # Extract the scope from the GPC Reference Number
            scope = GPC_TO_SCOPE.get(gpc_ref)
            if scope == 1:
                emissions["scope1Emissions"] += total_emissions
            elif scope == 2:
                emissions["scope2Emissions"] += total_emissions
            elif scope == 3:
                emissions["scope3Emissions"] += total_emissions

        return emissions
    else:
        print(f"GHGI data could not be loaded from {file_name}")
        sys.exit(1)


def add_emissions_to_city_data(locode: str, dict_extracted_emissions: dict) -> None:
    file_path = BASE_PATH_CITIES / "city_data.json"
    # Load the city data as a list of dicts
    with open(file_path, "r", encoding="utf-8") as f:
        cities = json.load(f)

    updated = False
    for city in cities:
        if city.get("locode") == locode:
            print(f"Match found for locode {locode}!")
            # Update emissions fields
            for key, value in dict_extracted_emissions.items():
                city[key] = value
            city["totalEmissions"] = (
                dict_extracted_emissions["stationaryEnergyEmissions"]
                + dict_extracted_emissions["transportationEmissions"]
                + dict_extracted_emissions["wasteEmissions"]
                + dict_extracted_emissions["ippuEmissions"]
                + dict_extracted_emissions["afoluEmissions"]
            )
            updated = True
            break

    if updated:
        # Write back the updated list, preserving formatting
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(cities, f, ensure_ascii=False, indent=2)
        print(f"Updated city data saved to {file_path}")
    else:
        print(f"No matching city found for locode: {locode}")
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Add GHG emissions data to city data.")
    parser.add_argument(
        "--file_name",
        type=str,
        required=True,
        help="The name of the file containing the city data.",
    )

    parser.add_argument(
        "--locode",
        type=str,
        required=True,
        help="The locode of the city to add the emissions data to like 'BR CCI'.",
    )

    args = parser.parse_args()

    dict_extracted_emissions = extract_data(args.file_name)
    add_emissions_to_city_data(args.locode, dict_extracted_emissions)
