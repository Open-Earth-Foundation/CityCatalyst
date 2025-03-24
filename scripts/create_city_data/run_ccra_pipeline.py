# run_ccra_pipeline.py

"""
This script runs the CCRA pipeline for a given city and scenario.

The pipeline consists of the following steps:
1. Get the CCRA data for the given city and scenario. This will save the data to a file called "ccra_data.json" in the data/ccra folder.
2. Extract the CCRA data from the file.
3. Add the CCRA data to the city data. This will save the data to a file called "city_data.json" in the data/city_data folder.

Usage:
    Single city:
    python run_ccra_pipeline.py --locode "BR CCI" --scenario_name "current"

    Bulk processing:
    python run_ccra_pipeline.py --bulk_file data/cities/brazil_city_locodes.json --scenario_name "current"
"""

import argparse
import json
from pathlib import Path
from get_ccra import get_ccra
from add_ccras_to_city_data import extract_ccras, add_extracted_ccras_to_city_data

# Base directory for the project
BASE_DIR = Path(__file__).parent.parent.parent


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


def process_single_city(locode: str, scenario_name: str) -> None:
    """
    Process a single city through the CCRA pipeline.

    Args:
        locode (str): The city locode to process
        scenario_name (str): The scenario name to use
    """
    print(f"\nProcessing {locode} with scenario {scenario_name}")

    try:
        print("Getting CCRA data...")
        get_ccra(locode, scenario_name)
        print("Done...")

        print("Extracting CCRA data...")
        list_extracted_ccras = extract_ccras(locode)
        print("Done...")

        print("Adding CCRA data to city data...")
        add_extracted_ccras_to_city_data(locode, list_extracted_ccras)
        print("Done...")

        print(f"Successfully processed {locode}")
    except Exception as e:
        print(f"Error processing {locode}: {e}")


def main(
    locode: str | None = None,
    scenario_name: str = "current",
    bulk_file: Path | None = None,
):
    """
    Main function to run the CCRA pipeline.

    Args:
        locode (str | None, optional): Single city locode to process
        scenario_name (str): The scenario name to use
        bulk_file (Path | None, optional): Path to JSON file containing list of locodes
    """
    if bulk_file:
        # Bulk processing mode

        processed_cities = 0
        try:
            locodes = load_locodes_from_file(bulk_file)
            print(f"Loaded {len(locodes)} locodes from {bulk_file}")

            for city_locode in locodes:
                if not isinstance(city_locode, str):
                    print(f"Skipping invalid locode type: {city_locode}")
                    continue
                process_single_city(city_locode, scenario_name)
                processed_cities += 1

            print(f"Successfully processed {processed_cities} cities")

        except Exception as e:
            print(f"Error during bulk processing: {e}")
    else:
        # Single city processing mode
        # We know locode is not None here because of the argument parser check
        process_single_city(locode, scenario_name)  # type: ignore


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the CCRA pipeline.")
    parser.add_argument(
        "--locode",
        type=str,
        help="The locode of the city to run the pipeline on (e.g., BR CCI - with space between country and city).",
    )
    parser.add_argument(
        "--scenario_name",
        type=str,
        default="current",
        help="The scenario name (e.g., current).",
    )
    parser.add_argument(
        "--bulk_file",
        type=Path,
        help="Path to JSON file containing list of locodes for bulk processing",
    )

    args = parser.parse_args()

    if not args.locode and not args.bulk_file:
        parser.error("Either --locode or --bulk_file must be provided")

    main(args.locode, args.scenario_name, args.bulk_file)
