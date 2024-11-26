import argparse
import json
import asyncio
from utils.data_loader import load_datafile_into_df
from extraction_functions import (
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

# Create a semaphore with a concurrency limit (e.g., 10 tasks at a time)
semaphore = asyncio.Semaphore(100)


async def process_row_with_limit(index, df_row):
    async with semaphore:  # Limit concurrency
        return await process_row(index, df_row)


async def process_row(index, df_row):
    print(f"Processing row {index}...\n")
    mapped_row = {}

    # Assign an incremental value to ActionID
    # ActionID is row index + 1, zero-padded to 4 digits
    mapped_row["ActionID"] = f"c40_{index+1:04d}"

    # Extract synchronous fields
    action_name = extract_ActionName(index, df_row)
    mapped_row["ActionName"] = action_name

    action_type = extract_ActionType(index, df_row)
    mapped_row["ActionType"] = action_type

    adaptation_category = extract_AdaptationCategory(index, df_row, action_type)
    mapped_row["AdaptationCategory"] = adaptation_category

    hazard = extract_Hazard(index, df_row, action_type)
    mapped_row["Hazard"] = hazard

    sectors = extract_Sector(index, df_row)
    mapped_row["Sector"] = sectors

    subsectors = extract_Subsector(index, df_row, action_type)
    mapped_row["Subsector"] = subsectors

    primary_purpose = extract_PrimaryPurpose(index, action_type)
    mapped_row["PrimaryPurpose"] = primary_purpose

    # Extract asynchronous fields
    intervention_type = await extract_InterventionType(index, df_row, action_type)
    mapped_row["InterventionType"] = intervention_type

    description = extract_Description(index, df_row)
    mapped_row["Description"] = description

    behavioral_change_targeted = await extract_BehavioralChangeTargeted(
        index, df_row, action_type, intervention_type
    )
    mapped_row["BehavioralChangeTargeted"] = behavioral_change_targeted

    co_benefits = extract_CoBenefits(index, df_row)
    mapped_row["CoBenefits"] = co_benefits

    equity_and_inclusion_considerations = (
        await extract_EquityAndInclusionConsiderations(index, df_row)
    )
    mapped_row["EquityAndInclusionConsiderations"] = equity_and_inclusion_considerations

    ghg_reduction_potential = extract_GHGReductionPotential(
        index, df_row, action_type, sectors
    )
    mapped_row["GHGReductionPotential"] = ghg_reduction_potential

    adaptation_effectiveness = await extract_AdaptionEffectiveness(
        index, action_type, description, hazard
    )
    mapped_row["AdaptionEffectiveness"] = adaptation_effectiveness

    cost_investment_needed = extract_CostInvestmentNeeded(index, df_row)
    mapped_row["CostInvestmentNeeded"] = cost_investment_needed

    timeline_for_implementation = extract_TimelineForImplementation(index, df_row)
    mapped_row["TimelineForImplementation"] = timeline_for_implementation

    dependencies = await extract_Dependencies(index, description)
    mapped_row["Dependencies"] = dependencies

    key_performance_indicators = await extract_KeyPerformanceIndicators(
        index, description
    )
    mapped_row["KeyPerformanceIndicators"] = key_performance_indicators

    impacts = await extract_Impacts(
        index,
        action_type,
        sectors,
        subsectors,
        primary_purpose,
        intervention_type,
        description,
        behavioral_change_targeted,
        co_benefits,
        equity_and_inclusion_considerations,
        ghg_reduction_potential,
        adaptation_category,
        hazard,
        adaptation_effectiveness,
    )
    mapped_row["Impacts"] = impacts

    print(f"\nRow {index}: Processed successfully.\n\n")
    return mapped_row


async def main(input_file, parse_rows=None):
    # Load the data into a DataFrame
    # climate_action_library_test.csv for testing and changing values
    # climate_action_library_original.csv for original C40 list
    data_path = Path("../data/climate_actions") / input_file
    df = load_datafile_into_df(data_path)

    # Prepare a list to hold all mapped data
    mapped_data = []

    # For testing, only process x rows
    if parse_rows:
        df = df.head(parse_rows)
    else:
        # For production, process all rows
        pass

    # Create tasks with limited concurrency
    tasks = [process_row_with_limit(index, df_row) for index, df_row in df.iterrows()]

    # Run tasks
    results = await asyncio.gather(*tasks)
    mapped_data.extend(results)

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

    asyncio.run(main(args.input_file, args.parse_rows))
