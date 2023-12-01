#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import pandas as pd
import numpy as np
from shapely.geometry import Point

def restructure(df):
    header_row = df.iloc[2]
    df.columns = header_row
    df = df[3:]
    df = df.reset_index(drop=True)
    
    # List of columns to delete
    columns_to_delete = ['FRS Id','Zip Code','Address', 'Primary NAICS Code','Total reported direct emissions', 
                         'CO2 emissions (non-biogenic) ','Methane (CH4) emissions ', 'Nitrous Oxide (N2O) emissions ',
                         'HFC emissions', 'PFC emissions', 'SF6 emissions ', 'NF3 emissions',
                         'Other Fully Fluorinated GHG emissions', 'HFE emissions', 
                         'Very Short-lived Compounds emissions', 'Other GHGs (metric tons CO2e)',
                         'Biogenic CO2 emissions (metric tons)',
                         'Is some CO2 collected on-site and used to manufacture other products and therefore not emitted from the affected manufacturing process unit(s)? (as reported under Subpart G or S)',
                         'Is some CO2 reported as emissions from the affected manufacturing process unit(s) under Subpart AA, G or P collected and transferred off-site or injected (as reported under Subpart PP)?',
                         'Does the facility employ continuous emissions monitoring? ']
    # Delete the specified columns
    df = df.drop(columns=columns_to_delete)
    return df

def nan_to_zero(df):
    columns_to_consider = ['Stationary Combustion','Electricity Generation','Adipic Acid Production','Aluminum Production','Ammonia Manufacturing','Cement Production','Electronics Manufacture','Ferroalloy Production','Fluorinated GHG Production','Glass Production','HCFC–22 Production from HFC–23 Destruction','Hydrogen Production','Iron and Steel Production','Lead Production', 'Lime Production','Magnesium Production','Miscellaneous Use of Carbonates','Nitric Acid Production','Petroleum and Natural Gas Systems – Offshore Production','Petroleum and Natural Gas Systems – Processing','Petroleum and Natural Gas Systems – Transmission/Compression','Petroleum and Natural Gas Systems – Underground Storage','Petroleum and Natural Gas Systems – LNG Storage','Petroleum and Natural Gas Systems – LNG Import/Export','Petrochemical Production','Petroleum Refining','Phosphoric Acid Production','Pulp and Paper Manufacturing','Silicon Carbide Production','Soda Ash Manufacturing','Titanium Dioxide Production','Underground Coal Mines','Zinc Production','Municipal Landfills','Industrial Wastewater Treatment','Manufacture of Electric Transmission and Distribution Equipment','Industrial Waste Landfills']

    df[columns_to_consider] = df[columns_to_consider].fillna(0)
    df[columns_to_consider] = df[columns_to_consider].apply(pd.to_numeric)
    
    return df

def max_col_name(df):
    """Find the column with the maximum value for each row"""
    
    columns_to_consider = ['Electricity Generation','Adipic Acid Production','Aluminum Production','Ammonia Manufacturing','Cement Production','Electronics Manufacture','Ferroalloy Production','Fluorinated GHG Production','Glass Production','HCFC–22 Production from HFC–23 Destruction','Hydrogen Production','Iron and Steel Production','Lead Production', 'Lime Production','Magnesium Production','Miscellaneous Use of Carbonates','Nitric Acid Production','Petroleum and Natural Gas Systems – Offshore Production','Petroleum and Natural Gas Systems – Processing','Petroleum and Natural Gas Systems – Transmission/Compression','Petroleum and Natural Gas Systems – Underground Storage','Petroleum and Natural Gas Systems – LNG Storage','Petroleum and Natural Gas Systems – LNG Import/Export','Petrochemical Production','Petroleum Refining','Phosphoric Acid Production','Pulp and Paper Manufacturing','Silicon Carbide Production','Soda Ash Manufacturing','Titanium Dioxide Production','Underground Coal Mines','Zinc Production','Municipal Landfills','Industrial Wastewater Treatment','Manufacture of Electric Transmission and Distribution Equipment','Industrial Waste Landfills']
    
    max_column = df[columns_to_consider].idxmax(axis=1)
    return max_column

