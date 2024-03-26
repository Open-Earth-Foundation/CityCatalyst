import pandas as pd
import numpy as np
import argparse
import uuid
import os

def uuid_generate_v3(name, namespace=uuid.NAMESPACE_OID):
    """generate a version 3 UUID from namespace and name"""
    assert isinstance(name, str), "name needs to be a string"
    assert isinstance(namespace, uuid.UUID), "namespace needs to be a uuid.UUID"
    return str(uuid.uuid3(namespace, name))

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--filepath", help="path to the files location", required=True)
    args = parser.parse_args()
    absolute_path = os.path.abspath(args.filepath)
    
    # read the raw data
    raw_data = f'{absolute_path}/raw_mendoza_transportation_EIE.csv'
    df = pd.read_csv(raw_data, sep=',')

    # delete row with 0 emissions value and totals
    df = df[(df['full_co2e_tons']!=0)&(df['travel_bounds']!='TOTAL')]

    # creating a activity name column based on column information
    for index, row in df.iterrows():
        mode = row['mode']
        travel_bounds = row['travel_bounds']
        df.loc[index, 'activity_name'] = f'emissions from VKT by {mode} transportation mode in {travel_bounds} trips'

    # delete unnecessary columns
    df = df.drop(columns=['full_distance_km', 'full_co2e_tons', 'trips', 'mode', 'travel_bounds'])

    # rename columns based on our data schema
    df.rename(columns={'gpc_co2e_tons': 'emissions_value', 'gpc_distance_km': 'activity_value'}, inplace=True)

    # adding missing columns and values
    df.loc[:, 'activity_units'] = 'km'
    df.loc[:, 'emissions_value'] *= 1000
    df.loc[:, 'emissions_units'] = 'kg'
    df.loc[:, 'GPC_refno'] = 'I.1.1'
    df.loc[:, 'gas_name'] = 'CO2'
    df.loc[:, 'source_name'] = 'Google EIE'
    df.loc[:, 'city_name'] = 'Mendoza'
    df.loc[:, 'locode'] = 'AR MDZ'
    df.loc[:, 'temporal_granularity'] = 'annual'
    df.loc[:, 'emission_factor_value'] = np.nan
    df.loc[:, 'emission_factor_units'] = np.nan

    # convertion to integers
    df['activity_value'] = df['activity_value'].astype(int)
    df['emissions_value'] = df['emissions_value'].astype(int)

    # assigning a unique ID to each row
    for index, row in df.iterrows():
        locode = str(row['locode'])
        emissions_value = str(row['emissions_value'])
        year = str(row['year'])
        gas = str(row['gas_name'])
        GPC_refno = str(row['GPC_refno'])

        id_string = locode + emissions_value + year + gas + GPC_refno
        df.at[index, 'id'] = uuid_generate_v3(id_string)

    col_order = ['id', 'source_name', 'GPC_refno', 'city_name', 'locode', 'temporal_granularity', 'year', 'activity_name', 'activity_value', 
             'activity_units', 'gas_name', 'emission_factor_value', 'emission_factor_units', 'emissions_value', 'emissions_units']
    df = df.reindex(columns=col_order)

    df.to_csv(f'{absolute_path}/processed_mendoza_transportation_EIE.csv', sep=",", decimal=".", index=False)