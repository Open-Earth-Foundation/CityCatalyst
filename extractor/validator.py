import json
from pathlib import Path

from jsonschema import validate, ValidationError

schema = json.load(open(Path("generic_action_schema.json")))
output = json.load(open(Path("./output/output.json")))

# Validate each entry in the output JSON file
for index, action in enumerate(output):
    try:
        validate(instance=action, schema=schema)
    except ValidationError as e:
        print(f"Validation error at entry {index}: {e.message}")
        # Optionally print the failing part of the instance
        print(f"Failing instance: {action}")
