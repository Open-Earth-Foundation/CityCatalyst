import argparse
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


def main(input_file, parse_rows=None):
    # Load the data into a DataFrame
    # climate_action_library_test.csv for testing and changing values
    # climate_action_library_original.csv for original C40 list
    data_path = Path("../data") / input_file
    df = load_datafile_into_df(data_path)

    # Prepare a list to hold all mapped data
    mapped_data = []

    # Define a list of extraction functions and corresponding JSON fields
    extraction_functions = {
        # "ActionID": extract_ActionID, -> not in the mapping because it is already set in the main script as incremental index
        "ActionName": extract_ActionName,
        # "ActionType": extract_ActionType, -> not in the mapping because it is already extracted in the main script as first step
        "AdaptationCategory": extract_AdaptationCategory,
        # "Hazard": extract_Hazard,
        # "Sector": extract_Sector,
        "Subsector": extract_Subsector,
        "PrimaryPurpose": extract_PrimaryPurpose,
        # "InterventionType": extract_InterventionType,
        # "Description": extract_Description,
        # "BehavioralChangeTargeted": extract_BehavioralChangeTargeted,
        "CoBenefits": extract_CoBenefits,
        "EquityAndInclusionConsiderations": extract_EquityAndInclusionConsiderations,
        "GHGReductionPotential": extract_GHGReductionPotential,
        # "AdaptionEffectiveness": extract_AdaptionEffectiveness,
        "CostInvestmentNeeded": extract_CostInvestmentNeeded,
        "TimelineForImplementation": extract_TimelineForImplementation,
        # "Dependencies": extract_Dependencies,
        "KeyPerformanceIndicators": extract_KeyPerformanceIndicators,
        "Impacts": extract_Impacts,
    }

    # For testing, only process x rows
    if parse_rows:
        df = df.tail(parse_rows)
    else:
        # For production, process all rows
        pass

    # Incremental counter for ActionID
    action_id = 1

    # Iterate over DataFrame rows
    for index, df_row in df.iterrows():
        print(f"Processing row {index}...\n")
        mapped_row = {}

        # Assign an incremental value to ActionID
        mapped_row["ActionID"] = f"{action_id:04d}"

        # Extract 'ActionType' first
        action_type = extract_ActionType(df_row)
        mapped_row["ActionType"] = action_type

        # Extract 'Hazard'
        hazard = extract_Hazard(df_row, action_type)
        mapped_row["Hazard"] = hazard

        # Extract 'Sector'
        sectors = extract_Sector(df_row, action_type)
        mapped_row["Sector"] = sectors

        # Extract 'InterventionType'
        intervention_type = extract_InterventionType(df_row, action_type)
        mapped_row["InterventionType"] = intervention_type

        # Extract 'Description'
        description = extract_Description(df_row)
        mapped_row["Description"] = description

        # Extract 'BehavioralChangeTargeted'
        behavioral_change_targeted = extract_BehavioralChangeTargeted(
            df_row, action_type, intervention_type
        )
        mapped_row["BehavioralChangeTargeted"] = behavioral_change_targeted

        # Extract 'AdaptationEffectiveness'
        adaptation_effectiveness = extract_AdaptionEffectiveness(
            action_type, description, hazard
        )
        mapped_row["AdaptionEffectiveness"] = adaptation_effectiveness

        # Extract 'Dependencies'
        dependencies = extract_Dependencies(description)
        mapped_row["Dependencies"] = dependencies

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


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Process climate action data and map it to JSON."
    )
    parser.add_argument(
        "--input-file",
        required=True,
        type=str,
        help="Name of the input CSV file located in '../data/'",
    )
    parser.add_argument(
        "--parse-rows",
        required=False,
        type=int,
        help="Number of rows to parse for testing purposes. If this argument is set, only the first x rows will be processed.",
    )

    args = parser.parse_args()

    main(args.input_file, args.parse_rows)
