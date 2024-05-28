import csv
import math
import os
import pandas as pd
import numpy as np
from pathlib import Path
import re
import statistics
from utils import (
    make_dir,
    write_dic_to_csv,
    uuid_generate_v3,
    uuid_generate_v4,
    get_filename,
    set_seed,
    string_to_hash,
)

def separate_min_max_median(val):
    """extract value, takes median if range is given"""
    if isinstance(val, float):
        return {"value": val, "value_min": None, "value_max": None}

    value = val.replace(" ", "").strip()

    range_pattern = r"(?P<min>[\d.]+)-(?P<max>[\d.]+)"
    single_pattern = r"^([\d.]+)$"

    range_match = re.search(range_pattern, value)
    single_match = re.match(single_pattern, value)

    if range_match:
        min_val = float(range_match.group("min"))
        max_val = float(range_match.group("max"))
        median = statistics.median([min_val, max_val])
        return {"value": median, "value_min": min_val, "value_max": max_val}
    elif single_match:
        return {
            "value": float(single_match.group(1)),
            "value_min": None,
            "value_max": None,
        }
    else:
        return {"value": None, "value_min": None, "value_max": None}

def gas_name_to_formula(value, replace_dict=None):
    """replace gas name with formula"""
    if replace_dict is None:
        replace_dict = {
            "CARBON DIOXIDE\n": "CO2",
            "METHANE\n": "CH4",
            "NITROUS OXIDE\n": "N2O",
            "Sulphur Hexafluoride\n": "SF6",
            "CARBON MONOXIDE\n": "CO",
            "Nitrogen Trifluoride\n": "NF3",
            "AMMONIA\n": "NH3"
            
        }
    else:
        replace_dict = {key.upper(): value for key, value in replace_dict.items()}

    new_value = replace_dict.get(value.upper(), None)

    if new_value:
        return new_value

    return value

def save_to_csv(fl, data):
    """save list of dictionaries to CSV"""
    with open(fl, "w", newline="") as csvfile:
        fieldnames = data[0].keys()  # Assuming all dictionaries have the same keys
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)

        writer.writeheader()
        writer.writerows(data)

