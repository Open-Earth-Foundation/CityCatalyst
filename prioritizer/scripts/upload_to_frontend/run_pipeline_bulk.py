#!/usr/bin/env python3

"""
This script runs the complete pipeline for multiple cities in bulk.

IMPORTANT: If you only want to run parts of the pipeline, go to `scripts/upload_to_frontend/run_pipeline.py` and
comment out the parts of the pipeline you don't want to run.

The pipeline processes all cities listed in a JSON file containing locodes.
For each city, it will:
1. Run the prioritizer
2. Enrich the data for frontend (both mitigation and adaptation)
3. Upload the results to S3

Usage (from the root directory):
    python -m scripts.upload_to_frontend.run_pipeline_bulk --bulk_file data/cities/brazil_city_locodes.json --workers 10
"""

import argparse
import json
from pathlib import Path
from multiprocessing import Pool, cpu_count
from .run_pipeline import main as pipeline_main

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
    Process a single city through the complete pipeline.

    Args:
        locode (str): The city locode to process

    Returns:
        tuple[bool, str]: (success status, error message if failed)
    """
    print(f"\nProcessing {locode}")

    try:
        pipeline_main(locode)
        print(f"Successfully processed {locode}")
        return True, ""
    except Exception as e:
        error_msg = str(e)
        print(f"Error processing {locode}: {error_msg}")
        return False, error_msg


def process_cities_parallel(locodes: list, num_workers: int) -> tuple[list, list]:
    """
    Process cities in parallel using multiple workers.

    Args:
        locodes (list): List of city locodes to process
        num_workers (int): Number of parallel workers to use

    Returns:
        tuple[list, list]: (list of successful cities, list of (failed city, error) tuples)
    """
    successful_cities = []
    failed_cities = []

    with Pool(processes=num_workers) as pool:
        results = pool.map(process_city, locodes)

    for city_locode, (success, error_msg) in zip(locodes, results):
        if success:
            successful_cities.append(city_locode)
        else:
            failed_cities.append((city_locode, error_msg))

    return successful_cities, failed_cities


def main(bulk_file: Path, workers: int) -> None:
    """
    Main function to run the pipeline for multiple cities.

    Args:
        bulk_file (Path): Path to JSON file containing list of locodes
        workers (int, optional): Number of parallel workers to use. Defaults to CPU count.
    """

    successful_cities = []
    failed_cities = []

    try:
        locodes = load_locodes_from_file(bulk_file)
        print(f"Loaded {len(locodes)} locodes from {bulk_file}")
        print(f"Processing with {workers} parallel workers")

        # Filter out invalid locodes first
        valid_locodes = [locode for locode in locodes if isinstance(locode, str)]
        invalid_locodes = [
            (locode, "Invalid locode type")
            for locode in locodes
            if not isinstance(locode, str)
        ]

        if invalid_locodes:
            failed_cities.extend(invalid_locodes)
            print(f"Skipped {len(invalid_locodes)} invalid locodes")

        # Process valid locodes in parallel
        successful_cities, failed_results = process_cities_parallel(
            valid_locodes, workers
        )
        failed_cities.extend(failed_results)

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
        description="Run the complete pipeline for multiple cities."
    )
    parser.add_argument(
        "--bulk_file",
        type=Path,
        required=True,
        help="Path to JSON file containing list of locodes for bulk processing",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=cpu_count(),
        help="Number of parallel workers to use. Defaults to CPU count.",
    )

    args = parser.parse_args()
    main(args.bulk_file, args.workers)
