from pathlib import Path
import json

# Define the folder containing JSON files and the output file path
input_folder = Path("../data/climate_actions/output")
output_file = Path("../data/climate_actions/output/combined_output.json")


def combine_json_files(input_folder, output_file):
    combined_data = []  # List to store combined JSON data

    # Iterate through all JSON files in the folder
    for file_path in input_folder.glob("*.json"):  # Use glob to match JSON files
        try:
            with file_path.open("r", encoding="utf-8") as file:
                data = json.load(file)  # Load JSON data
                if isinstance(data, list):  # Ensure the file contains a list
                    combined_data.extend(data)
                else:
                    combined_data.append(data)  # Add individual dictionaries
        except Exception as e:
            print(f"Error reading file {file_path}: {e}")

    # Write the combined data to the output file
    try:
        output_file.parent.mkdir(
            parents=True, exist_ok=True
        )  # Ensure the output directory exists
        with output_file.open("w", encoding="utf-8") as output:
            json.dump(combined_data, output, indent=4, ensure_ascii=False)
        print(f"Combined JSON saved to {output_file}")
    except Exception as e:
        print(f"Error writing to output file: {e}")


# Run the function
combine_json_files(input_folder, output_file)
