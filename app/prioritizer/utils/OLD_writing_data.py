from pathlib import Path
import json
import sys

BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent
OUTPUT_PATH = BASE_DIR / "app" / "prioritizer" / "data" / "prioritized_local_testing"


def write_output(top_actions, filename):
    """
    Writes the given list of actions (top_actions) to a JSON file in the OUTPUT_PATH.
    Creates the directory if it does not exist.
    """
    full_path = OUTPUT_PATH / filename
    try:
        # Create the output directory if it doesn't exist
        OUTPUT_PATH.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        print("Error creating output directory:", e)
        return
    except Exception as e:
        print("Unexpected error creating output directory:", e)
        return

    try:
        # Write JSON data to the specified file
        with full_path.open("w", encoding="utf-8") as f:
            json.dump(top_actions, f, indent=4)
        print(f"Successfully wrote to {filename}.")
    except Exception as e:
        print(f"Error writing to {filename}:", e)
