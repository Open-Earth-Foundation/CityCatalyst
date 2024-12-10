import sys
import pandas as pd
from pathlib import Path
import argparse

# Load the city data from the CSV file
BASE_PATH_GHGIS = Path("../data/ghgi/")
BASE_PATH_CITIES = Path("../data/cities/")


# Initialize emissions values to extract
dict_emissions = {
    "stationaryEnergyEmissions": 0.0,
    "transportationEmissions": 0.0,
    "wasteEmissions": 0.0,
    "industrialProcessEmissions": 0.0,
    "landUseEmissions": 0.0,
    "scope1Emissions": 0.0,
    "scope2Emissions": 0.0,
    "scope3Emissions": 0.0,
}

# Mapping from GPC reference first letter to sector
GPC_TO_SECTOR = {
    "I": "stationaryEnergyEmissions",
    "II": "transportationEmissions",
    "III": "wasteEmissions",
    "IV": "industrialProcessEmissions",
    "V": "landUseEmissions",
}


def extract_data(file_name: str) -> dict:
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
                dict_emissions[sector] += total_emissions

            # Extract the scope from the GPC Reference Number
            scope_key = gpc_ref.split(".")[
                -1
            ]  # Get the last part of GPC (e.g., "1" from "I.1.1")

            if scope_key == "1":
                dict_emissions["scope1Emissions"] += total_emissions

            elif scope_key == "2":
                dict_emissions["scope2Emissions"] += total_emissions

            elif scope_key == "3":
                dict_emissions["scope3Emissions"] += total_emissions

        return dict_emissions
    else:
        print(f"GHGI data could not be loaded from {file_name}")
        sys.exit(1)


def add_emissions_to_city_data(locode: str, dict_extracted_emissions: dict) -> None:

    file_path = BASE_PATH_CITIES / "city_data.json"
    # Load the city data from the CSV file
    data = pd.read_json(file_path, encoding="utf-8")

    if not data.empty:
        print(f"City data loaded from {file_path}")

        # Flag to check if the locode was found
        updated = False

        # Add the emissions data to the city data
        # Iterate through each row in the DataFrame
        for index, city in data.iterrows():
            # Check if the locode matches
            if city["locode"] == locode:
                print(f"Match found for locode {locode}!")

                # Update the emissions data
                for key, value in dict_extracted_emissions.items():
                    data.at[index, key] = value

                # Update the total emissions field
                data.at[index, "totalEmissions"] = (
                    dict_extracted_emissions["stationaryEnergyEmissions"]
                    + dict_extracted_emissions["transportationEmissions"]
                    + dict_extracted_emissions["wasteEmissions"]
                    + dict_extracted_emissions["industrialProcessEmissions"]
                    + dict_extracted_emissions["landUseEmissions"]
                )

                updated = True
                break  # Stop the loop if the locode was found

        if updated:
            # Save the updated data back to the JSON file
            data.to_json(file_path, orient="records", indent=4)
            print(f"Updated city data saved to {file_path}")
        else:
            print(f"No matching city found for locode: {locode}")
    else:
        print(f"City data could not be loaded from {file_path}")
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
        help="The locode of the city to add the emissions data to.",
    )

    args = parser.parse_args()

    dict_extracted_emissions = extract_data(args.file_name)
    add_emissions_to_city_data(args.locode, dict_extracted_emissions)
