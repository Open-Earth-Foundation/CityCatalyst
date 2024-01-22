#!/usr/bin/env python
# coding: utf-8

import pandas as pd
import numpy as np
from openclimate import Client


client = Client()
# if using jupyter or iPython
client.jupyter


# GHG emissions from energy

# import data
path = "./GHGHighlights.XLS"

# ghg emissions from energy by region, country or economy
sheet1 = pd.read_excel(path, sheet_name="GHG Energy")

# ghg emissions by subsector for 2021
sheet2 = pd.read_excel(path, sheet_name="SECTOR")


# Pre-process

# General emissions

# Select a row as column names
columns = sheet1.loc[20]

# Assign the selected row as column names
sheet1.columns = columns

# Select the rows of interest
sheet1 = sheet1[21:195]
sheet1 = sheet1.reset_index(drop=True)

# replace null values
sheet1 = sheet1.replace("..", np.nan)

# Emissions by subsector 2021

# Select the columns of interest
sheet2 = sheet2.iloc[:, :-11]

# new column names
new_col = [
    "Region_Country_Economy",
    "total_CO2_emissions_from_fuel_combustion",
    "electricity_and_heat_production",
    "other_energy_industry_own_use",
    "manuf_industries_and_construction",
    "total_transport",
    "road_transport",
    "residential",
    "commercial_public_services",
]

# Assign the selected row as column names
sheet2.columns = new_col

# Select the rows of interest
sheet2 = sheet2[21:195]
sheet2 = sheet2.reset_index(drop=True)

# replace null values
sheet2 = sheet2.replace(
    {"..": 0, "-": 0}
)  # These changes don't mean that emissions are 0, it's only for not having problems with arithmetic operations

# separete the emissions from road transportation and other type of transport
sheet2["other_transport"] = sheet2["total_transport"] - sheet2["road_transport"]

# delete the 'total_transport' column
sheet2 = sheet2.drop("total_transport", axis=1)

subsector_names = list(sheet2.columns[2:])

portions = pd.DataFrame()
portions["Region_Country_Economy"] = sheet2["Region_Country_Economy"]

# sum over all the sector to have a total co2 emissions number to calculate the portion of each sector
portions["total_CO2 emissions"] = sheet2[subsector_names].sum(axis=1)


def sector_portion(df1, df2, column_name):
    """to calculate the emissions' portion of each subsector based on the subsector value and the total co2 emissions for each country"""
    total_co2 = df1["total_CO2 emissions"]
    co2_sector = df2[column_name]
    portion = co2_sector / total_co2
    return portion


for sector in subsector_names:
    portions[sector] = sector_portion(portions, sheet2, sector)


# Process

# select the years of interest to split the total emissions into each subsector
df = sheet1[["Region/Country/Economy", 2020, 2022]]

# year 2020
df1 = pd.DataFrame()
for subsector in subsector_names:
    df1.loc[:, subsector] = df[2020] * portions[subsector]
    df1["year"] = 2020
    df1["Region_Country_Economy"] = df["Region/Country/Economy"]

df1 = pd.melt(
    df1,
    id_vars=["Region_Country_Economy", "year"],
    value_vars=subsector_names,
    var_name="activity_name",
    value_name="emissions_value",
)

# year 2022
df2 = pd.DataFrame()
for subsector in subsector_names:
    df2.loc[:, subsector] = df[2022] * portions[subsector]
    df2["year"] = 2022
    df2["Region_Country_Economy"] = df["Region/Country/Economy"]

df2 = pd.melt(
    df2,
    id_vars=["Region_Country_Economy", "year"],
    value_vars=subsector_names,
    var_name="activity_name",
    value_name="emissions_value",
)

sheet2["year"] = 2021
sheet2 = pd.melt(
    sheet2,
    id_vars=["Region_Country_Economy", "year"],
    value_vars=subsector_names,
    var_name="activity_name",
    value_name="emissions_value",
)

# concant the dataframes
df = pd.concat([df1, sheet2, df2])

# delete the rows with nan values
df = df.dropna()

# keep only the country data to use the open climate python client to extract the country code
values_to_remove = [
    "OECD Americas",
    "OECD Asia Oceania",
    "OECD Europe",
    "Russian Federation",
    "Non-OECD Europe and Eurasia",
    "Asia (excl. China)",
    "People's Rep. of China",
    "Non-OECD Americas",
    "Middle East",
    "European Union - 27",
    "G7",
    "G8",
    "Americas",
    "Former Soviet Union (if no detail)",
    "Hong Kong, China",
    "Gibraltar",
    "Former Yugoslavia (if no detail)",
    "Other Africa",
    "Chinese Taipei",
    "Other Asia",
    "Other Non-OECD Americas",
    "IEA/Accession/Association",
    "G20",
    "Asia",
    "Europe",
    "Oceania",
]

# remove all the regions and economies and keep just the countries
df = df[~df["Region_Country_Economy"].isin(values_to_remove)]

# change some country names
to_change = [
    "Dem. Rep. of Congo",
    "Kingdom of Eswatini",
    "United Rep. of Tanzania",
    "Islamic Rep. of Iran",
    "Slovak Republic",
    "Republic of Türkiye",
    "Republic of North Macedonia",
    "DPR of Korea",
    "China (incl. Hong Kong, China)",
]
new = [
    "Congo",
    "Eswatini",
    "Tanzania",
    "Iran",
    "Slovak",
    "Türkiye",
    "North Macedonia",
    "Korea",
    "China",
]

df["Region_Country_Economy"] = df["Region_Country_Economy"].replace(to_change, new)

# assigning country_id based on the country name
for index, row in df.iterrows():
    country_name = row["Region_Country_Economy"]

    try:
        tmp = client.search(query=country_name)

        if not tmp.empty and "type" in tmp.columns and "actor_id" in tmp.columns:
            country_id = tmp[tmp["type"] == "country"]["actor_id"].iloc[0]
            df.at[index, "country_id"] = country_id
        else:
            continue

    except Exception as e:
        print(f"An error occurred for country: {country_name}. Error: {str(e)}")

# fixing a problem with Curaçao
tmp = client.search(query="Curaçao")
filtered_rows = df[df["Region_Country_Economy"] == "Curaçao"]
country_id = tmp["actor_id"][0]
filtered_rows.loc[:, "country_id"] = country_id
df.update(filtered_rows)

# rename the 'Region_Country_Economy' column into country_name
df.rename(columns={"Region_Country_Economy": "country_name"}, inplace=True)

# adding extra columns to be matched with the DB table
df["gas_name"] = "co2e"
df["emissions_units"] = "kg"
df["source_name"] = "IEA_energy"
df["temporal_granularity"] = "annual"

# original data is in millions of tonnes
df["emissions_value"] = df["emissions_value"] * 1e6 * 1e3

subsector_dic = {
    "electricity_and_heat_production": "I.4.4",
    "other_energy_industry_own_use": "I.4.2",
    "manuf_industries_and_construction": "I.3.2",
    "other_transport": "II.5.2",
    "road_transport": "II.1.2",
    "residential": "I.1.2",
    "commercial_public_services": "I.2.2",
}

# assigning gpc reference number based on the fuel type
for index, row in df.iterrows():
    subsector = row["activity_name"]

    if subsector in subsector_dic.keys():
        df.at[index, "GPC_refno"] = subsector_dic[subsector]

# save the final dataframe
df.to_csv("./IEA_energy.csv")
