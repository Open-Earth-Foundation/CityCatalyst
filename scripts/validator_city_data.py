"""
This script can be used to validate the city data JSON file against the city schema.

"""

import json
from pathlib import Path

from jsonschema import validate, ValidationError

schema = json.load(open(Path("../schema/city.json")))
output = json.load(open(Path("../data/cities/city_data.json")))

all_valid = True

# Validate each entry in the output JSON file
for index, city in enumerate(output):
    try:
        validate(instance=city, schema=schema)
    except ValidationError as e:
        print(f"Validation error at entry {index}: {e.message}")
        # Optionally print the failing part of the instance
        print(f"Failing instance: {city}")
        all_valid = False

# Print success message only if all entries are valid
if all_valid:
    print("All entries are successfully validated.")
