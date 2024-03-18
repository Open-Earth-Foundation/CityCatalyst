import pandas as pd
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
    raw_data = f'{absolute_path}/raw_enargas_gas_consumption_AR.csv'
    df = pd.read_csv(raw_data, sep=';')

    #--------------------------------------------------------------------------
    # Pre Process
    #--------------------------------------------------------------------------
    df = df.drop(['Unnamed: 0'], axis=1)

    # change spanish column names to english 
    column_names = [
        'region_name',
        'user_type',
        'year',
        'activity_value'
    ]
    df.columns = column_names

    # delete the subsectors that don't apply for this transformation
    subsectors_uncovered = ['CENTRALES ELECTRICAS', 'SDB']
    df = df[~df['user_type'].isin(subsectors_uncovered)]

    # assign activity name and GPC_refno based on the user type
    subsector_dic = {
        'COMERCIALES': {
            'description': 'natural gas consumption by commercial buildings',
            'GPC_refno': 'I.2.1'
        },
        'RESIDENCIALES': {
            'description': 'natural gas consumption by residential buildings',
            'GPC_refno': 'I.1.1'
        },
        'ENTES OFICIALES': {
            'description': 'natural gas consumption by official entities',
            'GPC_refno': 'I.2.1' 
        },
        'INDUSTRIALES': {
            'description': 'natural gas consumption by industrial buildings',
            'GPC_refno': 'I.3.1'
        },
        'GNC': {
            'description': 'GNC consumption by on road transportation',
            'GPC_refno': 'II.1.1'
        }
    }
    for index, row in df.iterrows():
        user_type = row['user_type']

        if user_type in subsector_dic.keys():
            df.at[index, 'activity_name'] = subsector_dic[user_type]['description']
            df.at[index, 'GPC_refno'] = subsector_dic[user_type]['GPC_refno']
        
    df = df.drop(columns='user_type', axis=1)

    #--------------------------------------------------------------------------
    # Emissions Calculation
    #--------------------------------------------------------------------------
    df['activity_value'] = df['activity_value'].str.replace(',', '.')
    df['activity_value'] = pd.to_numeric(df['activity_value'], errors='coerce')

    # from thousands of m3 to m3 
    df['activity_value'] = df['activity_value']*1000 

    # from m3 of gas to TJ
    # gas: 9300 kcal/m3
    # 1 kcal = 4.1858e-9 TJ
    factor = 9300*4.1858*1e-9
    df['activity_value'] = df['activity_value']*factor

    # Emision Factors source: 2006 IPCC Guidelines for National Greenhouse Gas Inventories
    ef_df = pd.DataFrame()
    ef_df['gas_name'] = ['CO2', 'CH4', 'N2O', 'CO2', 'CH4', 'N2O']
    ef_df['emission_factor_value'] = [56100, 5, 0.1, 1466.7, 50, 0.1]
    ef_df['emission_factor_units'] = 'kg/TJ'
    ef_df['sector'] = ['I','I','I', 'II','II','II']

    result_df = pd.DataFrame()

    for gas in ef_df['gas_name'].unique():
        for sector in ['I', 'II']:
            ef = ef_df[ef_df['sector'] == sector]
            gas_value = ef[(ef['gas_name'] == gas)]['emission_factor_value'].iloc[0]

            temp_df = df.copy()
            if sector == 'I':
                temp_df = temp_df[temp_df['GPC_refno'] != 'II.1.1']
            else:
                temp_df = temp_df[temp_df['GPC_refno'] == 'II.1.1']

            temp_df['gas_name'] = gas
            temp_df['emission_factor_value'] = gas_value
            temp_df['emission_factor_units'] = ef[ef['gas_name'] == gas]['emission_factor_units'].iloc[0]

            # Concatenate the temporary DataFrame to the result_df
            result_df = pd.concat([result_df, temp_df], ignore_index=True)

    result_df['emissions_value'] = result_df['activity_value']*result_df['emission_factor_value']
    result_df['emissions_untis'] = 'kg'

    #--------------------------------------------------------------------------
    # Final details
    #--------------------------------------------------------------------------
    # assigning region CODE based on the region name
    locode_dic = {
        'BUENOS AIRES':'AR-B', 
        'CAPITAL FEDERAL':'AR-C', 
        'CATAMARCA':'AR-K', 
        'CHUBUT':'AR-U',
        'CORDOBA':'AR-X', 
        'CORRIENTES':'AR-W', 
        'ENTRE RIOS':'AR-E', 
        'JUJUY':'AR-Y', 
        'LA PAMPA':'AR-L',
        'LA RIOJA':'AR-F', 
        'MENDOZA':'AR-M', 
        'NEUQUEN':'AR-Q', 
        'RIO NEGRO':'AR-R', 
        'SALTA':'AR-A', 
        'SAN JUAN':'AR-J',
        'SAN LUIS':'AR-D', 
        'SANTA CRUZ':'AR-Z', 
        'SANTA FE':'AR-S', 
        'SANTIAGO DEL ESTERO':'AR-G',
        'TIERRA DEL FUEGO':'AR-V', 
        'TUCUMAN':'AR-T'
    }
    for index, row in result_df.iterrows():
        region_name = row['region_name']

        if region_name in locode_dic.keys():
            result_df.at[index, 'region_code'] = locode_dic[region_name]

    # adding new columns
    result_df['activity_units'] = 'TJ'
    result_df['temporal_granularity'] = 'annual'
    result_df['source_name'] = 'ENARGAS'

    # assigning a unique ID to each row
    for index, row in result_df.iterrows():
        region_code = str(row['region_code'])
        emissions_value = str(row['emissions_value'])
        year = str(row['year'])
        gas = str(row['gas_name'])
        GPC_refno = str(row['GPC_refno'])

        id_string = region_code + emissions_value + year + gas + GPC_refno
        result_df.at[index, 'id'] = uuid_generate_v3(id_string)
    
    result_df = result_df[sorted(result_df.columns)]

    result_df.to_csv(f'{absolute_path}/processed_enargas_gas_consumption_AR.csv', sep=",", decimal=".", index=False)