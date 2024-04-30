import pandas as pd
import argparse
import glob
import uuid
import os
from sqlalchemy import create_engine

def uuid_generate_v3(name, namespace=uuid.NAMESPACE_OID):
    """generate a version 3 UUID from namespace and name"""
    assert isinstance(name, str), "name needs to be a string"
    assert isinstance(namespace, uuid.UUID), "namespace needs to be a uuid.UUID"
    return str(uuid.uuid3(namespace, name))

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Transform files with a specified location.')
    parser.add_argument("--filepath", help="path to the files location", required=True)
    parser.add_argument(
        "--database_uri",
        help="database URI (e.g. postgresql://ccglobal:@localhost/ccglobal)",
        default=os.environ.get("DB_URI"),
    )
    args = parser.parse_args()

    absolute_path = os.path.abspath(args.filepath)
    paths = glob.glob(f'{absolute_path}/*raw_energy_balances_AR.xlsx')

    #------------------------------------------------------------------------
    ### Emission Factors
    #------------------------------------------------------------------------
    
    # read Emission Factor file for AR
    ef_df = pd.read_excel('./energy_EF_Argentina.xlsx')

    # mapping from ipcc to gpm
    ipcc_to_gpc = {
        '1.A.2 - Manufacturing Industries and Construction': 'I.3.1',
        '1.A.4.a - Commercial/Institutional': 'I.2.1',
        '1.A.4.b - Residential\n1.A.4.c.i - Stationary': 'I.1.1',
    }

    # filter only for stationary energy
    ef_df = ef_df[(ef_df['Type of parameter'] == '2006 IPCC default')&(ef_df['Description'].str.contains('Emission Factor for Stationary Combustion'))]

    # define the list of fuel types to filter
    fuel_types = ['Wood/Wood Waste', 'Charcoal', 'Liquefied Petroleum Gases', 'Jet Kerosene']

    # filter the df based on the 'Fuel 2006' column
    ef_df = ef_df[ef_df['Fuel 2006'].isin(fuel_types)]

    # assign gpc_refno
    for index, row in ef_df.iterrows():
        category = row['IPCC 2006 Source/Sink Category']

        if category in ipcc_to_gpc.keys():
            ef_df.loc[index, 'GPC_refno'] = ipcc_to_gpc[category]

    # delete rows
    ef_df = ef_df[ef_df['IPCC 2006 Source/Sink Category'] != '1.A.1 - Energy Industries']
    # reset index
    ef_df.reset_index(drop=True, inplace=True)

    # assign gas_name
    gas_mapping = {
        'CARBON DIOXIDE':'CO2',
        'METHANE':'CH4',
        'NITROUS OXIDE': 'N2O'
    }
    for index, row in ef_df.iterrows():
        gas = row['Gas']
        if gas in gas_mapping.keys():
            ef_df.loc[index, 'gas_name'] = gas_mapping[gas]

    # delete unnecesary columns
    ef_df = ef_df.drop(
        columns=['EF ID', 'IPCC 1996 Source/Sink Category', 'IPCC 2006 Source/Sink Category', 'Fuel 1996', 'Technologies / Practices', 'Parameters / Conditions', 'Abatement / Control Technologies', 
                'Other properties', 'Equation', 'IPCC Worksheet', 'Technical Reference', 'Type of parameter', 'Region / Regional Conditions', 
                'Source of data', 'Data provider', 'Gas', 'Description']
    )

    # rename columns
    ef_df = ef_df.rename(columns={'Value': 'emission_factor_value', 'Unit': 'emission_factor_units'})

    # assign extra values for agriculture activities
    df_copy = ef_df[ef_df['GPC_refno'] == 'I.1.1'].copy()
    df_copy['GPC_refno'] = 'I.5.1'
    ef_df = pd.concat([ef_df, df_copy], ignore_index=True)
    ef_df = ef_df.rename(columns={'Fuel 2006': 'fuel_type'})

    #------------------------------------------------------------------------
    ### Emission Calculation
    #------------------------------------------------------------------------
    result_df = pd.DataFrame()

    for path in paths:
        try:
            # read file
            df = pd.read_excel(path)

            df = df.drop(
                columns=[
                    'Unnamed: 0', 'Unnamed: 1', 'Unnamed: 2', 'Unnamed: 4','Unnamed: 5', 'Unnamed: 6', 'Unnamed: 7', 'Unnamed: 8', 'Unnamed: 9',
                    'Unnamed: 10', 'Unnamed: 11', 'Unnamed: 12', 'Unnamed: 13', 'Unnamed: 14', 'Unnamed: 15', 'Unnamed: 16', 'Unnamed: 17',
                    'Unnamed: 18', 'Unnamed: 19', 'Unnamed: 20', 'Unnamed: 21', 'Unnamed: 22', 'Unnamed: 25'
                ]
            )
            
            # reestructure
            df = df[17:49]
            df = df.drop([29,30])

            # assigning new column names
            column_names = [
                'fuel_type',
                'residential',
                'commercial',
                'agriculture',
                'industrial'
            ]
            df.columns = column_names

            # new structure
            df = pd.melt(df, id_vars='fuel_type', var_name='user_type', value_name='activity_value')

            # delete rows with '0' in the 'activity_value' column
            df = df[df['activity_value'] != 0]
            # reset index
            df.reset_index(drop=True, inplace=True)

            # assign fuel type based on the energy source
            fuel_mapping = {
                'Leña ':'Wood/Wood Waste',
                'Carbón de Leña ':'Charcoal',
                'Gas Licuado ':'Liquefied Petroleum Gases',
                'Kerosene y Aerokerosene ':'Jet Kerosene'
            }
            df.loc[:, 'fuel_type'] = df['fuel_type'].replace(fuel_mapping)

            # applying a filter to select only the interested fuels
            df = df[df['fuel_type'].isin(['Wood/Wood Waste', 'Charcoal', 'Liquefied Petroleum Gases', 'Jet Kerosene'])]
            df.reset_index(drop=True, inplace=True)

            # assign activity name and GPC_refno based on the user type
            subsector_dic = {
                'residential': {
                    'description': 'residential buildings',
                    'GPC_refno': 'I.1.1'
                },
                'commercial': {
                    'description': 'commercial buildings',
                    'GPC_refno': 'I.2.1'
                },
                'agriculture': {
                    'description': 'agricultural activities',
                    'GPC_refno': 'I.5.1'
                },
                'industrial': {
                    'description': 'industrial buildings',
                        'GPC_refno': 'I.3.1'
                }
            }
            for index, row in df.iterrows():
                user_type = row['user_type']
                fuel_type = row['fuel_type']
                
                description = subsector_dic[user_type]['description']
                gpc_refno = subsector_dic[user_type]['GPC_refno']
                
                df.loc[index, 'activity_name'] = f'fuel consumption of {fuel_type} by {description}'
                df.loc[index, 'GPC_refno'] = gpc_refno
            
            # units conversion
            # from IEA: 1 tep = 41.868 GJ = 39.68 MBtu = 11.63 MWh
            # raw data: miles de TEP 
            TEP_to_kJ = 41.868 * 1e6
            df.loc[:, 'activity_value'] *= 1000
            df.loc[:, 'activity_value'] *= TEP_to_kJ

            # merge with EF dataframe
            df = pd.merge(df, ef_df, on=['GPC_refno', 'fuel_type'])

            # replace a null value
            df['emission_factor_value'] = df['emission_factor_value'].replace({'N': 0})
            # convert to numeric
            df['emission_factor_value'] = pd.to_numeric(df['emission_factor_value'])

            # calcute emission values
            df['emissions_value'] = df['activity_value'] * df['emission_factor_value']
            df['emissions_value'] = df['emissions_value'].astype(int)
            df['activity_value'] = df['activity_value'].astype(int)

            # adding missing columns and values
            df.loc[:, 'emissions_units'] = 'kg'
            df.loc[:, 'activity_units'] = 'kJ'
            df.loc[:, 'source_name'] = 'BEN'
            df.loc[:, 'country_name'] = 'Argentina'
            df.loc[:, 'country_code'] = 'AR'
            df.loc[:, 'temporal_granularity'] = 'annual'
            df.loc[:, 'year'] = path[len(absolute_path)+1:-28]

            result_df = pd.concat([result_df, df], ignore_index=True)
            result_df = result_df.drop(columns=['fuel_type', 'user_type'])
            
        except Exception as e:
            print(f"Error processing {path}: {e}")

    # assigning a unique ID to each row
    for index, row in result_df.iterrows():
        country_code = str(row['country_code'])
        emissions_value = str(row['emissions_value'])
        year = str(row['year'])
        gas = str(row['gas_name'])
        GPC_refno = str(row['GPC_refno'])

        id_string = country_code + emissions_value + year + gas + GPC_refno
        result_df.at[index, 'id'] = uuid_generate_v3(id_string)

        col_order = ['id', 'source_name', 'GPC_refno', 'country_name', 'country_code', 'temporal_granularity', 'year', 'activity_name', 'activity_value', 
                     'activity_units', 'gas_name', 'emission_factor_value', 'emission_factor_units', 'emissions_value', 'emissions_units']
        result_df = result_df.reindex(columns=col_order)

    #result_df.to_csv(f'{absolute_path}/processed_BEN_AR.csv', sep=",", decimal=".", index=False)

    # Create a SQLAlchemy engine
    engine = create_engine(args.database_uri)

    # Write the DataFrame to the database table
    result_df.to_sql('ben_country_emissions_staging', engine, if_exists='replace', index=False)