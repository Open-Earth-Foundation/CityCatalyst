import json
from pathlib import Path
import argparse
from jsonschema import validate, ValidationError

# Constant schema path and base folder for output files
SCHEMA_PATH = Path("../schema/generic_action_schema.json")
OUTPUT_BASE_PATH = Path("../data/climate_actions/output")


def main(output_filename):
    # Load the schema
    schema = json.load(open(SCHEMA_PATH))

    # Construct the full path to the output file
    output_path = OUTPUT_BASE_PATH / output_filename

    # Load the output JSON file
    try:
        output = json.load(open(output_path))
    except FileNotFoundError:
        print(
            f"Error: Output file '{output_filename}' not found in {OUTPUT_BASE_PATH}."
        )
        return

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


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Validate JSON output against a schema."
    )
    parser.add_argument(
        "--file",
        type=str,
        required=True,
        help="Name of the output JSON file to be validated (e.g., 'c40_output.json').",
    )

    args = parser.parse_args()
    main(args.file)
