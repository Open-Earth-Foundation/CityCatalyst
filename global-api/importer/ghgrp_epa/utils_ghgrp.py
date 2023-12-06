#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import pandas as pd
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

    df[columns_to_consider] = df[columns_to_consider].apply(pd.to_numeric)
    df[columns_to_consider] = df[columns_to_consider].fillna(0)
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
        melted_df = pd.melt(df, id_vars=col_list, value_vars=[column], var_name='subpart_name', value_name='emissions_quantity')
        melted_dfs.append(melted_df)
        
    result_df = pd.concat(melted_dfs, ignore_index=True)
    return result_df

def count_words(input_string):
    """Count words in a string"""
    final_sector = input_string.split(',')[0]
    return final_sector

def add_geometry(df):
    """create points wiht lat and lon information"""
    geometry = [Point(lon, lat) for lon, lat in zip(df['Longitude'], df['Latitude'])]
    df['geometry'] = geometry
    return df

def drop_zero(df):
    df = df[df['emissions_quantity'] != 0]
    df.reset_index(drop=True, inplace=True)
    return df

gpc_classification = {
    'subpart_name': {
        'Adipic Acid Production': {'gpc_refno':'IV.1'},
        'Aluminum Production': {'gpc_refno':'IV.1'},
        'Ammonia Manufacturing': {'gpc_refno':'IV.1'},
        'Cement Production': {'gpc_refno':'IV.1'},
        'Electricity Generation': {'final_sector': {
            'Power Plants': {'gpc_refno':'I.4.4'},
            'Waste': {'gpc_refno':'I.4.4'},
            'Minerals': {'gpc_refno':'I.4.1'},
            'Other': {'gpc_refno':'I.4.1'},
            'Chemicals': {'gpc_refno':'I.4.1'},
            'Metals': {'gpc_refno':'I.4.1'},
            'Pulp and Paper': {'gpc_refno':'I.4.1'},
            'Petroleum and Natural Gas Systems': {'gpc_refno':'I.4.1'},
            'Petroleum Product Suppliers': {'gpc_refno':'I.4.1'},
            'Injection of CO2': {'gpc_refno':'I.4.1'},
            'Natural Gas and Natural Gas Liquids Suppliers': {'gpc_refno':'I.4.1'},
            'Refineries': {'gpc_refno':'I.4.1'},
            'Import and Export of Equipment Containing Fluorintaed GHGs': {'gpc_refno':'I.4.1'},
            'Industrial Gas Suppliers': {'gpc_refno':'I.4.1'}}},
        'Electronics Manufacture': {'gpc_refno':'IV.1'},
        'Ferroalloy Production': {'gpc_refno':'IV.1'},
        'Fluorinated GHG Production': {'gpc_refno':'IV.1'},
        'Glass Production': {'gpc_refno':'IV.1'},
        'HCFC–22 Production from HFC–23 Destruction': {'gpc_refno':'IV.1'},
        'Hydrogen Production': {'gpc_refno':'IV.1'},
        'Industrial Waste Landfills': {'final_sector': {
            'Waste': {'gpc_refno':'III.1.1'},
            'Power Plants': {'gpc_refno':'III.1.1'},
            'Minerals': {'gpc_refno':'III.1.1'},
            'Other': {'gpc_refno':'III.1.1'},
            'Chemicals': {'gpc_refno':'III.1.1'},
            'Metals': {'gpc_refno':'III.1.1'},
            'Pulp and Paper': {'gpc_refno':'III.1.1'},
            'Petroleum and Natural Gas Systems': {'gpc_refno':'III.1.1'},
            'Petroleum Product Suppliers': {'gpc_refno':'III.1.1'},
            'Injection of CO2': {'gpc_refno':'III.1.1'},
            'Natural Gas and Natural Gas Liquids Suppliers': {'gpc_refno':'III.1.1'},
            'Refineries': {'gpc_refno':'III.1.1'},
            'Import and Export of Equipment Containing Fluorintaed GHGs': {'gpc_refno':'III.1.1'},
            'Industrial Gas Suppliers': {'gpc_refno':'III.1.1'}}},
        'Industrial Wastewater Treatment': {'final_sector': {
            'Waste': {'gpc_refno':'III.4.1'},
            'Power Plants': {'gpc_refno':'III.4.1'},
            'Minerals': {'gpc_refno':'III.4.1'},
            'Other': {'gpc_refno':'III.4.1'},
            'Chemicals': {'gpc_refno':'III.4.1'},
            'Metals': {'gpc_refno':'III.4.1'},
            'Pulp and Paper': {'gpc_refno':'III.4.1'},
            'Petroleum and Natural Gas Systems': {'gpc_refno':'III.4.1'},
            'Petroleum Product Suppliers': {'gpc_refno':'III.4.1'},
            'Injection of CO2': {'gpc_refno':'III.4.1'},
            'Natural Gas and Natural Gas Liquids Suppliers': {'gpc_refno':'III.4.1'},
            'Refineries': {'gpc_refno':'III.4.1'},
            'Import and Export of Equipment Containing Fluorintaed GHGs': {'gpc_refno':'III.4.1'},
            'Industrial Gas Suppliers': {'gpc_refno':'III.4.1'}}},
        'Iron and Steel Production': {'gpc_refno':'IV.1'},
        'Lead Production': {'gpc_refno':'IV.1'},
        'Lime Production': {'gpc_refno':'IV.1'},
        'Magnesium Production': {'gpc_refno':'IV.1'},
        'Manufacture of Electric Transmission and Distribution Equipment': {'gpc_refno':'IV.1'},
        'Miscellaneous Use of Carbonates': {'gpc_refno':'IV.1'},
        'Municipal Landfills': {'final_sector': {
            'Waste': {'gpc_refno':'III.1.1'},
            'Power Plants': {'gpc_refno':'III.1.1'},
            'Minerals': {'gpc_refno':'III.1.1'},
            'Other': {'gpc_refno':'III.1.1'},
            'Chemicals': {'gpc_refno':'III.1.1'},
            'Metals': {'gpc_refno':'III.1.1'},
            'Pulp and Paper': {'gpc_refno':'III.1.1'},
            'Petroleum and Natural Gas Systems': {'gpc_refno':'III.1.1'},
            'Petroleum Product Suppliers': {'gpc_refno':'III.1.1'},
            'Injection of CO2': {'gpc_refno':'III.1.1'},
            'Natural Gas and Natural Gas Liquids Suppliers': {'gpc_refno':'III.1.1'},
            'Refineries': {'gpc_refno':'III.1.1'},
            'Import and Export of Equipment Containing Fluorintaed GHGs': {'gpc_refno':'III.1.1'},
            'Industrial Gas Suppliers': {'gpc_refno':'III.1.1'}}},
        'Nitric Acid Production': {'gpc_refno':'IV.1'},
        'Petrochemical Production': {'gpc_refno':'IV.1'},
        'Petroleum Refining': {'gpc_refno': 'I.8.1'},
        'Petroleum and Natural Gas Systems – LNG Import/Export': {'gpc_refno': 'I.8.1'},
        'Petroleum and Natural Gas Systems – LNG Storage': {'gpc_refno': 'I.8.1'},
        'Petroleum and Natural Gas Systems – Offshore Production': {'gpc_refno': 'I.8.1'},
        'Petroleum and Natural Gas Systems – Processing': {'gpc_refno': 'I.8.1'},
        'Petroleum and Natural Gas Systems – Transmission/Compression': {'gpc_refno': 'I.8.1'},
        'Petroleum and Natural Gas Systems – Underground Storage': {'gpc_refno': 'I.8.1'},
        'Phosphoric Acid Production': {'gpc_refno':'IV.1'},
        'Pulp and Paper Manufacturing': {'gpc_refno':'IV.1'},
        'Silicon Carbide Production': {'gpc_refno':'IV.1'},
        'Soda Ash Manufacturing': {'gpc_refno':'IV.1'},
        'Stationary Combustion': {'final_sector': {
            'Waste': {'gpc_refno':'III.3.1'}, 
            'Power Plants': {'gpc_refno':'I.4.1'}, 
            'Chemicals': {'gpc_refno':'I.3.1'}, 
            'Metals': {'gpc_refno':'I.3.1'}, 
            'Minerals': {'gpc_refno':'I.3.1'}, 
            'Pulp and Paper': {'gpc_refno':'I.3.1'}, 
            'Refineries': {'gpc_refno':'I.3.1'},
            'Other': {'gpc_refno':'I.6.1'},
            'Petroleum and Natural Gas Systems': {'gpc_refno':'I.8.1'},
            'Petroleum Product Suppliers': {'gpc_refno':'I.7.1'},
            'Injection of CO2': {'gpc_refno':'I.7.1'},
            'Natural Gas and Natural Gas Liquids Suppliers': {'gpc_refno':'I.7.1'},
            'Refineries': {'gpc_refno':'I.8.1'},
            'Import and Export of Equipment Containing Fluorintaed GHGs': {'gpc_refno':'I.7.1'},
            'Industrial Gas Suppliers': {'gpc_refno':'I.7.1'}}},
        'Titanium Dioxide Production': {'gpc_refno':'IV.1'},
        'Underground Coal Mines': {'gpc_refno':'IV.1'},
        'Zinc Production': {'gpc_refno':'IV.1'}
        
    }
}