"""
This script runs the city context pipeline for multiple cities in bulk.

The pipeline processes all cities listed in a JSON file containing locodes.
For each city, it will:
1. Get the city context data
2. Add or update the city context data in the city_data.json file

Usage:
    python scripts/create_city_data/run_context_bulk_import.py --bulk_file data/cities/brazil_city_locodes.json
"""

import argparse
import json
from pathlib import Path
from get_context import get_context
from add_context_to_city_data import add_context_to_city_data

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


def process_city(locode: str) -> tuple[bool, str]:
    """
    Process a single city through the context pipeline.

    Args:
        locode (str): The city locode to process

    Returns:
        tuple[bool, str]: (success status, error message if failed)
    """
    print(f"\nProcessing {locode}")

    try:
        print("Getting city context data...")
        context_data = get_context(locode)
        if context_data is None:
            return False, "Failed to fetch city context data"
        print("Done...")

        print("Adding/updating city context data...")
        add_context_to_city_data(locode, context_data)
        print("Done...")

        print(f"Successfully processed {locode}")
        return True, ""
    except Exception as e:
        error_msg = str(e)
        print(f"Error processing {locode}: {error_msg}")
        return False, error_msg


def main(bulk_file: Path) -> None:
    """
    Main function to run the context pipeline for multiple cities.

    Args:
        bulk_file (Path): Path to JSON file containing list of locodes
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

            success, error_msg = process_city(city_locode)
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
        description="Run the city context pipeline for multiple cities."
    )
    parser.add_argument(
        "--bulk_file",
        type=Path,
        required=True,
        help="Path to JSON file containing list of locodes for bulk processing",
    )

    args = parser.parse_args()
    main(args.bulk_file)
