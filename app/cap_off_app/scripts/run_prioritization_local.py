"""
This script runs the prioritization pipeline for multiple cities in bulk.
It uses the compute-only function compute_prioritization_bulk_subtask to run the prioritization pipeline for each city.

The pipeline processes all cities listed in a JSON file containing locodes located at `app/cap_off_app/data/city_data/city_data.json`.
For each city, it will:
1. Run the prioritization pipeline
2. Store the result in the `app/cap_off_app/data/prioritizations/prioritization_results_local.json` file

Usage:
    This script needs to be run from the 'app' directory to be able to import the prioritizer module.
    cd app
    python -m cap_off_app.scripts.run_prioritization_local
"""

import json
from pathlib import Path
import threading
import time

from prioritizer.models import (
    PrioritizationType,
    CityContextData,
    CityEmissionsData,
    CityData,
    PrioritizerResponse,
    PrioritizerResponseBulk,
)
from prioritizer.tasks import compute_prioritization_bulk_subtask
from services.get_actions import get_actions


# Load local city data JSON
project_root = Path(__file__).resolve().parents[3]
json_path = (
    project_root / "app" / "cap_off_app" / "data" / "city_data" / "city_data.json"
)
with json_path.open("r", encoding="utf-8") as f:
    all_cities = json.load(f)


# Map JSON entries to CityData models expected by the worker
def json_to_city_data(item: dict) -> CityData:
    return CityData(
        cityContextData=CityContextData(
            locode=item["locode"],
            populationSize=item.get("populationSize"),
        ),
        cityEmissionsData=CityEmissionsData(
            stationaryEnergyEmissions=item.get("stationaryEnergyEmissions"),
            transportationEmissions=item.get("transportationEmissions"),
            wasteEmissions=item.get("wasteEmissions"),
            ippuEmissions=item.get("industrialProcessEmissions"),
            afoluEmissions=item.get("landUseEmissions"),
        ),
    )


city_data_list = [json_to_city_data(item) for item in all_cities]


# Inputs
prioritization_type = PrioritizationType.BOTH
languages = ["en", "es", "pt"]
country_code = "BR"


# Get actions from the API
actions = get_actions()
if not actions:
    raise Exception("Could not retrieve actions from the API.")


results: list[PrioritizerResponse | None] = [None] * len(city_data_list)
errors: list[str | None] = [None] * len(city_data_list)


# Helper to build requestData for compute function
def build_request_data(city_data: CityData) -> dict:
    return {
        "locode": city_data.cityContextData.locode,
        "populationSize": city_data.cityContextData.populationSize,
        "stationaryEnergyEmissions": city_data.cityEmissionsData.stationaryEnergyEmissions,
        "transportationEmissions": city_data.cityEmissionsData.transportationEmissions,
        "wasteEmissions": city_data.cityEmissionsData.wasteEmissions,
        "ippuEmissions": city_data.cityEmissionsData.ippuEmissions,
        "afoluEmissions": city_data.cityEmissionsData.afoluEmissions,
    }


def worker(idx: int, city_data: CityData):
    background_task_input = {
        "requestData": build_request_data(city_data),
        "prioritizationType": prioritization_type,
        "language": languages,
        "countryCode": country_code,
        "actions": actions,
    }
    try:
        resp = compute_prioritization_bulk_subtask(
            background_task_input, mode="tournament_ranking"
        )
        status = resp.get("status")
        if status == "completed":
            result_dict = resp.get("result")
            # Validate into model for consistent serialization
            results[idx] = PrioritizerResponse.model_validate(result_dict)
        else:
            errors[idx] = str(resp.get("error") or "Unknown error")
    except Exception as e:
        errors[idx] = str(e)


# Run subtasks in parallel using threads
start_time = time.time()
threads = []
for idx, city_data in enumerate(city_data_list):
    print(
        f"Starting prioritization for {city_data.cityContextData.locode} ({idx+1}/{len(city_data_list)})"
    )
    thread = threading.Thread(target=worker, args=(idx, city_data))
    threads.append(thread)
    thread.start()

# Wait for all threads to complete
for thread in threads:
    thread.join()

end_time = time.time()
print("All prioritizations completed.")
print(f"Total execution time: {end_time - start_time:.2f} seconds")


# Aggregate successful results only, mirroring API behavior
successful_results = [r for r in results if r is not None]
result = PrioritizerResponseBulk(prioritizerResponseList=successful_results)

# Save results to file
output_dir = project_root / "app" / "cap_off_app" / "data" / "prioritizations"
output_dir.mkdir(parents=True, exist_ok=True)
output_path = output_dir / "prioritization_results_local.json"
output_path.write_text(result.model_dump_json(indent=2), encoding="utf-8")
print(f"Saved results to {output_path}")
