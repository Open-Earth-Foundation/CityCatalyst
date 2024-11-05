import pandas as pd
import json
import copy
from utils.data_loader import load_datafile_into_df

# Read the JSON schema from the file
with open("generic_output_schema.json", "r") as schema_file:
    json_template = json.load(schema_file)

# Load the data into a DataFrame
df = load_datafile_into_df("files/Climate Action Library.xlsx")

print(df.head())

print(df.columns)

# Define the mapping from DataFrame columns to JSON keys
column_to_json_mapping = {
    "Title": "ActionName",
    "Adaption/Mitigation": "ActionType",
    "Emissions Source Category": "Sector",
    "Explainer for action card": "Description",
    # add more mappings here, but for now just testing with these
}


# Function to map a DataFrame row to the JSON object
def map_row_to_json(row, mapping, template):
    json_obj = copy.deepcopy(
        template
    )  # Deep copy to avoid mutating the original template
    for df_col, json_key in mapping.items():
        if df_col in row and json_key in json_obj:
            value = row[df_col]
            # Handle arrays and strings appropriately
            if json_obj[json_key].get("type") == "array":
                if not isinstance(value, list):
                    value = [value]
                json_obj[json_key]["value"] = value
            else:
                json_obj[json_key]["value"] = value
            # Indicate that the value was provided and not generated
            if "generated" in json_obj[json_key]:
                json_obj[json_key]["generated"]["value"] = False
    return json_obj


# Apply the mapping function to each row of the DataFrame
json_list = []

# For testing, only process the first row
df_subset = df.head(2)

for index, row in df_subset.iterrows():
    json_obj = map_row_to_json(row, column_to_json_mapping, json_template)
    json_list.append(json_obj)

# Write the JSON objects to output.json
with open("output.json", "w") as output_file:
    json.dump(json_list, output_file, indent=4)

print("JSON data has been written to output.json")
