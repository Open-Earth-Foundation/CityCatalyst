import json
from pathlib import Path

from jsonschema import validate, ValidationError

schema = json.load(open(Path("../schema/generic_action_schema.json")))
output = json.load(open(Path("../data/climate_actions/output/c40_output.json")))

all_valid = True

# Validate each entry in the output JSON file
for index, action in enumerate(output):
    try:
        validate(instance=action, schema=schema)
    except ValidationError as e:
        print(f"Validation error at entry {index}: {e.message}")
        # Optionally print the failing part of the instance
        print(f"Failing instance: {action}")
        all_valid = False

# Print success message only if all entries are valid
if all_valid:
    print("All entries are successfully validated.")