def assign_value_to_max_col(df, max_col_list):
    """Add up the 'Stationary Combustion' value to the column with the max value found"""
    for i in range(len(df)):
        max_col = max_col_list[i]
        df.loc[i][max_col] += df.loc[i]['Stationary Combustion']  
        df.loc[i]['Stationary Combustion'] == 0
    return df

def format_change(df):
    col_list = ['Facility Id', 'Facility Name', 'City', 'State', 'County', 'Latitude', 'Longitude', 'Industry Type (subparts)', 'Industry Type (sectors)']

    columns_to_melt = df.columns.difference(col_list)

    # Initialize an empty list to store melted DataFrames
    melted_dfs = []

    # Iterate over columns to melt
    for column in columns_to_melt:
        melted_df = pd.melt(df, id_vars=col_list, value_vars=[column], var_name='subpart', value_name='gas_quantity')
        melted_dfs.append(melted_df)
        
    result_df = pd.concat(melted_dfs, ignore_index=True)
    return result_df

def count_words(input_string):
    """Count words in a string"""
    final_sector = input_string.split(',')[0]
    return final_sector

def assign_gpc_ref_no(df):
    """
    Conditions made based on the EPA facilities classification
    more info: README file
    """
    # Define conditions
    condition_1 = (df['subpart'] == 'Stationary Combustion')
    condition_2 = (df['final_industry'] == 'Waste')
    condition_3 = (df['final_industry'] == 'Power Plants')
    condition_4 = (df['final_industry'].isin(['Chemicals', 'Metals', 'Minerals', 'Pulp and Paper', 'Refineries']))
    condition_5 = (df['final_industry'] != 'Waste')
    condition_6 = (df['subpart'] == 'Industrial Waste Landfills')
    condition_7 = (df['subpart'] == 'Municipal Landfills')
    condition_8 = (df['subpart'] == 'Industrial Wastewater Treatment')
    condition_9 = (df['subpart'] == 'Municipal Landfills')
    condition_10 = (df['subpart'] != 'Stationary Combustion')
    condition_11 = (df['subpart'] == 'Electricity Generation')
    condition_12 = (df['final_industry'] == 'Power Plants')
    condition_13 = df['subpart'].isin(['Petroleum Refining', 'Petroleum and Natural Gas Systems – LNG Import/Export', 'Petroleum and Natural Gas Systems – LNG Storage', 'Petroleum and Natural Gas Systems – Offshore Production','Petroleum and Natural Gas Systems – Processing', 'Petroleum and Natural Gas Systems – Transmission/Compression', 'Petroleum and Natural Gas Systems – Underground Storage'])

    # Define corresponding values
    values = ['III.3.1', 'I.4.1', 'I.3.1', 'III.1.1', 'III.1.1', 'III.4.1', 'III.1.1', 'IV.1', 'I.4.4', 
              'III.1.1', 'III.4.1', 'III.1.1', 'I.8.1']

    # Use numpy.select to assign values based on conditions
    df['GPC_ref_no'] = np.select([condition_1 & condition_2, condition_1 & condition_3, condition_1 & condition_4,
                                  condition_2 & condition_6, condition_2 & condition_6, condition_2 & condition_8, 
                                  condition_2 & condition_9, condition_10 & condition_4, condition_11 & condition_12,
                                  condition_5 & condition_8, condition_5 & condition_8, condition_5 & condition_7,
                                  condition_13], 
                                  values, default=np.nan)
    return df

def add_geometry(df):
    """create points wiht lat and lon information"""
    geometry = [Point(lon, lat) for lon, lat in zip(df['Longitude'], df['Latitude'])]
    df['geometry'] = geometry
    return df