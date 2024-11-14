import sys
import pandas as pd
from pathlib import Path


def load_datafile_into_df(file_path):
    # Ensure file_path is a Path object
    file_path = Path(file_path)

    try:
        # Check if the file exists and its type
        if file_path.exists():
            print(f"File found: {file_path}")
            if file_path.suffix in [".xlsx", ".xls"]:
                df = pd.read_excel(file_path)

            elif file_path.suffix == ".csv":
                df = pd.read_csv(file_path)

            else:
                print("Unsupported file type. Please provide a CSV or Excel file.")
                return None

            return df
        else:
            print(f"File not found: {file_path.name}")
            sys.exit()
    except Exception as error:
        print(f"Error: {error}")
        sys.exit()
