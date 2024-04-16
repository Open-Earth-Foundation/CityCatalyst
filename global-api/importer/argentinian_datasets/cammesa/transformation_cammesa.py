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
    raw_data = f'{absolute_path}/raw_cammesa_monthly_electricity_generation.xlsx'
    df = pd.read_excel(raw_data)

    #--------------------------------------------------------------------------
    # Pre-Process
    #--------------------------------------------------------------------------
    
    # assign column names
    df.columns = df.loc[57]

    # cleaning the df
    df= df[58:]
    df = df.reset_index(drop=True)

    # select specific columns
    df = df[['AÑO','PROVINCIA','FUENTE GENERACION','COMBUSTIBLE','CONSUMO', 'Factor CO2 por Combustible','EMISIÓN [Ton CO2]']]

    # Calculate annual values
    df = df.groupby(['AÑO', 'PROVINCIA', 'FUENTE GENERACION', 'COMBUSTIBLE', 'Factor CO2 por Combustible'])[['CONSUMO', 'EMISIÓN [Ton CO2]']].sum().reset_index()

    # rename columns
    df = df.rename(columns={
        'AÑO': 'year',
        'PROVINCIA': 'region_name',
        'FUENTE GENERACION': 'source_generation',
        'COMBUSTIBLE': 'fuel',
        'Factor CO2 por Combustible': 'emission_factor_value',
        'CONSUMO': 'activity_value',
        'EMISIÓN [Ton CO2]': 'emissions_value'
    })

    # translation of generation sources
    generation_source_dict = {
        'Renovable': 'renewable',
        'Térmica': 'thermal'
    }
    df['source_generation'] = df['source_generation'].replace(generation_source_dict)

    # translation of fuel types
    fuel_dict = {
        'GAS NATURAL': 'natural gas',
        'CARBÓN MINERAL': 'mineral coal',
        'FUEL OIL': 'fuel oil',
        'GAS OIL': 'gas oil'
    }
    df['fuel'] = df['fuel'].replace(fuel_dict)

    # create a activity name column
    df['activity_name'] = df['fuel'] + ' combustion consumption for energy generation from ' + df['source_generation'] + ' plants'

    # convert tonnes to kg
    df['emissions_value'] *= 1000 

    # change province name
    df['region_name'] = df['region_name'].replace('SGO.DEL ESTERO', 'SANTIAGO DEL ESTERO')

    # assigning province CODE based on the province name
    region_code_dic = {
        'BUENOS AIRES':'AR-B', 
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
        'TUCUMAN':'AR-T',
        'MISIONES': 'AR-N',
        'FORMOSA': 'AR-P',
        'CHACO': 'AR-H'
    }
    df['region_code'] = df['region_name'].map(region_code_dic)

    df = df.drop(columns=['source_generation', 'fuel'])

    df.loc[:, 'emission_factor_units'] = 'tonne/tonne'
    df.loc[:, 'activity_units'] = 'tonne'
    df.loc[:, 'emissions_units'] = 'kg'
    df.loc[:, 'source_name'] = 'CAMMESA'
    df.loc[:, 'temporal_granularity'] = 'annual'
    df.loc[:, 'gas_name'] = 'CO2'
    df.loc[:, 'GPC_refno'] = 'I.4.4'


    # Define a function to generate UUID for each row
    def generate_uuid(row):
        id_string = str(row['region_code']) + str(row['emissions_value']) + str(row['year']) + str(row['gas_name']) + str(row['GPC_refno'])
        return uuid_generate_v3(id_string)
    
    # Apply the function to each row and assign the result to a new column 'id'
    df['id'] = df.apply(generate_uuid, axis=1)

    col_order = ['id', 'source_name', 'GPC_refno', 'region_name', 'region_code', 'temporal_granularity', 'year', 'activity_name', 'activity_value', 
                 'activity_units', 'gas_name', 'emission_factor_value', 'emission_factor_units', 'emissions_value', 'emissions_units']
    df = df.reindex(columns=col_order)
    
    df.to_csv(f'{absolute_path}/processed_cammesa_AR.csv', sep=",", decimal=".", index=False)