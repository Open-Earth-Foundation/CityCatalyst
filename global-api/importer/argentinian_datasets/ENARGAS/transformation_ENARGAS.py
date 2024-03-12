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
    parser.add_argument("--path", help="path to save the processed data", required=True)
    args = parser.parse_args()
    absolute_path = os.path.abspath(args.path)
    
    # read the raw data
    raw_data = './raw_enargas_gas_consumption_AR.csv'
    df = pd.read_csv(raw_data, sep=';')

    #--------------------------------------------------------------------------
    # Pre Process
    #--------------------------------------------------------------------------
    df = df.drop(['Unnamed: 0'], axis=1)

    # change spanish column names to english 
    column_names = [
        'province',
        'user_type',
        'year',
        'activity_value'
    ]
    df.columns = column_names

    # assign activity name based on the user type
    subsector_dic = {
        'CENTRALES ELECTRICAS':'gas consumption by power plants',
        'COMERCIALES': 'gas consumption by commercial buildings',
        'RESIDENCIALES': 'gas consumption by residential buildings',
        'ENTES OFICIALES': 'gas consumption by oficial entities',
        'INDUSTRIALES': 'gas consumption by industrial buildings',
        'GNC': 'gas consumption by GNC',
        'SDB': 'gas consumption by SDB',
    }
    df['activity_name'] = df['user_type'].apply(lambda x: subsector_dic.get(x, x))
    df = df.drop(columns='user_type', axis=1)

    # assigning gpc reference number based on the activity name
    gpc_refno_dic = {
        'gas consumption by residential buildings': 'I.1.1',
        'gas consumption by commercial buildings': 'I.2.1',
        'gas consumption by oficial entities': 'I.2.1',
        'gas consumption by industrial buildings': 'I.3.1'
        }
    for index, row in df.iterrows():
        activity_name = row['activity_name']

        if activity_name in gpc_refno_dic.keys():
            df.at[index, 'GPC_refno'] = gpc_refno_dic[activity_name]

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
    ef_df['gas_name'] = ['CO2', 'CH4', 'N2O']
    ef_df['emission_factor_value'] = [56100, 5, 0.1]
    ef_df['emission_factor_units'] = 'kg/TJ'

    # applying each EF for each gas
    for gas in ef_df['gas_name']:
        gas_filt = ef_df[ef_df['gas_name'] == gas]
        gas_value = gas_filt['emission_factor_value'].iloc[0]
        gas_units = gas_filt['emission_factor_units'].iloc[0]
        
        # multiply the 'activity_value' column by the gas_value
        df['emissions_value'] = df['activity_value'] * gas_value
        df['emissions_units'] = 'kg'
        
        # set additional columns for this gas
        df['gas_name'] = gas
        df['emission_factor_value'] = gas_value
        df['emission_factor_units'] = gas_units

    #--------------------------------------------------------------------------
    # Final details
    #--------------------------------------------------------------------------
    # assigning province CODE based on the province name
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
    for index, row in df.iterrows():
        province_name = row['province']

        if province_name in locode_dic.keys():
            df.at[index, 'province_code'] = locode_dic[province_name]

    # adding new columns
    df['activity_units'] = 'TJ'
    df['temporal_granularity'] = 'annual'
    df['source_name'] = 'ENARGAS'

    # assigning a unique ID to each row
    for index, row in df.iterrows():
        province_code = str(row['province_code'])
        emissions_value = str(row['emissions_value'])
        year = str(row['year'])
        gas = str(row['gas_name'])
        GPC_refno = str(row['GPC_refno'])

        id_string = province_code + emissions_value + year + gas + GPC_refno
        df.at[index, 'id'] = uuid_generate_v3(id_string)
    
    df = df[sorted(df.columns)]

    df.to_csv(f'{absolute_path}/processed_enargas_gas_consumption_AR.csv', sep=";", decimal=".", index=False)