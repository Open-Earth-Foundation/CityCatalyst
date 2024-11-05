import os
import sys
import pandas as pd


def load_datafile_into_df(file_path):

    try:
        # Check if the file exists and its type
        if os.path.exists(file_path):
            print(f"File found: {file_path}")
            if file_path.endswith((".xlsx", ".xls")):
                df = pd.read_excel(file_path)

            elif file_path.endswith(".csv"):
                df = pd.read_csv(file_path)

            else:
                print("Unsupported file type. Please provide a CSV or Excel file.")
                return None

            return df
        else:
            print(f"File not found: {os.path.basename(file_path)}")
            sys.exit()
    except Exception as error:
        print(f"Error: {error}")
        sys.exit()