# Mapping IPCC to GPC
mapping_ipcc_to_gpc = {
    '1.A - Fuel Combustion Activities\n': ['I.1.1',
                                           'I.2.1',
                                           'I.3.1',
                                           'I.4.1',
                                           'I.5.1',
                                           'I.6.1'],
    '1.A - Fuel Combustion Activities\n1.A.1.b - Petroleum Refining\n': ['I.7.1'],
    '1.A.1 - Energy Industries\n': ['1.4.4'],
    '1.A.1 - Energy Industries\n1.A.4.a - Commercial/Institutional\n1.A.4.b - Residential\n1.A.4.c - Agriculture/Forestry/Fishing/Fish Farms\n1.A.4.c.i - Stationary\n': ['I.4.4'],
    '1.A.1.a - Main Activity Electricity and Heat Production\n': ['I.4.4'],
    '1.A.1.a - Main Activity Electricity and Heat Production\n1.A.1.a.i - Electricity Generation\n1.A.1.a.ii - Combined Heat and Power Generation (CHP)\n1.A.1.a.iii - Heat Plants\n': ['I.4.4'],
    '1.A.1.a.i - Electricity Generation\n': ['I.4.4'],
    '1.A.1.a.ii - Combined Heat and Power Generation (CHP)\n': ['I.4.4'],
    '1.A.1.a.iii - Heat Plants\n': ['I.4.4'],
     '1.A.1.c.ii - Other Energy Industries\n': ['1.4.4'],
    '1.A.2 - Manufacturing Industries and Construction\n': ['I.3.1'],
    '1.A.2 - Manufacturing Industries and Construction\n1.A.4.a - Commercial/Institutional\n': ['I.3.1', 
                                                                                                'I.2.1'],
    '1.A.2 - Manufacturing Industries and Construction\n1.A.4.a - Commercial/Institutional\n1.A.4.b - Residential\n1.A.4.c.ii - Off-road Vehicles and Other Machinery\n': ['I.3.1', 
                                                                                                                                                                           'I.2.1', 
                                                                                                                                                                           'I.1.1'],
    '1.A.2.a - Iron and Steel\n': ['I.3.1'],
    '1.A.2.b - Non-Ferrous Metals\n': ['I.3.1'],
    '1.A.2.c - Chemicals\n': ['I.3.1'],
    '1.A.2.d - Pulp, Paper and Print\n': ['I.3.1'],
    '1.A.2.e - Food Processing, Beverages and Tobacco\n': ['I.3.1'],
    '1.A.2.f - Non-Metallic Minerals\n': ['I.3.1'],
    '1.A.2.g - Transport Equipment\n': ['I.3.1'],
    '1.A.2.h - Machinery\n': ['I.3.1'],
    '1.A.2.j - Wood and wood products\n': ['I.3.1'],
    '1.A.2.l - Textile and Leather\n': ['I.3.1'],
    '1.A.4.a - Commercial/Institutional\n': ['I.2.1'],
    '1.A.4.b - Residential\n': ['I.1.1'],
    '1.A.4.b - Residential\n1.A.4.c.i - Stationary\n': ['I.1.1'],
    '1.A.4.c.i - Stationary\n': ['I.5.1'],
    '1.B.1.a - Coal mining and handling\n': ['I.7.1'],
    '1.B.1.a.i - Underground mines\n': ['I.7.1'],
    '1.B.1.a.i.1 - Mining\n': ['I.7.1'],
    '1.B.1.a.i.2 - Post-mining seam gas emissions\n': ['I.7.1'],
    '1.B.1.a.i.3 - Abandoned underground mines\n': ['I.7.1'],
    '1.B.1.a.ii - Surface mines\n': ['I.7.1'],
    '1.B.1.a.ii.1 - Mining\n': ['I.7.1'],
    '1.B.1.a.ii.2 - Post-mining seam gas emissions\n': ['I.7.1'],
    '1.B.2 - Oil and Natural Gas\n': ['I.8.1'],
    '1.B.2.a - Oil\n': ['I.8.1'],
    '1.B.2.a.i - Venting\n': ['I.8.1'],
    '1.B.2.a.ii - Flaring\n': ['I.8.1'],
    '1.B.2.a.ii - Flaring\n1.B.2.b.ii - Flaring\n': ['I.8.1'],
    '1.B.2.b - Natural Gas\n': ['I.8.1'],
    '1.B.2.b.i - Venting\n': ['I.8.1'],
    '1.B.2.b.ii - Flaring\n': ['I.8.1'],
    '1.B.3 - Other emissions from Energy Production\n': ['I.4.1']
}

# methodologies for Stationary Energy
mapping_gpc_to_methodologies = [
    'fuel_combustion_consumption',
    'sampling_scaled_data',
    'modeled_data'
    ]

# References on density values
ref_density_dic = {
    'Aqua_Calc_tool': 'https://www.aqua-calc.com/page/density-table/substance/coal-coma-and-blank-anthracite-blank-solid',
    'EF_GHG_protocol': 'https://ghgprotocol.org/calculation-tools-and-guidance',
    'engineering_tool_box': 'https://www.engineeringtoolbox.com/gas-density-d_158.html'
}

