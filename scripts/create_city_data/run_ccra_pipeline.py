# run_ccra_pipeline.py

"""
This script runs the CCRA pipeline for a given city and scenario.

The pipeline consists of the following steps:
1. Get the CCRA data for the given city and scenario. This will save the data to a file called "ccra_data.json" in the data/ccra folder.
2. Extract the CCRA data from the file.
3. Add the CCRA data to the city data. This will save the data to a file called "city_data.json" in the data/city_data folder.
"""

import argparse
from get_ccra import get_ccra
from add_ccras_to_city_data import extract_ccras, add_extracted_ccras_to_city_data


def main(locode, scenario_name):
    print(f"Running CCRA pipeline for {locode} with scenario {scenario_name}")

    print("Getting CCRA data...")
    get_ccra(locode, scenario_name)
    print("Done...")

    print("Extracting CCRA data...")
    print(locode)
    list_extracted_ccras = extract_ccras(locode)
    print("Done...")

    print("Adding CCRA data to city data...")
    add_extracted_ccras_to_city_data(locode, list_extracted_ccras)
    print("Done...")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the CCRA pipeline.")
    parser.add_argument(
        "--locode",
        type=str,
        required=True,
        help="The locode of the city to run the pipeline on (e.g., BR CCI - with space between country and city).",
    )
    parser.add_argument(
        "--scenario_name",
        type=str,
        default="current",
        help="The scenario name (e.g., current).",
    )
    args = parser.parse_args()
    main(args.locode, args.scenario_name)
