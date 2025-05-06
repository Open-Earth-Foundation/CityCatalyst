"""
Use this script to convert an Excel or CSV file to a JSON file.
E.g. for creating an excel list out of our actions json file

Example:
python xlsx_csv2json.py --input_file ../data/climate_actions/output/merged.xlsx --output_file merged.json
python xlsx_csv2json.py --input_file ../data/climate_actions/output/merged.csv --output_file merged.json
"""

import argparse
import pandas as pd
from pathlib import Path
import ast  # For safely evaluating string representations of lists and dictionaries
import json


def xlsx_csv2json(input_file: Path, output_file: Path):
    # Define file paths using Path
    OUTPUT_PATH = Path("./script_outputs")

    # Ensure the input file exists
    if not input_file.is_file():
        raise FileNotFoundError(f"Input file not found: {input_file}")

    # Read the file based on its extension
    file_extension = input_file.suffix.lower()
    if file_extension == ".xlsx":
        df = pd.read_excel(input_file)
    elif file_extension == ".csv":
        df = pd.read_csv(input_file)
    else:
        raise ValueError(
            f"Unsupported file format: {file_extension}. Only .xlsx and .csv files are supported."
        )

    # Process each column to cast strings like "[\"value\"]" or "{\"key\": \"value\"}" to proper types
    def safe_eval(value):
        if isinstance(value, str):
            try:
                # Try to parse JSON-like strings (dict or list)
                return json.loads(value)
            except json.JSONDecodeError:
                try:
                    # Fallback to evaluating Python-like strings
                    return ast.literal_eval(value)
                except (ValueError, SyntaxError):
                    # If parsing fails, return the original string
                    return value
        return value

    # Apply the safe_eval function to the DataFrame
    df = df.map(safe_eval)

    # Export to JSON with proper types
    df.to_json(OUTPUT_PATH / output_file, orient="records", indent=4)

    print(f"File successfully exported to JSON at {OUTPUT_PATH / output_file}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Convert Excel or CSV to JSON")
    parser.add_argument(
        "--input_file", type=Path, required=True, help="Path to the .xlsx or .csv file"
    )
    parser.add_argument(
        "--output_file",
        type=Path,
        required=True,
        help="Output file name (in script_outputs folder)",
    )

    args = parser.parse_args()

    xlsx_csv2json(args.input_file, args.output_file)