# dictionary with density values
densities_dic = {
    'Anthracite': {
        'value': 1506, 
        'units': 'kg/m3',
        'reference': 'Aqua_Calc_tool',
    }, 
    'Other Bituminous Coal': {
        'value': 1346, 
        'units': 'kg/m3',
        'reference': 'Aqua_Calc_tool'
    }, 
    'Lignite': {
        'value': 400, 
        'units': 'kg/m3',
        'reference': 'Aqua_Calc_tool'
    }, 
    'Peat': {
        'value': 400, 
        'units': 'kg/m3',
        'reference': 'Aqua_Calc_tool'
    },
    'Crude Oil': {
        'value': 800, 
        'units': 'kg/m3',
        'reference': 'EF_GHG_protocol'
    }, 
    'Motor Gasoline': {
        'value': 740, 
        'units': 'kg/m3',
        'reference': 'EF_GHG_protocol'
    }, 
    'Other Kerosene': {
        'value': 800, 
        'units': 'kg/m3',
        'reference': 'EF_GHG_protocol'
    }, 
    'Gas Oil': {
        'value': 840, 
        'units': 'kg/m3',
        'reference': 'EF_GHG_protocol'
    },
    'Diesel Oil': {
        'value': 840, 
        'units': 'kg/m3',
        'reference': 'EF_GHG_protocol'
    }, 
    'Residual Fuel Oil': {
        'value': 940, 
        'units': 'kg/m3',
        'reference': 'EF_GHG_protocol'
    }, 
    'Natural Gas': {
        'value': 0.7, 
        'units': 'kg/m3',
        'reference': 'EF_GHG_protocol'
    },
    'Charcoal': {
        'value': 208, 
        'units': 'kg/m3',
        'reference': 'Aqua_Calc_tool'
    },
    'Sub-Bituminous Coal': {
        'value': 1346, 
        'units': 'kg/m3',
        'reference': 'Aqua_Calc_tool'
    }, 
    'Liquefied Petroleum Gases': {
        'value': 540, 
        'units': 'kg/m3',
        'reference': 'EF_GHG_protocol'
    }, 
    'Coking Coal': {
        'value': 829.76, 
        'units': 'kg/m3',
        'reference': 'Aqua_Calc_tool'
    },
    'Coke Oven Coke and Lignite Coke': {
        'value': 400, 
        'units': 'kg/m3',
        'reference': 'Aqua_Calc_tool'
    }, 
    'Naphtha': {
        'value': 770, 
        'units': 'kg/m3',
        'reference': 'EF_GHG_protocol'
    }, 
    'Coke Oven Gas': {
        'value': 0.545, 
        'units': 'kg/m3',
        'reference': 'engineering_tool_box'
    },
    'Natural Gas Liquids\n(NGLs)': {
        'value': 500, 
        'units': 'kg/m3',
        'reference': 'Aqua_Calc_tool'
    },
    'Jet Kerosene': {
        'value': 790, 
        'units': 'kg/m3',
        'reference': 'EF_GHG_protocol'
    }, 
    'Bitumen': {
        'value': 1346, 
        'units': 'kg/m3',
        'reference': 'Aqua_Calc_tool'
    }
}

