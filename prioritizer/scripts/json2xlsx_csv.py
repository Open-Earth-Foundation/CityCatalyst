import json
import pandas as pd
from pathlib import Path
import argparse


def json2xlsx_csv(json_file: Path, output_file: Path):

    output_folder = Path("./script_outputs")

    csv_file = output_file.with_suffix(".csv")
    excel_file = output_file.with_suffix(".xlsx")

    # Read the JSON file with UTF-8 encoding
    with open(json_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Convert to a DataFrame
    df = pd.DataFrame(data)

    # Save the DataFrame to a CSV file with UTF-8 encoding
    df.to_csv(output_folder / csv_file, index=False, encoding="utf-8")

    # Save the DataFrame to an Excel file
    # Excel files inherently support UTF-8 by default when using pandas
    df.to_excel(output_folder / excel_file, index=False, engine="openpyxl")

    print(f"Data successfully saved to:\n- {csv_file}\n- {excel_file}")


if __name__ == "__main__":

    parser = argparse.ArgumentParser(description="Convert JSON to CSV")
    parser.add_argument(
        "--json_file", type=Path, required=True, help="Path to the JSON file"
    )
    parser.add_argument(
        "--output_file",
        type=Path,
        required=True,
        help="Base path for the output files (e.g., output.csv)",
    )

    args = parser.parse_args()

    json2xlsx_csv(args.json_file, args.output_file)
