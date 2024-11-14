import json
from utils.data_loader import load_datafile_into_df
from utils.extraction_functions import (
    extract_ActionType,
    extract_ActionName,
    extract_AdaptationCategory,
    extract_Hazard,
    extract_Sector,
    extract_Subsector,
    extract_PrimaryPurpose,
    extract_InterventionType,
    extract_Description,
    extract_BehavioralChangeTargeted,
    extract_CoBenefits,
    extract_EquityAndInclusionConsiderations,
    extract_GHGReductionPotential,
    extract_AdaptionEffectiveness,
    extract_CostInvestmentNeeded,
    extract_TimelineForImplementation,
    extract_Dependencies,
    extract_KeyPerformanceIndicators,
    extract_Impacts,
)
from pathlib import Path

# Load the data into a DataFrame
# climate_action_library_test.csv for testing and changing values
# climate_action_library_original.csv for original C40 list
df = load_datafile_into_df(Path("../data/climate_action_library_test.csv"))

# Prepare a list to hold all mapped data
mapped_data = []

# Define a list of extraction functions and corresponding JSON fields
extraction_functions = {
    # "ActionID": extract_ActionID, -> not in the mapping because it is already set in the main script as incremental index
    "ActionName": extract_ActionName,
    # "ActionType": extract_ActionType, -> not in the mapping because it is already extracted in the main script as first step
    "AdaptationCategory": extract_AdaptationCategory,
    "Hazard": extract_Hazard,
    # "Sector": extract_Sector,
    "Subsector": extract_Subsector,
    "PrimaryPurpose": extract_PrimaryPurpose,
    "InterventionType": extract_InterventionType,
    "Description": extract_Description,
    "BehavioralChangeTargeted": extract_BehavioralChangeTargeted,
    "CoBenefits": extract_CoBenefits,
    "EquityAndInclusionConsiderations": extract_EquityAndInclusionConsiderations,
    "GHGReductionPotential": extract_GHGReductionPotential,
    "AdaptionEffectiveness": extract_AdaptionEffectiveness,
    "CostInvestmentNeeded": extract_CostInvestmentNeeded,
    "TimelineForImplementation": extract_TimelineForImplementation,
    "Dependencies": extract_Dependencies,
    "KeyPerformanceIndicators": extract_KeyPerformanceIndicators,
    "Impacts": extract_Impacts,
}

# For testing, only process x rows
df_subset = df  # .head(2)

# Incremental counter for ActionID
action_id = 1

# Iterate over DataFrame rows
for index, df_row in df_subset.iterrows():
    print(f"Processing row {index}...\n")
    mapped_row = {}

    # Assign an incremental value to ActionID
    mapped_row["ActionID"] = f"{action_id:04d}"

    # Extract 'ActionType' first
    action_type = extract_ActionType(df_row)
    mapped_row["ActionType"] = action_type

    # Extract 'Sector'
    sectors = extract_Sector(df_row, action_type)
    mapped_row["Sector"] = sectors

    # iterate over extraction functions and apply them to the row
    for attribute_name, function in extraction_functions.items():
        # dict_attribute = function(df_row, action_type["value"])
        dict_attribute = function(df_row, action_type, sectors)
        mapped_row[attribute_name] = dict_attribute

    mapped_data.append(mapped_row)
    action_id += 1
    print(f"\nRow {index} processed successfully.\n\n")


# Set up output directory and file path using pathlib
output_dir = Path("./output")
output_dir.mkdir(parents=False, exist_ok=True)
output_file = output_dir / "output.json"

# Optionally, save the mapped data to a JSON file
with output_file.open("w") as f:
    json.dump(mapped_data, f, indent=4)

print("JSON data has been written to output.json")
