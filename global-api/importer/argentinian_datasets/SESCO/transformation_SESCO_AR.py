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

    # list of "province" values to delete
    filter_values = ['S/D', 'no aplica', 'Provincia', 'Estado Nacional']
    df = df[~df['provincia'].isin(filter_values)]
    
    # matching the 'suptipo' from SESCO to the GPC subsectors
    suptipo_to_gpc = {
        'Industrias Petroquímicas':'I.3.1',
        'transporte Público de Pasajeros':'II.1.1',
        'Transporte de Carga':'II.1.1', 
        'Agro':'II.5.1',
        'Transporte Ferroviario':'II.2.1'
    }
    df['GPC_refno'] = df['subtipodecomercializacion'].map(suptipo_to_gpc)

    # delete rows without a GPC reference number
    df = df.dropna(subset=['GPC_refno'])

    # calculate annual values
    df = df.groupby(['anio', 'empresa', 'subtipodecomercializacion', 'producto', 'provincia', 'GPC_refno'])['cantidad'].sum().reset_index()

    #------------------------------------------------------------------------
    ### Emission Calculation
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
        'Diesel Oil(m3)': {
            'units': 'm3',
            'ef_fuel_name': 'Diesel Oil',
            'fuel_density': 840,
            'fuel_density_units': 'kg/m3',
            'NCV_value': 43,
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
        }, 
        'Nafta Grado 1 (Común)(m3)': {
            'units': 'm3',
            'ef_fuel_name': 'Naphtha',
            'fuel_density': 770,
            'fuel_density_units': 'kg/m3',
            'NCV_value': 44.5,
            'NCV_units': 'TJ/Gg'
        },  
        'Nafta Grado 2 (Súper)(m3)': {
            'units': 'm3',
            'ef_fuel_name': 'Naphtha',
            'fuel_density': 770,
            'fuel_density_units': 'kg/m3',
            'NCV_value': 44.5,
            'NCV_units': 'TJ/Gg'
        }, 
        'Nafta Grado 3 (Ultra)(m3)': {
            'units': 'm3',
            'ef_fuel_name': 'Naphtha',
            'fuel_density': 770,
            'fuel_density_units': 'kg/m3',
            'NCV_value': 44.5,
            'NCV_units': 'TJ/Gg'
        }, 
        'Nafta Virgen(m3)': {
            'units': 'm3',
            'ef_fuel_name': 'Naphtha',
            'fuel_density': 770,
            'fuel_density_units': 'kg/m3',
            'NCV_value': 44.5,
            'NCV_units': 'TJ/Gg'
        }
    }

    # apply a filter to select specific fuels
    df = df[df['producto'].isin(fuel_dic.keys())]

    # assigning needed values to each row based on the fuel type
    for index, row in df.iterrows():
        producto = row['producto']
        if producto in fuel_dic.keys():
            #print(fuel_dic[producto]['units'])
            df.loc[index, 'units'] = fuel_dic[producto]['units']
            df.loc[index, 'fuel_ipcc'] = fuel_dic[producto]['ef_fuel_name']
            df.loc[index, 'fuel_density'] = fuel_dic[producto]['fuel_density']
            df.loc[index, 'fuel_density_units'] = fuel_dic[producto]['fuel_density_units']
            df.loc[index, 'NCV_value'] = fuel_dic[producto]['NCV_value']
            df.loc[index, 'NCV_units'] = fuel_dic[producto]['NCV_units']

    # to calculate TJ for activity_values
    # volume to mass, mass to energy content
    df.loc[:, 'activity_value'] = df['cantidad'] * df['fuel_density'] * df['NCV_value'] * 1e-6    # changing Gg to kg
    df.loc[:, 'activity_units'] = 'TJ'

    #------------------------------------------------------------------------
    ### Subsector I.3.1
    #------------------------------------------------------------------------
    I31 = df[df['subtipodecomercializacion'] == 'Industrias Petroquímicas']

    # diccionary to assign the emission factor values to each row based on the sector and fuel type
    dic_ef_I31 = {
        'Jet Kerosene' : {
            'CO2': 71500, 
            'CH4': 3, 
            'N2O': 0.6
        },
        'Aviation Gasoline' : {
            'CO2': 70000, 
            'CH4': 3, 
            'N2O': 0.6
        },
        'Diesel Oil' : {
            'CO2': 74100, 
            'CH4': 3, 
            'N2O': 0.6
        },
        'Motor Gasoline': {
            'CO2': 69300, 
            'CH4': 3, 
            'N2O': 0.6
        },
        'Gas Oil' : {
            'CO2': 74100, 
            'CH4': 3, 
            'N2O': 0.6
        },
        'Naphtha' : {
            'CO2': 73300, 
            'CH4': 3, 
            'N2O': 0.6
        }
    }
    new_rows = []

    for index, row in I31.iterrows():
        fuel = row['fuel_ipcc']
        if fuel in dic_ef_I31.keys():
            ef_gas = dic_ef_I31[fuel]
            for gas, ef_value in ef_gas.items():
                        # Create a new row with gas name and emission factor value
                        new_row = row.copy()  # Copy the original row
                        new_row['gas_name'] = gas
                        new_row['emission_factor_value'] = ef_value
                        new_row['emission_factor_units'] = 'kg/TJ'
                        # Append the new row to the list
                        new_rows.append(new_row)

    # Create a new DataFrame from the list of new rows
    I31 = pd.DataFrame(new_rows)
    I31 = I31.reset_index(drop=True)

    # calculating the emission values for this subsector
    I31.loc[:, 'emissions_value'] = I31['activity_value'] * I31['emission_factor_value']

    #------------------------------------------------------------------------
    ### Sector II
    #------------------------------------------------------------------------
    II = df[df['subtipodecomercializacion'] != 'Industrias Petroquímicas']
    # diccionary to assign the emission factor values to each row based on the sector and fuel type
    dic_ef_II21 = {
        'Jet Kerosene' : {
            'CO2': 71500, 
            'CH4': 0.5, 
            'N2O': 2
        },
        'Aviation Gasoline' : {
            'CO2': 72000, 
            'CH4': 0.5, 
            'N2O': 2
        },
        'Diesel Oil' : {
            'CO2': 74100, 
            'CH4': 5, 
            'N2O': 0.6
        },
        'Motor Gasoline': {
            'CO2': 69300, 
            'CH4': 33, 
            'N2O': 3.2
        },
        'Gas Oil' : {
            'CO2': 74100, 
            'CH4': 3.9, 
            'N2O': 3.9
        },
        'Naphtha' : {
            'CO2': 73300, 
            'CH4': 0.5, 
            'N2O': 2
        }
    }
    new_rows = []

    for index, row in II.iterrows():
        fuel = row['fuel_ipcc']
        if fuel in dic_ef_II21.keys():
            ef_gas = dic_ef_II21[fuel]
            for gas, ef_value in ef_gas.items():
                        # Create a new row with gas name and emission factor value
                        new_row = row.copy()  # Copy the original row
                        new_row['gas_name'] = gas
                        new_row['emission_factor_value'] = ef_value
                        new_row['emission_factor_units'] = 'kg/TJ'
                        # Append the new row to the list
                        new_rows.append(new_row)

    # Create a new DataFrame from the list of new rows
    II = pd.DataFrame(new_rows)
    II = II.reset_index(drop=True)

    # calculating the emission values for this subsector
    II.loc[:, 'emissions_value'] = II['activity_value'] * II['emission_factor_value']

    #------------------------------------------------------------------------
    ### Final Details
    #------------------------------------------------------------------------
    # concatenate both dataframes
    final_df = pd.concat([I31, II], ignore_index=True)

    # add the activity name based on the subtype of commercialization
    translate_dic = {
        'Industrias Petroquímicas': 'petrochemical industries', 
        'Agro': 'agriculture machines', 
        'Transporte de Carga': 'freight transport',
        'transporte Público de Pasajeros': 'public passenger transport', 
        'Transporte Ferroviario': 'railway transport'
    }
    for index, row in final_df.iterrows():
        subsector = row['subtipodecomercializacion']
        fuel = row['fuel_ipcc']
        if subsector in translate_dic.keys():
            final_df.loc[index, 'activity_name'] = f'{fuel} combustion consumption by {translate_dic[subsector]}'

    # delete extra columns
    columns_to_drop = ['empresa', 'subtipodecomercializacion', 'producto', 'cantidad', 'units', 'fuel_ipcc', 'fuel_density', 'fuel_density_units', 'NCV_value', 'NCV_units']
    final_df = final_df.drop(columns=columns_to_drop)

    # assigning province CODE based on the province name
    region_code_dic = {
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
    for index, row in final_df.iterrows():
        region_name = row['provincia']
        if region_name in region_code_dic.keys():
            final_df.at[index, 'region_code'] = region_code_dic[region_name]

    # this year is not complete ( we're in 2024 :) )
    final_df = final_df[final_df['anio'] != 2024]
    # rename columns
    columns_to_rename = {
        'anio': 'year',
        'provincia': 'region_name'
    }
    final_df.rename(columns=columns_to_rename, inplace=True)
    # adding extra columns
    final_df.loc[:, 'source_name'] = 'SESCO'
    final_df.loc[:, 'temporal_granularity'] = 'annual'
    final_df.loc[:, 'emissions_units'] = 'kg'

    # Define a function to generate UUID for each row
    def generate_uuid(row):
        id_string = str(row['region_code']) + str(row['emissions_value']) + str(row['GPC_refno'])
        return uuid_generate_v3(id_string)
    # Apply the function to each row and assign the result to a new column 'id'
    final_df['id'] = final_df.apply(generate_uuid, axis=1)

    col_order = ['id', 'source_name', 'GPC_refno', 'region_name', 'region_code', 'temporal_granularity', 'year', 'activity_name', 'activity_value', 
                 'activity_units', 'gas_name', 'emission_factor_value', 'emission_factor_units', 'emissions_value', 'emissions_units']
    final_df = final_df.reindex(columns=col_order)
    
    # Save the file
    final_df.to_csv(f'{absolute_path}/processed_SESCO_AR.csv', sep=",", decimal=".", index=False)