#!/usr/bin/env python3
import pandas as pd
from pathlib import Path
import numpy as np

def filter_empty_adaptation_fields(df):
    """Filter out actions with empty Hazard or AdaptationEffectiveness fields"""
    empty_hazard = df['Hazard'].isna()
    empty_adaptation = df['AdaptationEffectiveness'].isna()
    
    # Get deleted and updated actions
    deleted_actions = df[empty_hazard | empty_adaptation]
    updated_actions = df[~(empty_hazard | empty_adaptation)]
    
    return updated_actions, deleted_actions

def filter_empty_mitigation_fields(df):
    """Filter out mitigation actions that have no GHG reduction potential"""
    # First identify mitigation actions
    is_mitigation = df['ActionType'].apply(lambda x: 'mitigation' in x if isinstance(x, list) else False)
    
    # Check for empty GHG reduction potential in all sectors
    ghg_fields = ['stationary_energy', 'transportation', 'waste', 'ippu', 'afolu']
    has_ghg = df['GHGReductionPotential'].apply(
        lambda x: any(x.get(field) is not None for field in ghg_fields) if isinstance(x, dict) else False
    )
    
    # Actions to delete are mitigation actions without GHG potential
    deleted_actions = df[is_mitigation & ~has_ghg]
    updated_actions = df[~(is_mitigation & ~has_ghg)]
    
    return updated_actions, deleted_actions

def main():
    # ======== Configuration =========
    # Set paths using pathlib
    script_dir = Path(__file__).parent
    base_dir = script_dir.parent / 'data/climate_actions/output'
    output_dir = script_dir / 'scripts_outputs'

    # Create scripts_outputs directory if it doesn't exist
    output_dir.mkdir(exist_ok=True)

    # Set input and output file paths
    file_path = base_dir / 'merged.json'
    updated_file_path = output_dir / 'updated_merged.json'
    deleted_file_path = output_dir / 'deleted_actions.json'

    # ======== Load Data =========
    df = pd.read_json(file_path)

    # Choose which filter to use (uncomment one)
    # updated_actions, deleted_actions = filter_empty_adaptation_fields(df)
    updated_actions, deleted_actions = filter_empty_mitigation_fields(df)

    # ======== Output and Save Results =========
    print("List of Deleted Actions:")
    print(deleted_actions)
    print(f"\nNumber of deleted actions: {len(deleted_actions)}")
    print(f"Number of remaining actions: {len(updated_actions)}")

    # Save the updated actions list to a new JSON file.
    updated_actions.to_json(updated_file_path, orient='records', lines=True)
    print(f"\nUpdated actions list saved to: {updated_file_path}")

    # Save the deleted actions list to its own JSON file.
    deleted_actions.to_json(deleted_file_path, orient='records', lines=True)
    print(f"Deleted actions list saved to: {deleted_file_path}")

if __name__ == "__main__":
    main()