if __name__ == "__main__":
    # set random.seed so UUID is reproducible
    #! assumes records always generated in same order
    seed_string = get_filename()
    seed_value = string_to_hash(seed_string)
    set_seed(seed_value)

    # output directory
    output_dir = "../data_processed/EFDB_2006_IPCC_guidelines/"
    output_dir = os.path.abspath(output_dir)
    make_dir(path=Path(output_dir).as_posix())

    # raw data file path
    input_fl = "../data_raw/EFDB_2006_IPCC_guidelines/EFDB_output.xlsx"
    input_fl = os.path.abspath(input_fl)

    # =================================================================
    # Publisher
    # =================================================================
    publisher_data = {
        "name": "IPCC",
        "URL": "https://www.ipcc.ch/",
    }
    publisher_data["publisher_id"] = uuid_generate_v3(name=publisher_data.get("name"))

    write_dic_to_csv(output_dir, "Publisher", publisher_data)

    # =================================================================
    # DataSource
    # =================================================================
    datasource_data = {
        "datasource_name": "IPCC",
        "dataset_name": "IPCC Emission Factor Database (EFDB) [2006 IPCC Guidelines]",
        "URL": "https://www.ipcc-nggip.iges.or.jp/EFDB/main.php",
        "publisher_id": publisher_data.get("publisher_id"),
    }
    datasource_data["datasource_id"] = uuid_generate_v3(name=datasource_data.get("dataset_name"))

    write_dic_to_csv(output_dir, "DataSource", datasource_data)

    # =================================================================
    # EmissionsFactor
    # =================================================================
    # read raw dataset
    df = pd.read_excel(input_fl)

    # drop extra columns
    df = df.drop(columns=['IPCC 1996 Source/Sink Category', 'Fuel 1996', 'C pool', 'Type of parameter', 'Abatement / Control Technologies', 'IPCC Worksheet', 'Source of data', 'Data provider'])

    # clean reference info
    df['Technical Reference'] = df['Technical Reference'].replace('??????? ? ?????? ???????-????? I. ???????-??????? ???????', None)

    # extract only EF values for Stationary Energy using IPCC refno
    filt_cat = df["IPCC 2006 Source/Sink Category"].str.contains("1.A", case=True, na=False)
    df_filt = df.loc[filt_cat].reset_index(drop=True)

    # extract only EF values
    filt_desc = df_filt["Description"].str.contains("EF | emission factor", case=False, na=False)
    df_filt = df_filt.loc[filt_desc].reset_index(drop=True)

    # delete the other EF values we don't need
    filt_NCV = df_filt['Description'].str.contains('NCV', case=False, na=False)
    EF_df = df_filt.loc[~filt_desc].reset_index(drop=True)

    output_list = []

    for _, row in EF_df.iterrows():
        # get min, max, and median value
        value = row.pop("Value")
        value_dic = separate_min_max_median(value)

        # rename rows and convert to dictionary
        row_dic = row.rename(
            {
                "Unit": "units",
                "IPCC 2006 Source/Sink Category": "ipcc_2006_category",
                "Gas": "gas",
                "Fuel 2006": "fuel",
                "Region / Regional Conditions": "region",
                "Description": "description",
                "Equation": "equation",
                "Technical Reference": "reference",
                "Parameters / Conditions": "parameters",
                "Other properties": "properties",
                "Technologies / Practices": "practices"
            }
        ).to_dict()

        # merge dictionaries
        dic_tmp = {**row_dic, **value_dic}

        # convert nan to None
        output_dic = {
            key: None if (isinstance(value, float)) and math.isnan(value) else value
            for key, value in dic_tmp.items()
        }

        # replace name of gas with chemical formula
        output_dic["gas"] = gas_name_to_formula(output_dic["gas"])

        # append to list
        output_list.append(output_dic)

    EF_df = pd.DataFrame(output_list)

    # assign "GPC_refno" using the mapping dic
    EF_df['GPC_refno'] = EF_df['ipcc_2006_category'].map(mapping_ipcc_to_gpc)

    # remove EFs that don't apply
    EF_df = EF_df.dropna(subset=['GPC_refno'])

    gas = ['CO2', 'CH4', 'N2O']
    EF_df = EF_df[EF_df['gas'].isin(gas)]

    # standardize units
    EF_df['units'] = EF_df['units'].replace({'KG/TJ':'kg/TJ', 'kg CO2/GJ': 'kg/GJ'}, regex=True)

    # Replace None values, which means "generic EF", with "world"
    EF_df['region'].fillna('world', inplace=True)

    # extract useful information from 'properties' column to be used later
    # Define constants for slicing positions
    NCV_START_1 = 26
    NCV_END_1 = 30
    NCV_UNITS_1 = 'TJ/kg'

    NCV_START_2 = 5
    NCV_END_2 = 10
    NCV_UNITS_2 = 'MJ/kg'

    DENSITY_VALUE_START = 55
    DENSITY_VALUE_END = -6
    DENSITY_UNITS = 'kg/m3'

    # Function to extract NCV and density values
    def extract_metadata(properties, condition):
        if condition == 'Net Calorific Value':
            return {'NCV_value': properties[NCV_START_1:NCV_END_1], 'NCV_units': NCV_UNITS_1}
        elif condition == 'NCV: ':
            return {'NCV_value': properties[NCV_START_2:NCV_END_2], 'NCV_units': NCV_UNITS_2}
        elif condition == 'density:':
            return {'NCV_value': properties[NCV_START_2:NCV_END_2], 'NCV_units': NCV_UNITS_2, 
                    'density_value': properties[DENSITY_VALUE_START:DENSITY_VALUE_END], 'density_units': DENSITY_UNITS}
        return {'NCV_value': pd.NA, 'NCV_units': pd.NA, 'density_value': pd.NA, 'density_units': pd.NA}

    # Function to expand metadata dictionary into separate columns
    def expand_metadata(metadata):
        return pd.Series(metadata)

    # Apply conditions and update the metadata column
    conditions = ['Net Calorific Value', 'NCV: ', 'density:']
    for condition in conditions:
        mask = EF_df['properties'].str.contains(condition, na=False)
        EF_df.loc[mask, ['NCV_value', 'NCV_units', 'density_value', 'density_units']] = EF_df.loc[mask, 'properties'].apply(lambda x: expand_metadata(extract_metadata(x, condition))) 

    # drop extra columns
    EF_df = EF_df.drop(columns=['value_min', 'value_max'])

    # filter the first df to extract Net Calorific Values to transform EF into other units
    # extract GCV and NCV
    filt_NCV = df["Description"].str.contains('NCV', case=False, na=False)
    filt_df = df.loc[filt_NCV].reset_index(drop=True)

    # change column names
    filt_df = filt_df.rename(columns={'IPCC 2006 Source/Sink Category': 'ipcc_2006_category', 'Fuel 2006': 'fuel', 'Value': 'NCV_value', 'Unit': 'NCV_units'})

    # drop extra columns
    filt_df = filt_df.drop(columns = ['EF ID', 'Gas', 'Technologies / Practices', 'Parameters / Conditions', 'Region / Regional Conditions',  'Other properties', 'Equation', 'Technical Reference'])

    # New list to hold NCV and GCV values
    tmp = []

    # Process each row
    for index, row in filt_df.iterrows():
        value = str(row['NCV_value'])
        
        if '(GCV)' in value and '(NCV)' in value:
            # Extract the values
            parts = value.split('(GCV)')
            gcv_value = parts[0].strip()
            ncv_value = parts[1].split('(NCV)')[0].strip()
            # Create new rows for GCV and NCV values
            gcv_row = row.copy()
            gcv_row['NCV_value'] = gcv_value
            gcv_row['Description'] = 'Gross Calorific Value'
            
            ncv_row = row.copy()
            ncv_row['NCV_value'] = ncv_value
            ncv_row['Description'] = 'Net Calorific Value'
            
            # Append new rows
            tmp.append(gcv_row)
            tmp.append(ncv_row)
        else:
            tmp.append(row)

    # Convert the data back to a DataFrame
    filt_df = pd.DataFrame(tmp)

    # standardization of units
    valid_units = ['TJ/Gg', 'TJ/kt', 'MJ/m3', 'MJ/kg', 'kJ/g', 'GJ/tonne', 'Btu/gal', 'tC/TJ', 'TJ/m3', 'TJ/kl']

    for index, row in filt_df.iterrows():
        units = row['NCV_units']
        value = row['NCV_value']
        converted_value = None
        new_units = None
        
        # Check if units need conversion
        if 'GJ/1000m3' in units:
            converted_value = np.float16(value) * 1e-3
            new_units = 'GJ/m3'
            
        elif units in ['GJ/1000 litre', 'GJ/1000litre']:
            converted_value = np.float16(value) * 1e-3
            new_units = 'GJ/litre'
            
        elif units == 'TJ/10^6m3 @SATP':
            converted_value = np.float16(value) * 1e-6
            new_units = 'TJ/m3'
            
        elif units == 'TJ/10^3kl @SATP':
            converted_value = np.float16(value) * 1e-3
            new_units = 'TJ/kl'
        
        # Update df with converted value and units if conversion occurred
        if converted_value is not None:
            filt_df.at[index, 'NCV_value'] = converted_value
            filt_df.at[index, 'NCV_units'] = new_units
        
        # Check if units are valid
        elif units not in valid_units:
            print("Error: unrecognized units - ", units, " - line ", index)

    # fix values representing ranges
    for index, row in filt_df.iterrows():
        value = row['NCV_value']
        value_dic = separate_min_max_median(value)
        filt_df.at[index, 'NCV_value'] = value_dic['value']
        filt_df.at[index, 'Value_min'] = value_dic['value_min']
        filt_df.at[index, 'Value_max'] = value_dic['value_max']

    # drop extra columns
    filt_df = filt_df.drop(columns=['Value_min','Value_max'])

    # change 'Description' information
    filt_df['Description'] = np.where(
        filt_df['Description'].str.contains('Net Calorific Value|NCV', case=False, na=False),
        'NCV',
        np.where(
            filt_df['Description'].str.contains('Gross Calorific Value', case=False, na=False),
            'GCV',
            filt_df['Description']
        )
    )

    # filter df
    filt_df = filt_df[filt_df['Description'] == 'NCV']

    # Merge NCV with EF_df
    EF_df = EF_df.merge(filt_df, on=['fuel','ipcc_2006_category'], how='left')

    # assign NCV values and units when apply
    EF_df['NCV_value'] = EF_df['NCV_value_x'].combine_first(EF_df['NCV_value_y'])
    EF_df['NCV_units'] = EF_df['NCV_units_x'].combine_first(EF_df['NCV_units_y'])

    # Drop the original 'NCV_value_x' and 'NCV_value_y' columns
    EF_df.drop(columns=['NCV_value_x', 'NCV_value_y', 'NCV_units_x', 'NCV_units_y'], inplace=True)

    # fill density values in EF_df
    for index, row in EF_df.iterrows():
        if pd.isna(row['density_value']):
            fuel = row['fuel']
            if fuel in densities_dic.keys():
                # Fill the missing density_value and density_units using the dictionary
                EF_df.at[index, 'density_value'] = densities_dic[fuel]['value']
                EF_df.at[index, 'density_units'] = densities_dic[fuel]['units']

    # Conversion process
    def convert_units(df, unit_col, value_col, from_unit, to_unit, conversion_factor):
        # Filter the DataFrame based on the from_unit
        filtered_df = df[df[unit_col] == from_unit]
        # conversion
        filtered_df[unit_col] = to_unit
        filtered_df[value_col] *= conversion_factor
        df.update(filtered_df)

    # Define the conversions and their respective factors
    conversions = [
        ('tC/TJ', 'kg/TJ', 44/12),
        ('gC/MJ', 'g/MJ', 44/12),
        ('g/MJ', 'kg/TJ', 1),
        ('kg/GJ', 'kg/TJ', 1000)
    ]

    # Apply the conversions 
    for from_unit, to_unit, conversion_factor in conversions:
        convert_units(EF_df, 'units', 'value', from_unit, to_unit, conversion_factor)

    # convert 'NCV_value' column into numeric
    EF_df['NCV_value'] = pd.to_numeric(EF_df['NCV_value'], errors='coerce')

    convert_units(EF_df, 'NCV_units', 'NCV_value', 'MJ/kg', 'TJ/kg', 1e-6)

    # create new columns for EF units transformation
    EF_df['emissions_per_activity'] = EF_df['value']

    # calculate EF of mass of gas / mass of fuel
    new_rows = []
    for index, row in EF_df.iterrows():
        ncv_value = row['NCV_value']
        ncv_units = row['NCV_units']
        ef_value = row['value']
        ef_units = row['units']

        if ncv_units in ['TJ/Gg', 'TJ/kt', 'TJ/kl', 'TJ/kg', 'TJ/m3']:
            new_row = row.copy()
            new_row['emissions_per_activity'] = ncv_value * ef_value
            new_row['units'] = f'{ef_units[:2]}/{ncv_units[3:]}'
            new_rows.append(new_row)
    new_rows = pd.DataFrame(new_rows)
    # add the new rows with the conversions
    EF_df = pd.concat([EF_df, new_rows], ignore_index=True)

    # Define the conversions and their respective factors
    conversions = [
        ('kg/kl', 'kg/l', 1e-3),
        ('kg/Gg', 'kg/kg', 1e-6),
        ('kg/kt', 'kg/t', 1e-3),
        ('kg/l', 'kg/m3', 1e3)
    ]

    new_rows = []

    # Apply the conversions 
    for from_unit, to_unit, conversion_factor in conversions:
        convert_units(EF_df, 'units', 'emissions_per_activity', from_unit, to_unit, conversion_factor)

    # convert 'density_value' column into numertic type
    EF_df['density_value'] = pd.to_numeric(EF_df['density_value'], errors='coerce')

    new_rows = []

    for index, row in EF_df.iterrows():
        density_value = row['density_value']
        ef_value = row['emissions_per_activity']
        ef_units = row['units']

        if ef_units in ['kg/kg']:
            new_row = row.copy()
            new_row['emissions_per_activity'] = ef_value * density_value
            new_row['units'] = 'kg/m3'
            new_rows.append(new_row)
            
    new_rows = pd.DataFrame(new_rows)
    # add the new rows with the conversions
    EF_df = pd.concat([EF_df, new_rows], ignore_index=True)

    # fill empty values in the 'EF_value' column
    EF_df['emissions_per_activity'].fillna(EF_df['value'], inplace=True)

    # drop extra columns
    EF_df = EF_df.drop(columns = ['Description', 'value'])

    # make a row for each GPC_refno
    EF_df = EF_df.explode('GPC_refno', ignore_index=True)

    # make a row for each methodology
    EF_df['methodology'] = [mapping_gpc_to_methodologies] * len(EF_df)
    EF_df = EF_df.explode('methodology', ignore_index=True)

    EF_df["emissions_factor_id"] = EF_df.apply(
        lambda row: uuid_generate_v4(), axis=1
    )

    EF_df.to_csv(f"{output_dir}/EmissionsFactor.csv", index=False)

    # =================================================================
    # DataSourceEmissionsFactor
    # =================================================================
    datasource_emissions_factor_data = [
        {
            "datasource_id": datasource_data.get("datasource_id"),
            "emissions_factor_id": emissions_factor_id,
        }
        for emissions_factor_id in EF_df["emissions_factor_id"]
    ]

    write_dic_to_csv(
        output_dir, "DataSourceEmissionsFactor", datasource_emissions_factor_data
    )