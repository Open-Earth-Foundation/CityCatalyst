# run_ccra_pipeline.py

"""
This script runs the CCRA pipeline for multiple cities in bulk.

The pipeline processes all cities listed in a JSON file containing locodes.
For each city, it will:
1. Get the CCRA data for the given scenario
2. Extract the CCRA data
3. Add the CCRA data to the city_data.json file

Usage:
    Run it from the app/ folder of the project with the following command:
    python -m prioritizer.scripts.create_city_data_file.run_ccra_bulk_import --bulk_file app/prioritizer/data/cities/brazil_city_locodes.json
"""

import argparse
import json
from pathlib import Path
from prioritizer.services.get_ccra import get_ccra
from prioritizer.scripts.create_city_data_file.add_ccras_to_city_data import (
    extract_ccras,
    add_extracted_ccras_to_city_data,
)

# Base directory for the project
BASE_DIR = Path(__file__).parent.parent.parent.parent.parent


def load_locodes_from_file(file_name: Path) -> list:
    """
    Load locodes from a JSON file.

    Args:
        file_name (Path): Path to the JSON file containing locodes

    Returns:
        list: List of locodes
    """
    file_path = BASE_DIR / file_name

    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
        if isinstance(data, list):
            return data
        elif isinstance(data, dict) and "locodes" in data:
            return data["locodes"]
        else:
            raise ValueError(
                "JSON file must contain either a list of locodes or a dict with 'locodes' key"
            )


def process_city(locode: str, scenario_name: str) -> tuple[bool, str]:
    """
    Process a single city through the CCRA pipeline.

    Args:
        locode (str): The city locode to process
        scenario_name (str): The scenario name to use

    Returns:
        tuple[bool, str]: (success status, error message if failed)
    """
    print(f"\nProcessing {locode} with scenario {scenario_name}")

    try:
        print("Getting CCRA data...")
        ccra_data = get_ccra(locode, scenario_name)
        if ccra_data is None:
            return False, "Failed to fetch CCRA data"
        print("Done...")

        print("Extracting CCRA data...")
        list_extracted_ccras = extract_ccras(ccra_data)
        print("Done...")

        print("Adding CCRA data to city data...")
        add_extracted_ccras_to_city_data(locode, list_extracted_ccras)
        print("Done...")

        print(f"Successfully processed {locode}")
        return True, ""
    except Exception as e:
        error_msg = str(e)
        print(f"Error processing {locode}: {error_msg}")
        return False, error_msg


def main(bulk_file: Path, scenario_name: str = "current") -> None:
    """
    Main function to run the CCRA pipeline for multiple cities.

    Args:
        bulk_file (Path): Path to JSON file containing list of locodes
        scenario_name (str): The scenario name to use
    """
    successful_cities = []
    failed_cities = []

    try:
        locodes = load_locodes_from_file(bulk_file)
        print(f"Loaded {len(locodes)} locodes from {bulk_file}")

        for city_locode in locodes:
            if not isinstance(city_locode, str):
                print(f"Skipping invalid locode type: {city_locode}")
                failed_cities.append((city_locode, "Invalid locode type"))
                continue

            success, error_msg = process_city(city_locode, scenario_name)
            if success:
                successful_cities.append(city_locode)
            else:
                failed_cities.append((city_locode, error_msg))

        # Print summary
        print("\n=== Processing Summary ===")
        print(f"Total cities processed: {len(locodes)}")
        print(f"Successfully processed: {len(successful_cities)}")
        print(f"Failed to process: {len(failed_cities)}")

        if successful_cities:
            print("\nSuccessfully processed cities:")
            for city in successful_cities:
                print(f"- {city}")

        if failed_cities:
            print("\nFailed cities and reasons:")
            for city, error in failed_cities:
                print(f"- {city}: {error}")

    except Exception as e:
        print(f"Error during bulk processing: {e}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Run the CCRA pipeline for multiple cities."
    )
    parser.add_argument(
        "--bulk_file",
        type=Path,
        required=True,
        help="Path to JSON file containing list of locodes for bulk processing",
    )
    parser.add_argument(
        "--scenario_name",
        type=str,
        default="current",
        help="The scenario name (e.g., current).",
    )

    args = parser.parse_args()
    main(args.bulk_file, args.scenario_name)
