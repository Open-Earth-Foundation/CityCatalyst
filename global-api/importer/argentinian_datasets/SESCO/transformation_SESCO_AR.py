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
    parser = argparse.ArgumentParser(description='Transform files with a specified location.')
    parser.add_argument("--filepath", help="path to the files location", required=True)
    args = parser.parse_args()

    absolute_path = os.path.abspath(args.filepath)
    # read the file
    df = pd.read_csv(f'{absolute_path}/raw_fuel_sales_SESCO_AR.csv')

    #------------------------------------------------------------------------
    ### Pre-process
    #------------------------------------------------------------------------
    
    # clean the dataset
    df = df.drop(columns=['pais', 'indice_tiempo', 'tipodecomercializacion'])

    # change column names (Spanish to English)
    df.columns = ['year', 'company', 'marketing_subtype', 'fuel_type', 'region_name', 'activity_value']

    # list of "region_name" values to delete
    filter_values = ['S/D', 'no aplica', 'Provincia', 'Estado Nacional']
    df = df[~df['provincia'].isin(filter_values)]

    # delete empty amounts of fuel
    df = df[df['activity_value'] != 0]
    df = df.reset_index(drop=True)

    # calculate annual values
    df = df.groupby(['year', 'company', 'marketing_subtype', 'fuel_type', 'region_name'])['activity_value'].sum().reset_index()

    # calculation only for complete years
    df = df[df['year'] != 2024]

    #------------------------------------------------------------------------
    ### Emission Calculation for Biofuels
    #------------------------------------------------------------------------
    # biofuel percentage
    # values for 2021,2022,2023 are estimations
    percentage_df = pd.DataFrame()
    percentage_df['year'] = [2010,2011,2012,2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023]
    percentage_df['bioetanol'] = [0.02,0.02,0.03,0.06,0.08,0.09,0.11,0.12,0.11,0.12,0.11,0.12,0.12,0.12]
    percentage_df['biodiesel'] = [0.04,0.06,0.07,0.08,0.09,0.09,0.09,0.10,0.10,0.09,0.05,0.10,0.10,0.10]

    # list of naphthas to consider
    naphthas = ['Nafta Grado 1 (Común)(m3)', 'Nafta Grado 2 (Súper)(m3)', 'Nafta Grado 3 (Ultra)(m3)']  
    # Filter the DataFrame
    bioetanol_df = df[df['fuel_type'].isin(naphthas)]

    # assign to each year the corresponding percentage value of biofuel
    bioetanol_df = pd.merge(bioetanol_df, percentage_df.loc[:, ['year','bioetanol']], left_on='year', right_on='year')

    # calculate biofuel amount
    bioetanol_df.loc[:, 'bioetanol'] = bioetanol_df['activity_value']*bioetanol_df['bioetanol']

    # calculate portion of fossil fuel amount
    bioetanol_df.loc[:, 'naphtha'] = bioetanol_df['activity_value'] - bioetanol_df['bioetanol']

    # this column is unnecesary here
    bioetanol_df = bioetanol_df.drop(columns='activity_value')

    # df re-estructure
    bioetanol_df = pd.melt(bioetanol_df, id_vars=['year', 'company', 'marketing_subtype', 'region_name'],
                           value_vars=['bioetanol', 'naphtha'], 
                           var_name='fuel_type', 
                           value_name='activity_value')
    
    # Filter the DataFrame for diesel
    biodiesel_df = df[df['fuel_type'].isin(['Diesel Oil(m3)'])]

    # assign to each year the corresponding percentage value of biofuel
    biodiesel_df = pd.merge(biodiesel_df, percentage_df.loc[:, ['year','biodiesel']], left_on='year', right_on='year')

    # calculate biofuel amount
    biodiesel_df.loc[:, 'biodiesel'] = biodiesel_df['activity_value']*biodiesel_df['biodiesel']

    # calculate portion of fossil fuel amount
    biodiesel_df.loc[:, 'diesel'] = biodiesel_df['activity_value'] - biodiesel_df['biodiesel']

    biodiesel_df = biodiesel_df.drop(columns='activity_value')

    # df re-estructure
    biodiesel_df = pd.melt(biodiesel_df, id_vars=['year', 'company', 'marketing_subtype', 'region_name'], 
                           value_vars=['biodiesel', 'diesel'], 
                           var_name='fuel_type', 
                           value_name='activity_value')
    
    # join these two dfs
    result_df1 = pd.concat([biodiesel_df, bioetanol_df], ignore_index=True)

    # change m3 to energy
    fuel_dic1 = {
        'diesel': {
            'units': 'm3',
            'fuel_density': 840,
            'fuel_density_units': 'kg/m3',
            'NCV_value': 43,
            'NCV_units': 'TJ/Gg'
        }, 
        'naphtha': {
            'units': 'm3',
            'fuel_density': 770,
            'fuel_density_units': 'kg/m3',
            'NCV_value': 44.5,
            'NCV_units': 'TJ/Gg'
        },
        'biodiesel': {
            'units': 'm3',
            'fuel_density': 880,
            'fuel_density_units': 'kg/m3',
            'NCV_value': 27,
            'NCV_units': 'TJ/Gg'
        },
        'bioetanol': {
            'units': 'm3',
            'fuel_density': 789,
            'fuel_density_units': 'kg/m3',
            'NCV_value': 27,
            'NCV_units': 'TJ/Gg'
        }
    }
    # apply density to change m3 to kg and then, kg to TJ using the Net Calorific value
    result_df1.loc[:, 'factor'] = result_df1['fuel_type'].apply(lambda x: (fuel_dic1[x]['fuel_density'] * fuel_dic1[x]['NCV_value'] * 1e-6) 
                                                                if x in fuel_dic1 else None)
    result_df1.loc[:, 'activity_value'] *= result_df1['factor']

    # units after transformation
    result_df1.loc[:, 'activity_units'] = 'TJ'

    # delete the "factor" column
    result_df1 = result_df1.drop(columns='factor')

    # diccionary with the EF for these type of fuels
    # units = kg/TJ
    ef_bio = {
        'diesel' : {
            'CO2': 74100, 
            'CH4': 3, 
            'N2O': 0.6
        },
        'naphtha' : {
            'CO2': 73300, 
            'CH4': 3, 
            'N2O': 0.6
        },
        'biodiesel' : {
            'CH4': 10, 
            'N2O': 0.6
        },
        'bioetanol' : {
            'CH4': 10, 
            'N2O': 0.6
        }
    }
    # Function to map fuel types to emission factors
    def map_emission_factors(row):
        fuel_type = row['fuel_type']
        if fuel_type in ef_bio:
            return [(gas, value) for gas, value in ef_bio[fuel_type].items()]
        else:
            return []
        
    # Apply the function to each row and explode the result into new rows
    result_df1['emission_factors'] = result_df1.apply(map_emission_factors, axis=1)
    result_df1 = result_df1.explode('emission_factors')
    result_df1['gas_name'] = result_df1['emission_factors'].apply(lambda x: x[0] if x else None)
    result_df1['emission_factor_value'] = result_df1['emission_factors'].apply(lambda x: x[1] if x else None)
    result_df1 = result_df1.drop('emission_factors', axis=1)

    # add new columns based on the Global API schema
    result_df1['emission_factor_units'] = 'kg/TJ'
    result_df1.loc[:, 'emissions_value'] = result_df1['activity_value'] * result_df1['emission_factor_value']
    result_df1.loc[:, 'emissions_units'] = 'kg'
    
    #------------------------------------------------------------------------
    ### Emission Calculation for the rest of fuels
    #------------------------------------------------------------------------
    # diccionary with the data needed to convert the raw units (volume) into energy content by fuel type 
    fuel_dic = {
        'Aerokerosene (Jet)(m3)': {
            'units': 'm3',
            'ef_fuel_name': 'Jet Kerosene',
            'fuel_density': 710,
            'fuel_density_units': 'kg/m3',
            'NCV_value': 44.3,
            'NCV_units': 'TJ/Gg'
        }, 
        'Aeronaftas(m3)': {
            'units': 'm3',
            'ef_fuel_name': 'Aviation Gasoline',
            'fuel_density': 710,
            'fuel_density_units': 'kg/m3',
            'NCV_value': 44.3,
            'NCV_units': 'TJ/Gg'
        }, 
        'Fueloil(Ton)': {
            'units': 'tonne',
            'ef_fuel_name': 'Motor Gasoline',
            'fuel_density': 1000,
            'fuel_density_units': 'kg',
            'NCV_value': 44.3,
            'NCV_units': 'TJ/Gg'
        }, 
        'Gasoil Grado 1 (Agrogasoil)(m3)': {
            'units': 'm3',
            'ef_fuel_name': 'Gas Oil',
            'fuel_density': 840,
            'fuel_density_units': 'kg/m3',
            'NCV_value': 43,
            'NCV_units': 'TJ/Gg'
        }, 
        'Gasoil Grado 2 (Común)(m3)': {
            'units': 'm3',
            'ef_fuel_name': 'Gas Oil',
            'fuel_density': 840,
            'fuel_density_units': 'kg/m3',
            'NCV_value': 43,
            'NCV_units': 'TJ/Gg'
        },
        'Gasoil Grado 3 (Ultra) (m3)': {
            'units': 'm3',
            'ef_fuel_name': 'Gas Oil',
            'fuel_density': 840,
            'fuel_density_units': 'kg/m3',
            'NCV_value': 43,
            'NCV_units': 'TJ/Gg'
        },  
        'Gasolina Natural(m3)': {
            'units': 'm3',
            'ef_fuel_name': 'Gas Oil',
            'fuel_density': 840,
            'fuel_density_units': 'kg/m3',
            'NCV_value': 43,
            'NCV_units': 'TJ/Gg'
        }, 
        'Kerosene(m3)': {
            'units': 'm3',
            'ef_fuel_name': 'Jet Kerosene',
            'fuel_density': 710,
            'fuel_density_units': 'kg/m3',
            'NCV_value': 44.3,
            'NCV_units': 'TJ/Gg'
        }
    }
    # apply density to change m3 to kg and then, kg to TJ using the Net Calorific value
    df.loc[:, 'factor'] = df['fuel_type'].apply(lambda x: (fuel_dic[x]['fuel_density'] * fuel_dic[x]['NCV_value'] * 1e-6)
                                                if x in fuel_dic else None)
    df.loc[:, 'activity_value'] *= df['factor']

    # units after transformation
    df.loc[:, 'activity_units'] = 'TJ'

    df = df[df['activity_value'].notna()]

    # delete "factor" column
    df = df.drop(columns='factor')

    # change fuel names (Spanish to English)
    replacement_fuels = {'Gasolina Natural(m3)': 'gasoline', 'Gasoil Grado 2 (Común)(m3)': 'gas oil', 'Kerosene(m3)': 'jet kerosene', 
                         'Fueloil(Ton)': 'gasoline', 'Aerokerosene (Jet)(m3)': 'jet kerosene', 'Gasoil Grado 3 (Ultra) (m3)': 'gas oil', 
                         'Aeronaftas(m3)': 'Aviation Gasoline', 'Gasoil Grado 1 (Agrogasoil)(m3)': 'gas oil'}
    df['fuel_type'] = df['fuel_type'].replace(replacement_fuels, regex=False)

    # diccionary with the EF for these type of fuels
    # units = 'kg/TJ'
    dic_ef = {
        'jet kerosene' : {
            'CO2': 71500, 
            'CH4': 0.5, 
            'N2O': 2
        },
        'aviation gasoline' : {
            'CO2': 72000, 
            'CH4': 0.5, 
            'N2O': 2
        },
        'gasoline': {
            'CO2': 69300, 
            'CH4': 33, 
            'N2O': 3.2
        },
        'gas oil' : {
            'CO2': 74100, 
            'CH4': 3.9, 
            'N2O': 3.9
        }
    }

    # Function to map fuel types to emission factors
    def map_emission_factors(row):
        fuel_type = row['fuel_type']
        if fuel_type in dic_ef:
            return [(gas, value) for gas, value in dic_ef[fuel_type].items()]
        else:
            return []
    
    # Apply the function to each row and explode the result into new rows
    df['emission_factors'] = df.apply(map_emission_factors, axis=1)
    df = df.explode('emission_factors')
    df['gas_name'] = df['emission_factors'].apply(lambda x: x[0] if isinstance(x, tuple) else None)
    df['emission_factor_value'] = df['emission_factors'].apply(lambda x: x[1] if isinstance(x, tuple) else None)

    # delete "emission_factors" column
    df = df.drop('emission_factors', axis=1)

    # add new columns based on the Global API schema
    df['emission_factor_units'] = 'kg/TJ'
    df.loc[:, 'emissions_value'] = df['activity_value'] * df['emission_factor_value']
    df.loc[:, 'emissions_units'] = 'kg'

    #------------------------------------------------------------------------
    ### Final Details
    #------------------------------------------------------------------------
    # join the final dataframes df and result_df1
    final_df = pd.concat([df, result_df1], ignore_index=True)

    # assign GPC_refno based on the marketing subtype
    suptipo_to_gpc = {
        'Al Público': 'II.1.1',
        'Industrias Petroquímicas':'I.3.1',
        'transporte Público de Pasajeros':'II.1.1',
        'Transporte de Carga':'II.1.1', 
        'Agro':'II.5.1',
        'Transporte Ferroviario':'II.2.1',
        }
    final_df.loc[:, 'GPC_refno'] = final_df['marketing_subtype'].map(suptipo_to_gpc)

    # change marketing subtype names (Spanish to English)
    replacement_subtype = {
        'Al Público': 'to the public',
        'Industrias Petroquímicas':'petrochemical industries',
        'transporte Público de Pasajeros':'public passenger transport',
        'Transporte de Carga':'freight transport', 
        'Agro':'agriculture machines',
        'Transporte Ferroviario':'railway transport',
    }
    final_df.loc[:, 'marketing_subtype'] = final_df['marketing_subtype'].replace(replacement_subtype, regex=False)

    # add activity_name using marketing subtype and type of fuel
    final_df['activity_name'] = final_df.apply(lambda row: f"{row['fuel_type']} combustion consumption by {row['marketing_subtype']}", axis=1)

    # delete columns
    columns_to_drop = ['company', 'marketing_subtype', 'fuel_type']
    final_df = final_df.drop(columns=columns_to_drop)

    # assigning province CODE based on the province name
    province_code_dic = {
        'Buenos Aires':'AR-B', 
        'Capital Federal':'AR-C', 
        'Catamarca':'AR-K', 
        'Chubut':'AR-U',
        'Córdoba':'AR-X', 
        'Corrientes':'AR-W', 
        'Entre Rios':'AR-E', 
        'Jujuy':'AR-Y', 
        'La Pampa':'AR-L',
        'La Rioja':'AR-F', 
        'Mendoza':'AR-M', 
        'Neuquén':'AR-Q', 
        'Rio Negro':'AR-R', 
        'Salta':'AR-A', 
        'San Juan':'AR-J',
        'San Luis':'AR-D', 
        'Santa Cruz':'AR-Z', 
        'Santa Fe':'AR-S', 
        'Santiago del Estero':'AR-G',
        'Tierra del Fuego':'AR-V', 
        'Tucuman':'AR-T',
        'Chaco':'AR-H',
        'Misiones':'AR-N',
        'Formosa':'AR-P'
    }
    final_df.loc[:, 'region_code'] = final_df['region_name'].map(province_code_dic)

    # add new columns based on the Global API schema
    final_df.loc[:, 'source_name'] = 'SESCO'
    final_df.loc[:, 'temporal_granularity'] = 'annual'

    # define a function to generate UUID for each row
    def generate_uuid(row):
        id_string = str(row['region_code']) + str(row['emissions_value']) + str(row['GPC_refno'])
        return uuid_generate_v3(id_string)
    
    # apply the function to each row and assign the result to a new column 'id'
    final_df['id'] = final_df.apply(generate_uuid, axis=1)
    
    col_order = ['id', 'source_name', 'GPC_refno', 'region_name', 'region_code', 'temporal_granularity', 'year', 'activity_name', 'activity_value', 
                 'activity_units', 'gas_name', 'emission_factor_value', 'emission_factor_units', 'emissions_value', 'emissions_units']
    final_df = final_df.reindex(columns=col_order)
    
    # save the file
    final_df.to_csv(f'{absolute_path}/processed_SESCO_AR.csv', sep=",", decimal=".", index=False)