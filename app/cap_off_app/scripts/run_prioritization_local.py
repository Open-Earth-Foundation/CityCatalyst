"""
This script runs the prioritization pipeline for multiple cities in bulk.
It uses the HIAP API background task function _execute_prioritization_bulk_subtask to run the prioritization pipeline for each city.

The pipeline processes all cities listed in a JSON file containing locodes located at `app/cap_off_app/data/city_data/city_data.json`.
For each city, it will:
1. Run the prioritization pipeline
2. Store the result in the `app/cap_off_app/data/prioritization/prioritization_results.json` file

Usage:
    This script needs to be run from the 'app' directory to be able to import the prioritizer module.
    cd app
    python -m cap_off_app.scripts.run_prioritization_local
"""

import uuid
import json
from datetime import datetime
from pathlib import Path
import threading
import time

from prioritizer.models import (
    PrioritizationType,
    CityContextData,
    CityEmissionsData,
    CityData,
)
from prioritizer.tasks import _execute_prioritization_bulk_subtask
from prioritizer.task_storage import task_storage


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


# Initialize the bulk task (same structure as the API)
main_task_id = str(uuid.uuid4())
task_storage[main_task_id] = {
    "status": "pending",
    "created_at": datetime.now().isoformat(),
    "subtasks": [
        {
            "locode": c.cityContextData.locode,
            "status": "pending",
            "result": None,
            "error": None,
        }
        for c in city_data_list
    ],
    "prioritizer_response_bulk": None,
    "error": None,
}


# Run subtasks in parallel using a similar pattern as the API
start_time = time.time()
threads = []
for idx, city_data in enumerate(city_data_list):
    background_task_input = {
        "cityData": city_data,
        "prioritizationType": prioritization_type,
        "language": languages,
        "countryCode": country_code,
    }
    print(
        f"Starting prioritization for {city_data.cityContextData.locode} ({idx+1}/{len(city_data_list)})"
    )
    thread = threading.Thread(
        target=_execute_prioritization_bulk_subtask,
        args=(main_task_id, idx, background_task_input),
    )
    threads.append(thread)
    thread.start()

# Wait for all threads to complete
for thread in threads:
    thread.join()

end_time = time.time()
print("All prioritizations completed.")
print(f"Total execution time: {end_time - start_time:.2f} seconds")


# Read the aggregated result (PrioritizerResponseBulk)
result = task_storage[main_task_id]["prioritizer_response_bulk"]

# Save results to file
output_dir = project_root / "app" / "cap_off_app" / "data" / "prioritizations"
output_dir.mkdir(parents=True, exist_ok=True)
output_path = output_dir / "prioritization_results_local.json"
output_path.write_text(result.model_dump_json(indent=2), encoding="utf-8")
print(f"Saved results to {output_path}")
