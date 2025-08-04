import csv
import os
import json
import pandas as pd
from pathlib import Path
from utils import (
    make_dir,
    write_dic_to_csv,
    uuid_generate_v3,
    uuid_generate_v4,
    get_filename,
    set_seed,
    string_to_hash,
)

def save_to_csv(fl, data):
    """save list of dictionaries to CSV"""
    with open(fl, "w", newline="") as csvfile:
        fieldnames = data[0].keys()  # Assuming all dictionaries have the same keys
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)

        writer.writeheader()
        writer.writerows(data)


# diccionary of GWP AR6 - 2021 - 100-year time period
GWP_dic_100years = {
    "CO2": {"value": 1, "portion": 0.80},
    "CH4": {"value": 29.8, "portion": 0.15},
    "N2O": {"value": 273, "portion": 0.05},
}

gpc_mapping = {
    'I.1.2': 'energy-consumption-residential-buildings-methodology',
    'I.2.2': 'energy-consumption-commercial-buildings-methodology', 
    'I.3.2': 'energy-consumption-manufacturing-and-construction-methodology', 
    'I.4.2': 'energy-consumption-energy-industries-methodology', 
    'I.5.2': 'energy-consumption-agriculture-forestry-fishing-activities-methodology', 
    'I.6.2': 'energy-consumption-non-specific-sources-methodology', 
    'II.1.2': 'electricity-consumption-on-road-transport-methodology', 
    'II.2.2': 'electricity-consumption-railways-methodology', 
    'II.3.2': 'electricity-consumption-waterborne-navigation-methodology', 
    'II.4.2': 'electricity-consumption-aviation-methodology', 
    'II.5.2': 'electricity-consumption-off-road-transport-methodology', 
}

if __name__ == "__main__":
    # set random.seed so UUID is reproducible
    #! assumes records always generated in same order
    seed_string = get_filename()
    seed_value = string_to_hash(seed_string)
    set_seed(seed_value)

    # output directory
    output_dir = "../data_processed/electricity_maps/"
    output_dir = os.path.abspath(output_dir)
    make_dir(path=Path(output_dir).as_posix())

    # raw data file path
    input_fl = (
        "../data_raw/electricity_maps/electricity_maps_scope2.csv"
    )
    input_fl = os.path.abspath(input_fl)

    # =================================================================
    # Publisher
    # =================================================================
    publisher_data = {
        "name": "Electricity Maps",
        "URL": "https://portal.electricitymaps.com/dashboard",
    }
    publisher_data["publisher_id"] = uuid_generate_v3(name=publisher_data.get("name"))

    write_dic_to_csv(output_dir, "Publisher", publisher_data)

    # =================================================================
    # Load and process the data first to get unique datasource names
    # =================================================================
    
    # Read the CSV file (assuming this is your processed data)
    df = pd.read_csv("../data_raw/electricity_maps/electricity_maps_scope2.csv")

    # rename columns
    df.rename(columns={
        'Country': 'region', 
        'Zone id': 'actor_id',
        'Carbon intensity gCO₂eq/kWh (direct)': 'emissions_per_activity',
        'Data estimation method': 'reference',
        'Data source': 'datasource_name'}, 
        inplace=True)

    # fill na with Electricity Maps
    df['datasource_name'] = df['datasource_name'].fillna('Electricity Maps') 
    
    # Get unique datasource names from the data
    unique_datasources = df['datasource_name'].dropna().unique()
    
    # =================================================================
    # DataSource
    # =================================================================
    datasource_data_list = []
    
    for datasource_name in unique_datasources:
        datasource_data = {
            "datasource_name": datasource_name,
            "dataset_name": "Carbon intensity",
            "URL": "https://portal.electricitymaps.com/datasets/",
            "publisher_id": publisher_data.get("publisher_id"),
        }
        datasource_data["datasource_id"] = uuid_generate_v3(
            name=datasource_name  # Use datasource_name instead of dataset_name for unique IDs
        )
        datasource_data_list.append(datasource_data)

    write_dic_to_csv(output_dir, "DataSource", datasource_data_list)

    # =================================================================
    # Methodology
    # =================================================================
    # Extract unique methodology names from gpc_mapping
    unique_methodologies = list(set(gpc_mapping.values()))
    
    methodology_data_list = []

    # Create methodology records for each datasource
    for datasource in datasource_data_list:
        for methodology_name in unique_methodologies:
            methodology_data = {
                "methodology_id": uuid_generate_v3(methodology_name),
                "methodology": methodology_name,
                "methodology_url": "",
                "datasource_id": datasource["datasource_id"]
            }
            methodology_data_list.append(methodology_data)

    # Write data to CSV
    write_dic_to_csv(output_dir, "Methodology", methodology_data_list)

    # =================================================================
    # EmissionsFactors
    # =================================================================

    # standarization of zone ids
    df['actor_id'].replace({
        'CL-SEN':'CL', 
        'ES-CE': 'ES', 
        'FR-COR': 'FR', 
        'US-SW-PNM': 'US'}, 
        inplace=True)

    # Extract the year from the 'start_time' column
    df['Datetime (UTC)'] = pd.to_datetime(df['Datetime (UTC)'])
    df['year'] = df['Datetime (UTC)'].dt.year

    # units conversion from gCO₂eq/kWh to kgCO₂eq/kWh
    df['emissions_per_activity'] *= 1e-3

    # filter needed columns
    df = df[[
        'region', 
        'actor_id', 
        'emissions_per_activity', 
        'reference', 
        'year', 
        'datasource_name']]

    # assign gpc_reference_number and methodology_name
    df = pd.concat([
        df.assign(gpc_reference_number=gpc, methodology_name=methodology)
        for gpc, methodology in gpc_mapping.items()
    ], ignore_index=True)

    # adding gas and units columns
    df['units'] = 'kg/kWh'
    df['metadata'] = '{}'


    # applying portions of contribution of each gas and calculating emission values
    new_rows = []
    for index, row in df.iterrows():
        total_co2e = row["emissions_per_activity"]

        for gas in GWP_dic_100years.keys():
            new_row = row.copy()
            new_row["gas"] = gas
            new_row["emissions_per_activity"] = (
                GWP_dic_100years[gas]["portion"] * total_co2e
            ) / GWP_dic_100years[gas]["value"]
            new_rows.append(new_row)

    df = pd.DataFrame(new_rows)

    # Create datasource_id mapping before dropping datasource_name
    datasource_id_mapping = {ds['datasource_name']: ds['datasource_id'] for ds in datasource_data_list}
    df['datasource_id'] = df['datasource_name'].map(datasource_id_mapping)

    df_final = df.drop(
        columns=[ "datasource_name"]
    )

    df_final['methodology_id'] = df_final['methodology_name'].apply(uuid_generate_v3)

    df_final["id"] = df_final.apply(
        lambda row: uuid_generate_v4(), axis=1
    )

    df_final.to_csv(
        f"{output_dir}/EmissionsFactor.csv", index=False
        #f"{output_dir}/EmissionsFactor_Stationary_Energy_Scope2.csv", index=False
    )

    # =================================================================
    # DataSourceEmissionsFactor
    # =================================================================
    datasource_emissions_factor_data = [
        {
            "datasource_id": row["datasource_id"],
            "emissions_factor_id": row["id"],
        }
        for _, row in df_final.iterrows()
    ]

    write_dic_to_csv(
        output_dir, "DataSourceEmissionsFactor", datasource_emissions_factor_data
    )