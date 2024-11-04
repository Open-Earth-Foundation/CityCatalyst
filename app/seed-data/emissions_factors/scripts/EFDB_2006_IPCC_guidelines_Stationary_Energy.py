import csv
import math
import os
import json
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
    """Extract value, takes median if range is given."""
    if isinstance(val, float):
        return {"value": val, "value_min": None, "value_max": None}

    # Normalize spaces and remove extra characters
    value = re.sub(r"\s+", "", val.strip())

    # Patterns
    range_pattern = r"(?P<min>[\d.]+)-(?P<max>[\d.]+)"  # Standard range
    plus_minus_pattern = r"(?P<base>[\d.]+)\+/-\s*(?P<delta>[\d.]+)"  # ± notation
    single_pattern = r"^([\d.]+)(?:\(.*\))?$"  # Single number with optional text

    # Matching
    if match := re.search(range_pattern, value):
        min_val = float(match.group("min"))
        max_val = float(match.group("max"))
        median = statistics.median([min_val, max_val])
        return {"value": median, "value_min": min_val, "value_max": max_val}

    elif match := re.search(plus_minus_pattern, value):
        base = float(match.group("base"))
        delta = float(match.group("delta"))
        min_val = base - delta
        max_val = base + delta
        return {"value": base, "value_min": min_val, "value_max": max_val}

    elif match := re.match(single_pattern, value):
        return {
            "value": float(match.group(1)),
            "value_min": None,
            "value_max": None,
        }

    # Fallback if no pattern matched
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
            "AMMONIA\n": "NH3",
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
        # Assuming all dictionaries have the same keys
        fieldnames = data[0].keys()
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)

        writer.writeheader()
        writer.writerows(data)

def convert_units(df, unit_col, value_col, from_unit, to_unit, conversion_factor):
    df.loc[df[unit_col] == from_unit, unit_col] = to_unit
    df.loc[df[unit_col] == from_unit, value_col] *= conversion_factor

# Mapping IPCC to GPC
mapping_ipcc_to_gpc = {
 '1.A - Fuel Combustion Activities\n': ['I.1.1',
                                        'I.2.1',
                                        'I.3.1',
                                        'I.4.1',
                                        'I.5.1',
                                        'I.6.1'],
  '1.A - Fuel Combustion Activities\n1.A.1.b - Petroleum Refining\n': ['I.7.1'],
  '1.A.1 - Energy Industries\n': ['I.4.4'],
  '1.A.1 - Energy Industries\n1.A.4.a - Commercial/Institutional\n1.A.4.b - Residential\n1.A.4.c - Agriculture/Forestry/Fishing/Fish Farms\n1.A.4.c.i - Stationary\n': ['I.4.4'],
  '1.A.1.a - Main Activity Electricity and Heat Production\n': ['I.4.4'],
  '1.A.1.a - Main Activity Electricity and Heat Production\n1.A.1.a.i - Electricity Generation\n1.A.1.a.ii - Combined Heat and Power Generation (CHP)\n1.A.1.a.iii - Heat Plants\n': ['I.4.4'],
  '1.A.1.a.i - Electricity Generation\n': ['I.4.4'],
  '1.A.1.a.ii - Combined Heat and Power Generation (CHP)\n': ['I.4.4'],
  '1.A.1.a.iii - Heat Plants\n': ['I.4.4'],
  '1.A.1.c.ii - Other Energy Industries\n': ['I.4.4'],
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
  '1.A.3.c - Railways\n': ['II.2.1'],
  '1.A.3.d - Water-borne Navigation\n': ['II.3.1'],
  '1.A.3.b - Road Transportation\n': ['II.1.1'],
  '1.A.4.c.ii - Off-road Vehicles and Other Machinery\n1.A.4.c.iii - Fishing (mobile combustion)\n': ['II.5.1'],
  '1.A.3.a - Civil Aviation\n': ['II.4.1'],
  '1.A.3.b - Road Transportation\n1.A.3.b.ii - Light-duty trucks\n1.A.3.b.iii - Heavy-duty trucks and buses\n': ['II.1.1'],
  '1.A.4.c.ii - Off-road Vehicles and Other Machinery\n': ['II.5.1'],
  '1.A.3.a.ii - Domestic Aviation\n': ['II.4.1'],
  '1.A.3.a.i - International Aviation (International Bunkers)\n': ['II.4.1'],
  '1.A.3.d.i - International water-borne navigation (International bunkers)\n': ['II.3.1'],
  '1.A.3.b.i - Cars\n': ['II.1.1'],
  '1.A.3.b.ii - Light-duty trucks\n': ['II.1.1'],
  '1.A.3.b.iii - Heavy-duty trucks and buses\n': ['II.1.1'],
  '1.A.3.b.iv - Motorcycles\n': ['II.1.1'],
  '1.A.3.e.ii - Off-road\n': ['II.5.1'],
  '1.A.3.a - Civil Aviation\n1.A.3.a.i - International Aviation (International Bunkers)\n1.A.3.a.ii - Domestic Aviation\n': ['II.4.1'],
  '1.A.3.b.i.1 - Passenger cars with 3-way catalysts\n': ['II.1.1'],
  '1.A.3 - Transport\n': ['II.1.1', 'II.2.1', 'II.3.1', 'II.5.1'],
  '1.A.2 - Manufacturing Industries and Construction\n1.A.4.a - Commercial/Institutional\n1.A.4.b - Residential\n1.A.4.c.ii - Off-road Vehicles and Other Machinery\n': ['II.5.1'],
  '1.A.3.b.i - Cars\n1.A.3.b.ii - Light-duty trucks\n': ['II.1.1'],
  '1.A.3.b - Road Transportation\n1.A.3.b.i - Cars\n': ['II.1.1'],
  '1.A - Fuel Combustion Activities\n1.A.3.b - Road Transportation\n': ['II.1.1'],
  '1.A.3.a - Civil Aviation\n1.A.3.a.ii - Domestic Aviation\n': ['II.4.1'],
  '1.A - Fuel Combustion Activities\n1.A.3.b - Road Transportation\n1.A.3.c - Railways\n1.A.3.d - Water-borne Navigation\n1.A.3.e.ii - Off-road\n': ['II.1.1', 'II.2.1', 'II.3.1', 'II.5.1'],
  '1.A - Fuel Combustion Activities\n1.A.3.d - Water-borne Navigation\n': ['II.3.1'],
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

# References on density values
ref_density_dic = {
    "Aqua_Calc_tool": "https://www.aqua-calc.com/page/density-table/substance/coal-coma-and-blank-anthracite-blank-solid",
    "EF_GHG_protocol": "https://ghgprotocol.org/calculation-tools-and-guidance",
    "engineering_tool_box": "https://www.engineeringtoolbox.com/gas-density-d_158.html",
}

# dictionary with density values
densities_dic = {
    'Motor Gasoline': {
        'value': 740,
        'units': 'kg/m3',
        'reference': 'EF_GHG_protocol'
    },
    'Diesel Oil': {
        'value': 840,
        'units': 'kg/m3',
        'reference': 'EF_GHG_protocol'
    },
    'Natural Gas': {
        'value': 0.7,
        'units': 'kg/m3',
        'reference': 'EF_GHG_protocol'
    },
    'Liquefied Petroleum Gases': {
        'value': 540,
        'units': 'kg/m3',
        'reference': 'EF_GHG_protocol'
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
    'Aviation Gasoline': {
        'value': 710,
        'units': 'kg/m3',
        'reference': 'EF_GHG_protocol'
    },
    'Residual Fuel Oil': {
        'value': 940,
        'units': 'kg/m3',
        'reference': 'EF_GHG_protocol'
    },
    "Anthracite": {
        "value": 1506,
        "units": "kg/m3",
        "reference": "Aqua_Calc_tool"
    },
    "Other Bituminous Coal": {
        "value": 1346,
        "units": "kg/m3",
        "reference": "Aqua_Calc_tool",
    },
    "Lignite": {
        "value": 400,
        "units": "kg/m3",
        "reference": "Aqua_Calc_tool"
    },
    "Peat": {
        "value": 400,
        "units": "kg/m3",
        "reference": "Aqua_Calc_tool"
    },
    "Crude Oil": {
        "value": 800,
        "units": "kg/m3",
        "reference": "EF_GHG_protocol"
    },
    "Other Kerosene": {
        "value": 800,
        "units": "kg/m3",
        "reference": "EF_GHG_protocol"
    },
    "Gas Oil": {
        "value": 840,
        "units": "kg/m3",
        "reference": "EF_GHG_protocol"
    },
    "Charcoal": {
        "value": 208,
        "units": "kg/m3",
        "reference": "Aqua_Calc_tool"
    },
    "Sub-Bituminous Coal": {
        "value": 1346,
        "units": "kg/m3",
        "reference": "Aqua_Calc_tool",
    },
    "Liquefied Petroleum Gases": {
        "value": 540,
        "units": "kg/m3",
        "reference": "EF_GHG_protocol",
    },
    "Coking Coal": {
        "value": 829.76,
        "units": "kg/m3",
        "reference": "Aqua_Calc_tool"
    },
    "Coke Oven Coke and Lignite Coke": {
        "value": 400,
        "units": "kg/m3",
        "reference": "Aqua_Calc_tool",
    },
    "Naphtha": {
        "value": 770,
        "units": "kg/m3",
        "reference": "EF_GHG_protocol"
    },
    "Coke Oven Gas": {
        "value": 0.545,
        "units": "kg/m3",
        "reference": "engineering_tool_box",
    },
    "Bitumen": {
        "value": 1346,
        "units": "kg/m3",
        "reference": "Aqua_Calc_tool"},
    'Bio-Alcohol': {
        'value': 789,  # Typical density for ethanol
        'units': 'kg/m3',
        'reference': 'CRC Handbook of Chemistry and Physics'
    },
    'Other Primary Solid Biomass': {
        'value': 500,  # Average density for general biomass
        'units': 'kg/m3',
        'reference': 'Biomass Energy Handbook'
    },
    'Refinery Gas': {
        'value': 0.7,
        'units': 'kg/m3',
        'reference': 'Engineering ToolBox'
    },
    'Ethane': {
        'value': 1.34,
        'units': 'kg/m3',
        'reference': 'Matmake'
    },
    'Jet Gasoline': {
        'value': 804,
        'units': 'kg/m3',
        'reference': 'The Engineering Mindset'
    },
    'Wood/Wood Waste': {
        'value': 370,  # Dry wood, averaged
        'units': 'kg/m3',
        'reference': 'Engineering ToolBox'
    },
    'Coal Tar': {
        'value': 1150,
        'units': 'kg/m3',
        'reference': 'The Engineering Mindset'
    },
    'Blast Furnace Gas': {
        'value': 1.3,
        'units': 'kg/m3',
        'reference': 'Engineering ToolBox'
    },
    'Petroleum Coke': {
        'value': 850,
        'units': 'kg/m3',
        'reference': 'US Department of Energy'
    },
    'Municipal Wastes (non-biomass fraction)': {
        'value': 400,
        'units': 'kg/m3',
        'reference': 'EPA Municipal Solid Waste Report'
    },
    'Municipal Wastes (biomass fraction)': {
        'value': 500,
        'units': 'kg/m3',
        'reference': 'EPA Municipal Solid Waste Report'
    },
    'Biodiesels': {
        'value': 880,
        'units': 'kg/m3',
        'reference': 'EF GHG Protocol'
    },
    'Landfill Gas': {
        'value': 1.2,
        'units': 'kg/m3',
        'reference': 'Engineering ToolBox'
    },
    'Other Liquid Biofuels': {
        'value': 850,  # Example value for biofuels
        'units': 'kg/m3',
        'reference': 'Biofuels Technology Handbook'
    },
    'Lubricants': {
        'value': 900,
        'units': 'kg/m3',
        'reference': 'EF GHG Protocol'
    },
    'Waste Oils': {
        'value': 920,
        'units': 'kg/m3',
        'reference': 'Engineering ToolBox'
    }
}

region_to_locode = {
    'Czechia': 'CZ',
    'Finland, Boreal region': 'FI',
    'Finland': 'FI',
    'Qatar': 'QA',
    'Republic of Korea': 'KR',
    'North Macedonia': 'MK',
    'Brazil': 'BR',
    'Experiment performed at Usina Monte Alegre (MG), Brazil': 'BR',
    'Switzerland': 'CH',
    'Norway': 'NO',
    'Ireland': 'IE',
    'Netherlands': 'NL',
    'United Kingdom of Great Britain and Northern Ireland': 'GB',
    'Austria': 'AT',
    'Denmark': 'DK',
    'Spain': 'ES',
    'Latvia': 'LV',
    'United States of America': 'US',
    'Canada': 'CA',
    'Rural area of Beijing, China': 'CN',
    'Italy': 'IT',
    'Romania': 'RO',
    'Sweden': 'SE',
    'Lithuania': 'LT',
    'Germany': 'DE',
    'Greece': 'GR',
    'Belgium': 'BE',
    'India': 'IN',
    'Only for Japan': 'JP',
    'Japan': 'JP',
    'China': 'CN',
    'Indonesia': 'ID',
    'Mexico': 'MX',
    'All over Ukraine territory within boundaries recognized by the United Nations': 'UA',
    'Australia': 'AU',
    'Malaysia': 'MY',
    'Papua New Guinea': 'PG',
    'Russian Federation': 'RU',
    'South Africa': 'ZA',
    'world': 'world',
    'Developed country': 'world',
    'Developing country and country with economy in transition': 'world',
    'West Bengal, India': 'IN',
    'Jharkhand, India': 'IN',
    'Austria, Bulgaria, Czechia, Estonia, Finland, Greece, Hungary, Italy, Latvia, Romania, Slovakia and Slovenia': [
        'AT', 'BG', 'CZ', 'EE', 'FI', 'GR', 'HU', 'IT', 'LV', 'RO', 'SK', 'SI'
    ],
    'Denmark, Ireland, Netherlands, Sweden': ['DK', 'IE', 'NL', 'SE'],
    'None': 'world',
    'EU, countries using EURO standardisation': 'EU',
    'Former Soviet Union': 'SU',
    'Poland': 'PL',
    'Czechoslovakia': ['CZ', 'SK'],
    'Global average': 'world',
    'New South Wales, Australia': 'AU-NSW',
    'Queensland, Australia': 'AU-QLD',
    'Mine C operates within the central Bowen Basin, Australia': 'AU-BOW',
    'Mine D is located in the Hunter Valley, Australia': 'AU-HV',
    'Chongqing, China': 'CN-CQ',
    'Henan, China': 'CN-HA',
    'Liaoning, China': 'CN-LN',
    'Shanxi, China': 'CN-SX',
    'Measurements were carried out on 81 degree-I mines. These mines were located in different coalfields within eastern and central India. The coalfields within these measurements were: Raniganj, Jharia, East-Bokaro, Mand-Raigarh, Pranhita Godavari, Sohagpur, Ib Valley, Pench-Kannan, Bisrampur, Johilla and Hasdeo, India.': 'IN'
}

extraction_fugitive_dic = {
    'CH4 emission factor for undeground mines in Jharia coalfield': 'underground mines',
    'CH4 emission factor for undeground mines in Raniganj coalfield': 'underground mines',
    'CO2 emission factor for refinery gas combustion': 'refinery gas combustion',
    'CO2 emission factor for undeground mines in Jharia coalfield': 'underground mines',
    'CO2 emission factor for undeground mines in Raniganj coalfield': 'underground mines',
    'Carbon dioxide emission factor for fugitive emissions from gas operations - Gas Transmission & Storage (transmission, venting)': 'Gas Transmission & Storage',
    'Carbon dioxide emission factor for fugitive emissions from gas operations - Gas processing (Default weighted total for flaring)': 'Gas processing - flaring',
    'Carbon dioxide emission factor for fugitive emissions from gas operations - Gas processing (deep-cut extraction plants, flaring)': 'Gas processing - flaring',
    'Carbon dioxide emission factor for fugitive emissions from gas operations - Gas processing (sour gas plants, flaring)': 'Gas processing - flaring',
    'Carbon dioxide emission factor for fugitive emissions from gas operations - Gas processing (sour gas plants, raw CO2 venting)': 'Gas processing - venting',
    'Carbon dioxide emission factor for fugitive emissions from gas operations - Gas processing (sweet gas plants, flaring)': 'Gas processing - flaring',
    'Carbon dioxide emission factor for fugitive emissions from gas operations - Gas production (flaring)': 'Gas production - flaring',
    'Carbon dioxide emission factor for fugitive emissions from oil and gas operations - Well drilling (flaring and venting)': 'Well drilling - flaring and venting',
    'Carbon dioxide emission factor for fugitive emissions from oil and gas operations - Well servicing (flaring and venting)': 'Well servicing - flaring and venting',
    'Carbon dioxide emission factor for fugitive emissions from oil and gas operations - Well testing (flaring and venting)': 'Well testing - flaring and venting',
    'Carbon dioxide emission factor for fugitive emissions from oil operations - Oil production (Default weighted total for venting)': 'Oil production - venting',
    'Carbon dioxide emission factor for fugitive emissions from oil operations - Oil production (conventional oil, flaring)': 'Oil production - flaring',
    'Carbon dioxide emission factor for fugitive emissions from oil operations - Oil production (conventional oil, venting)': 'Oil production - venting',
    'Carbon dioxide emission factor for fugitive emissions from oil operations - Oil production (heavy oil/cold bitumen, flaring)': 'Oil production - flaring',
    'Carbon dioxide emission factor for fugitive emissions from oil operations - Oil production (heavy oil/cold bitumen, venting)': 'Oil production - venting',
    'Carbon dioxide emission factor for fugitive emissions from oil operations - Oil production (thermal oil production, flaring)': 'Oil production - flaring',
    'Carbon dioxide emission factor for fugitive emissions from oil operations - Oil production (thermal oil production, venting)': 'Oil production - venting',
    'Carbon dioxide emission factor for fugitive emissions from oil operations - Oil transport (tanker trucks and rail cars, venting)': 'Oil transport - venting',
    'EF of Surfacemining': 'surface mining',
    'EF of Underground mines': 'underground mines',
    'Methane emission factor based on data for Chinese underground mines.': 'underground mines',
    'Methane emission factor for fugitive emissions from gas operations - Gas Transmission & Storage (transmission, venting)': 'Gas Transmission & Storage - venting',
    'Methane emission factor for fugitive emissions from gas operations - Gas processing (Default weighted total for flaring)': 'Gas processing - flaring',
    'Methane emission factor for fugitive emissions from gas operations - Gas processing (deep-cut extraction plants, flaring)': 'Gas processing - flaring',
    'Methane emission factor for fugitive emissions from gas operations - Gas processing (sour gas plants, flaring)': 'Gas processing - flaring',
    'Methane emission factor for fugitive emissions from gas operations - Gas processing (sweet gas plants, flaring)': 'Gas processing - flaring',
    'Methane emission factor for fugitive emissions from gas operations - Gas production (flaring)': 'Gas production - flaring',
    'Methane emission factor for fugitive emissions from oil and gas operations - Well drilling (flaring and venting)': 'Well drilling - flaring and venting',
    'Methane emission factor for fugitive emissions from oil and gas operations - Well servicing (flaring and venting)': 'Well servicing - flaring and venting',
    'Methane emission factor for fugitive emissions from oil and gas operations - Well testing (flaring and venting)': 'Well testing - flaring and venting',
    'Methane emission factor for fugitive emissions from oil operations - Oil production (Default weighted total for flaring)': 'Oil production - flaring',
    'Methane emission factor for fugitive emissions from oil operations - Oil production (Default weighted total for venting)': 'Oil production - venting',
    'Methane emission factor for fugitive emissions from oil operations - Oil production (conventional oil, flaring)': 'Oil production - flaring',
    'Methane emission factor for fugitive emissions from oil operations - Oil production (conventional oil, venting)': 'Oil production - venting',
    'Methane emission factor for fugitive emissions from oil operations - Oil production (heavy oil/cold bitumen, flaring)': 'Oil production - flaring',
    'Methane emission factor for fugitive emissions from oil operations - Oil production (heavy oil/cold bitumen, venting)': 'Oil production - venting',
    'Methane emission factor for fugitive emissions from oil operations - Oil production (thermal oil production, flaring)': 'Oil production - flaring',
    'Methane emission factor for fugitive emissions from oil operations - Oil production (thermal oil production, venting)': 'Oil production - venting',
    'Methane emission factor for fugitive emissions from oil operations - Oil transport (tanker trucks and rail cars, venting)': 'Oil transport - venting',
    'Nitrous oxide emission factor for fugitive emissions from gas operations - Gas processing (Default weighted total for Raw CO2 venting)': 'Gas processing - venting',
    'Nitrous oxide emission factor for fugitive emissions from gas operations - Gas processing (Default weighted total for flaring)': 'Gas processing - flaring',
    'Nitrous oxide emission factor for fugitive emissions from gas operations - Gas processing (deep-cut extraction plants, flaring)': 'Gas processing - flaring',
    'Nitrous oxide emission factor for fugitive emissions from gas operations - Gas processing (sour gas plants, flaring)': 'Gas processing - flaring',
    'Nitrous oxide emission factor for fugitive emissions from gas operations - Gas processing (sweet gas plants, flaring)': 'Gas processing - flaring',
    'Nitrous oxide emission factor for fugitive emissions from gas operations - Gas production (flaring)': 'Gas production - flaring',
    'Nitrous oxide emission factor for fugitive emissions from oil and gas operations - Well testing (flaring and venting)': 'Well testing - flaring and venting',
    'Nitrous oxide emission factor for fugitive emissions from oil operations - Oil production (Default weighted total for flaring)': 'Oil production - flaring',
    'Nitrous oxide emission factor for fugitive emissions from oil operations - Oil production (conventional oil, flaring)': 'Oil production - flaring',
    'Nitrous oxide emission factor for fugitive emissions from oil operations - Oil production (heavy oil/cold bitumen, flaring)': 'Oil production - flaring',
    'Nitrous oxide emission factor for fugitive emissions from oil operations - Oil production (thermal oil production, flaring)': 'Oil production - flaring',
    'Tier 1 CH4 emission factor for surface mining': 'surface mining',
    'Tier 1 CH4 emission factor for surface post-mining': 'surface post-mining',
    'Tier 1 CH4 emission factor for undeground mining': 'undeground mining',
    'Tier 1 CH4 emission factor for undeground post-mining': 'undeground post-mining',
    'Tier 1 CO2 Emission Factors for underground mining': 'underground mining',
    'Tier 1 CO2 emission factor for surface mining': 'surface mining',
    'Estimated Underground Emission Factors for Selected Countries': 'underground mines',
    'Tier 1 Default Emission Factor for Underground Mining': 'underground mines',
    'Tier 1 Default Emission Factor for Post-Mining Emissions from Underground Mines': 'underground mines',
    'Tier 1 Default Emission Factor for Surface Mining': 'surface mining',
    'Emission factor fof CH4 emissions from underground coal mining nad handling (mining)': 'undeground post-mining',
    'Emission factor fof CH4 emissions from underground coal mining nad handling (post-mining)': 'undeground post-mining',
    'Emission factor fof CO2 emissions from underground coal mining nad handling (mining)': 'underground mining',
    'Emission factor fof CO2 emissions from underground coal mining nad handling (post-mining)': 'undeground post-mining',
    'Ventilation emissions': 'Oil production - venting',
    'Fugitive emissions from underground mining activities': 'underground mines',
    'Carbon dioxideemission factor for fugitive emissions from oil operations - Oil production (Default weighted total for flaring)': 'Oil production - flaring',
    'Fugitive emissions from underground mining activities Average (weighted based on coal production)': 'underground mines',
    'Fugitive methane emissions from underground coal mining activities from Degree-I mines. Average (weighted based on coal production)': 'underground mines',
    'Fugitive methane emissions from underground coal mining activities from Degree-II mines. Average (weighted based on coal production)': 'underground mines',
    'Fugitive methane emissions from underground coal mining activities from Degree-III mines. Average (weighted based on coal production)': 'underground mines',
}

fuel_to_fuel_ids_mapping = {
    'Anthracite': 'fuel-type-anthracite',
    'Other Bituminous Coal': 'fuel-type-other-bituminous-coal',
    'Lignite': 'fuel-type-lignite',
    'Peat': 'fuel-type-peat',
    'Crude Oil': 'fuel-type-crude-oil',
    'Motor Gasoline': 'fuel-type-gasoline',
    'Other Kerosene': 'fuel-type-other-kerosene',
    'Gas Oil': 'fuel-type-natural-gas-oil',
    'Diesel Oil': 'fuel-type-diesel-oil',
    'Residual Fuel Oil': 'fuel-type-residual-fuel-oil',
    'Natural Gas': 'fuel-type-natural-gas',
    'Other Primary Solid Biomass': 'fuel-type-other-primary-solid-biomass',
    'Wood/Wood Waste': 'fuel-type-wood-wood-waste',
    'Charcoal': 'fuel-type-charcoal',
    'Sub-Bituminous Coal': 'fuel-type-sub-bituminous-coal',
    'Refinery Gas': 'fuel-type-refinery-gas',
    'Coking Coal': 'fuel-type-coking-coal',
    'Liquefied Petroleum Gases': 'fuel-type-liquefied-petroleum-gases',
    'Coke Oven Coke and Lignite Coke': 'fuel-type-coke-oven-coke-lignite-coke',
    'Industrial Wastes': 'fuel-type-industrial-wastes',
    'Waste Oils': 'fuel-type-waste-oils',
    'Naphtha': 'fuel-type-naphtha',
    'Municipal Wastes (non-biomass fraction)': 'fuel-type-municipal-wastes',
    'Aviation Gasoline': 'fuel-type-aviation-gasoline',
    'Jet Fuel': 'fuel-type-jet-gasoline',
    'Jet Kerosene': 'fuel-type-jet-kerosene',
    'Compressed Natural Gas (CNG)': 'fuel-type-cng',
    'Kerosene': 'fuel-type-kerosene',
    'E85 Ethanol': 'fuel-type-e85-ethanol',
    'B20 Biodiesel': 'fuel-type-b20-biodiesel',
    'Natural Gas': 'fuel-type-natural-gas',
    'Ethanol': 'fuel-type-ethanol',
    'Biodiesel': 'fuel-type-biodiesel',
    'Bioethanol': 'fuel-type-bioethanol',
    'Diesel': 'fuel-type-diesel',
    'Residual Fuel Oil': 'fuel-type-residual-fuel-oil',
    'Liquefied Petroleum Gas (LPG)': 'fuel-type-lpg',
    'Petrol': 'fuel-type-petrol',
    'CNG': 'fuel-type-cng',
    'LPG': 'fuel-type-lpg',
    'Bio-Alcohol': 'fuel-type-bio-alcohol',
    'Orimulsion': 'fuel-type-orimulsion',
    'Natural Gas Liquids\n(NGLs)': 'fuel-type-natural-gas-liquids',
    'Shale Oil': 'fuel-type-shale-oil',
    'Ethane': 'fuel-type-ethane',
    'Bitumen': 'fuel-type-bitumen',
    'Petroleum Coke': 'fuel-type-petroleum-coke',
    'Coke Oven Gas': 'fuel-type-coke-oven-gas',
    'Blast Furnace Gas': 'fuel-type-blast-furnace-gas',
    'Other Liquid Biofuels': 'fuel-type-biofuel',
    'Other Biogas': 'fuel-type-biogas',
    'Jet Gasoline': 'fuel-type-jet-gasoline',
    'Brown Coal Briquettes': 'fuel-type-brown-coal-briquettes',
    'Gas Coke': 'fuel-type-gas-coke',
    'Coal Tar': 'fuel-type-coal-tar',
    'Oxygen Steel Furnace Gas': 'fuel-type-oxygen-steel-furnace-gas',
    'Biogasoline': 'fuel-type-bioethanol',
    'Biodiesels': 'fuel-type-biodiesel',
    'Landfill Gas': 'fuel-type-landfill-gas',
    'Sludge Gas': 'fuel-type-sludge-gas',
    'Municipal Wastes (biomass fraction)': 'fuel-type-municipal-waste',
    'Fuel mixtures (fossil and biomass)': 'fuel-type-fuel-mixtures',
    'Lubricants': 'fuel-type-lubricants'
}

fuggitive_activity_type_mapping = {
    'underground mines': 'type-coal-mining-and-handling-underground-mines',
    'surface mining': 'type-surface-mines',
    'refinery gas combustion': 'type-solid-fuel-transformation',
    'underground post-mining': 'type-coal-mining-and-handling-underground-mines-mining-post-mining-seam-gas-emissions',
    'surface post-mining': 'type-surface-mines-post-mining-seam-gas-emissions',
    'Well drilling - flaring and venting': 'type-extraction',
    'Well testing - flaring and venting': 'type-extraction',
    'Well servicing - flaring and venting': 'type-extraction',
    'Gas production - flaring': 'type-extraction',
    'Gas processing - flaring': 'type-processing',
    'Gas processing - venting': 'type-processing',
    'Gas Transmission & Storage - venting': 'type-storage',
    'Gas Transmission & Storage': 'type-storage',
    'Oil production - venting': 'type-extraction',
    'Oil production - flaring': 'type-extraction',
    'Oil transport - venting': 'type-distribution'
}

mapping_parameters = {
    'The value presented is for a mining depth of up to 200 m': 'mining depth of up to 200 m',
    'The value presented is for a mining depth of between 200 and 400 m.': 'mining depth of between 200 and 400 m',
    'The value presented is for a mining depth of above 400 m.': 'mining depth of above 400 m',
    'Average mining depths: &lt; 200 m (less than 200 m)': 'mining depth of less than 200 m',
    'Average mining depths: &gt; 400 m (greater than 400 m)': 'mining depth of above 400 m',
    'Average mining depths: 200 - 400 m': 'mining depth of between 200 and 400 m',
    'Average mining depths: &gt; 400 m (over 400 m)': 'mining depth of above 400 m',
    'Average overburden depths: less than 25 m': 'overburden depth of less than 25 m',
    'Average overburden depths: over 50 m': 'overburden depth of over 50 m',
    'Average overburden depths: 25 - 50 m': 'overburden depth of between 25 and 50 m',
    'Quite shallow mines (depth of between 140 to 60 m below the surface);      Coal type: Bituminous and Anthracite (However, the tonnage of anthracite mined is less than 1% of the bituminous caol production, hence the emissions from anthracite may be ignored.)': 'mining depth of between 60 and 140 m',
    'Average depth: 500 m. Mine A in year 2005 as reported by SU et al, 2008. Coal type: coking coal.': 'mining depth of 500 m',
    'Maximum depth: ~400 m. Mine B in year 2005 as reported by SU et al, 2008. Coal type: coking coal.': 'mining depth of 400 m',
    'Mine C in year 2005 as reported by SU et al, 2008. Coal type: coking coal & thermal coal.': 'mining depth of 200 m',
    'Average depth: 200 m. Mine D in year 2005 as reported by SU et al, 2008.  Coal type: coking coal & thermal coal.': 'mining depth of 200 m',
    'Average depth: > 200m. Mining group A in year 2007 as reported by SU et al, 2011, covers 142 km2, includes 9-12 coal-bearing seams and is divided in 9 mining fields. Coal type: anthracite.': 'mining depth of above 200 m',
    'Mining group B in year 2008 as reported by SU et al, 2011. Coal type: bituminous coal': 'mining group B',
    'Mining group C in year 2008 as reported by SU et al, 2011. Coal type: sub-bituminous coal': 'mining group C',
    'Mining group E in year 2007 as reported by SU et al, 2011. Coal type: anthracite.': 'mining group E',
    '"Degree-I" underground seam refers to a coal seams in which the percentage of methane in the general body of air does not exceed 0.1 and the rate of emission of methane does not exceed one cubic meter per tonne of coal produced. (Reg 2(12A), Coal Mines Regulations, 1957, DGMS, India)': 'Degree-I'
}

activity_type_mapping = {
    'underground mines': 'type-coal-mining-and-handling-underground-mines',
    'surface mining': 'type-surface-mines',
    'refinery gas combustion': 'type-solid-fuel-transformation',
    'underground post-mining': 'type-coal-mining-and-handling-underground-mines-mining-post-mining-seam-gas-emissions',
    'surface post-mining': 'type-surface-mines-post-mining-seam-gas-emissions',
    'Well drilling - flaring and venting': 'type-extraction',
    'Well testing - flaring and venting': 'type-extraction',
    'Well servicing - flaring and venting': 'type-extraction',
    'Gas production - flaring': 'type-extraction',
    'Gas processing - flaring': 'type-processing',
    'Gas processing - venting': 'type-processing',
    'Gas Transmission & Storage - venting': 'type-storage',
    'Gas Transmission & Storage': 'type-storage',
    'Oil production - venting': 'type-extraction',
    'Oil production - flaring': 'type-extraction',
    'Oil transport - venting': 'type-distribution'
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
    input_fl = "../data_raw/EFDB_2006_IPCC_guidelines/"
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
    datasource_data["datasource_id"] = uuid_generate_v3(
        name=datasource_data.get("dataset_name")
    )

    write_dic_to_csv(output_dir, "DataSource", datasource_data)

    # =================================================================
    # Methodology
    # =================================================================
    methodologies = [
        "fugitive-emissions-coal",
        "fugitive-emissions-oil-gas",
        "sampling-scaled-data",
        "fuel-combustion-consumption",
        "modeled-data",
        "movement-driver",
        "fuel-sales",
    ]

    methodology_data_list = []

    for methodology in methodologies:
        methodology_data = {
            "methodology_id": uuid_generate_v3(methodology),
            "methodology": methodology,
            "methodology_url": "",  # Add the URL if needed
            "datasource_id": datasource_data.get("datasource_id")
        }
        methodology_data_list.append(methodology_data)

    # Write data to CSV
    write_dic_to_csv(output_dir, "Methodology", methodology_data_list)


    # =================================================================
    # EmissionsFactor
    # =================================================================
    # read raw dataset
    df = pd.read_excel(f"{input_fl}/EFDB_output.xlsx")

    # read NCV data
    ncv = pd.read_csv(f"{input_fl}/clean_NCV.csv")

    # drop extra columns
    ncv.drop(columns=['EF ID', 'IPCC 2006 Source/Sink Category', 'Gas','Description', 'Region / Regional Conditions','Technical Reference', 'calculation_type'], inplace=True)
    ncv.rename(columns={'Fuel 2006': 'fuel', 'Value': 'value', 'Unit': 'units'}, inplace=True)

    # drop extra columns
    df = df.drop(
        columns=[
            "IPCC 1996 Source/Sink Category",
            "Fuel 1996",
            "C pool",
            "Type of parameter",
            "Abatement / Control Technologies",
            "IPCC Worksheet",
            "Source of data",
            "Data provider",
        ]
    )

    # extract only EF values for Stationary Energy using IPCC refno "1.A" and "1.B"
    filt_cat = df["IPCC 2006 Source/Sink Category"].str.contains(
        r"1\.A", case=True, na=False
    )
    df_filt = df.loc[filt_cat].reset_index(drop=True)

    # extract only EF values
    filt_desc = df_filt["Description"].str.contains(
        "EF | emission factor", case=False, na=False
    )
    df_filt = df_filt.loc[filt_desc].reset_index(drop=True)

    # delete rows with NaN values
    df_filt = df_filt[~df_filt['Value'].isna()]

    # clean up the df
    output_list = []

    for _, row in df_filt.iterrows():
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
                "Technologies / Practices": "practices",
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

    EF_df = EF_df[~EF_df['value'].isna()]

    # filter only for the interested gases
    gas = ["CO2", "CH4", "N2O"]
    EF_df = EF_df[EF_df["gas"].isin(gas)]

    # list of units to exclude
    exclude_units = ['MMT C / QBtu [HHV]', 'g CH4/10^6 BTU', 'parts per million', 'Kt/Mth', 'kg/LTO']

    # Filter the DataFrame to exclude rows with these values in the specified column
    EF_df = EF_df[~EF_df['units'].isin(exclude_units)]

    # Define the conversions and their respective factors
    conversions = [
        ('tC/TJ', 't/TJ', 44/12),
        ('g/km', 'kg/km', 0.001),
        ('g/kg fuel', 'kg/kg', 0.001),
        ('g/MJ', 'kg/TJ', 1000),
        ('KG/TJ','kg/TJ', 1),
        ('g/kgl', 'kg/L', 0.001),
        ('kg/t fuel', 'kg/t', 1),
        ('tonne-C/Terajoule', 't/TJ', 44/12),
        ('g/GJ', 'kg/TJ', 1000),
        ('t CO2/TJ', 't/TJ', 1),
        ('tonne CO2/tonne coke produced', 't/t', 1),
        ('g CH4/tonne coke produced', 'kg/t', 0.001),
        ('Mg/TJ', 'kg/TJ', 1000),
        ('g CH4/GJ', 'kg/TJ', 1000),
        ('tonne/1000m3', 't/m3', 0.001),
        ('gC/GJ Gross', 'kg/TJ', 1000*44/12),
        ('kg C/t', 'kg/t', 44/12),
        ('tonne/tonne waste', 't/t', 1),
        ('kg/tonne', 'kg/t', 1),
        ('kt/Mt', 't/t', 0.001),
        ('g/litre', 'kg/L', 0.001),
        ('kg/GJ', 'kg/TJ', 1000),
        ('mg/MJ', 'kg/TJ', 1),
        ('CO2 kg/GJ', 'kg/TJ', 1e6),
        ('ng/J of Fuel', 'kg/TJ', 1),
        ('kg/tonnes product', 'kg/t', 1),
        ('g/tonnes fuel', 'kg/t', 0.001),
        ('g/tonne', 'kg/t', 0.001),
        ('g/kg-fuel', 'kg/kg', 0.001),
        ('mg/km', 'kg/km', 1e-6),
        ('mg/kWh', 'kg/kWh', 1e-6),
        ('gC/MJ', 'kg/TJ', 1000*44/12),
        ('kg CO2/GJ', 'kg/TJ', 1000),
        ('kg/kWh', 'kg/TJ', 1/0.0000036)
    ]

    # Apply the conversions
    for from_unit, to_unit, conversion_factor in conversions:
        convert_units(EF_df, "units", "value", from_unit, to_unit, conversion_factor)

    conversions = [
        ('t/TJ', 'kg/TJ', 1000),
        ('t/t', 'kg/kg', 1),
        ('kg/t', 'kg/kg', 0.001),
        ('t/m3', 'kg/m3', 1000),
        ('kg/L', 'kg/m3', 1000),
        ('kg/gal', 'kg/m3',264.172)
    ]
    # Apply the conversions
    for from_unit, to_unit, conversion_factor in conversions:
        convert_units(EF_df, "units", "value", from_unit, to_unit, conversion_factor)

    EF_df_tmp = EF_df.copy()
    EF_df_tmp = EF_df_tmp.merge(ncv, on=["fuel"], how="left")

    for index, row in EF_df_tmp.iterrows():
        fuel = row["fuel"]
        if fuel in densities_dic.keys():
            EF_df_tmp.at[index, "density_value"] = densities_dic[fuel]["value"]
            EF_df_tmp.at[index, "density_units"] = densities_dic[fuel]["units"]

    EF_df_tmp.dropna(subset=["density_value", "value_y"], inplace=True)

    # Conversion from kg/TJ to kg/m3
    EF_df_tmp1 = EF_df_tmp.copy()
    EF_df_tmp1["value"] = EF_df_tmp1["value_x"] * EF_df_tmp1["density_value"] * EF_df_tmp1["value_y"]
    EF_df_tmp1['units'] = 'kg/m3'

    # Conversion from kg/kg to kg/m3
    EF_df_tmp = EF_df_tmp[EF_df_tmp['units_x']=='kg/kg']
    EF_df_tmp['value'] = EF_df_tmp['value_x'] * EF_df_tmp['density_value']
    EF_df_tmp['units'] = 'kg/m3'

    # delete extra columns
    EF_df_tmp.drop(columns=['units_x', 'value_x', 'value_y','units_y', 'density_value', 'density_units', 'value_min', 'value_max'], inplace=True)
    EF_df_tmp1.drop(columns=['units_x', 'value_x', 'value_y','units_y', 'density_value', 'density_units', 'value_min', 'value_max'], inplace=True)
    EF_df.drop(columns=['value_min', 'value_max'], inplace=True)

    df_v2 = pd.concat([EF_df, EF_df_tmp, EF_df_tmp1], ignore_index=True)

    # map the fuel type to fuel ids
    df_v2['fuel_type_id'] = df_v2['fuel'].map(fuel_to_fuel_ids_mapping)
    df_v2.dropna(subset=['fuel_type_id'], inplace=True)

    df_v2['user_type'] = None

    # assign "GPC_refno" using the mapping dic
    df_v2["gpc_refno"] = df_v2["ipcc_2006_category"].map(mapping_ipcc_to_gpc)

    # remove EFs that don't apply
    df_v2 = df_v2.dropna(subset=["gpc_refno"]).reset_index(drop=True)

    # make a row for each GPC_refno
    df_v2 = df_v2.explode("gpc_refno", ignore_index=True)

    # apply the mapping dic to the "methodology_name" column based on the "gpc_refno"
    stationary_energy_no = ["I.1.1", "I.2.1", "I.3.1", "I.4.1", "I.4.4", "I.5.1", "I.6.1"]
    stationary_energy_meth = ['fuel_combustion_consumption', 'sampling_scaled_data', 'modeled_data']

    transportation_no = ["II.1.1", "II.2.1", "II.3.1", "II.4.1", "II.5.1"]
    units = ['kg/TJ', 'kg/m3', 'kg/kg']

    df_v2['methodology_name'] = df_v2.apply(
        lambda row: (
            stationary_energy_meth if row['gpc_refno'] in stationary_energy_no
            else 'fuel_sales' if row['gpc_refno'] in transportation_no and row['units'] in units
            else 'movement_driver' if row['gpc_refno'] in transportation_no and row['units'] in ['kg/km']
            else None
        ),
        axis=1
    )

    # Create a 'metadata' column with dictionaries
    df_v2["metadata"] = df_v2.apply(
        lambda row: {
            "fuel_type": row["fuel_type_id"], "user_type": row["user_type"]
        },
        axis=1,
    )

    df_v2["metadata"] = df_v2["metadata"].apply(json.dumps)

    ## ------------------------------------------
    # Emissions for subsectors I.7 and I.8
    ## ------------------------------------------
    # extract only EF values for Stationary Energy using IPCC refno "1.A" and "1.B"
    filt_cat = df["IPCC 2006 Source/Sink Category"].str.contains(
        r"1\.B", case=True, na=False
    )
    df_filt = df.loc[filt_cat].reset_index(drop=True)

    output_list = []

    for _, row in df_filt.iterrows():
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
                "Technologies / Practices": "practices",
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

    # filter only for the interested gases
    gas = ["CO2", "CH4", "N2O"]
    EF_df = EF_df[EF_df["gas"].isin(gas)]

    # list of units to exclude
    exclude_units = ['No dimension', 'kg/day', 'Gg/yr per producing or capable well', 'Kt/Mth', 'Mg/well completion flowback event', 'Mg/unloading event', 'scf/well', 'scf/event', 'kg CO2e/well, GWP=24', 'Gg per well drilled', '%', 'million m^3/mine/year', ]

    # Filter the DataFrame to exclude rows with these values in the specified column
    EF_df = EF_df[~EF_df['units'].isin(exclude_units)]

    # Define the conversions and their respective factors
    conversions = [
        ('Gg per 10^3 m^3 total oil production', 'kg/m3', 1e-3),
        ('Gg per 10^6 m^3 gas production', 'kg/m3', 1),
        ('Gg per 10^6 m^3 raw gas feed', 'kg/m3', 1),
        ('Gg per 10^6 m^3 of marketable gas', 'kg/m3', 1),
        ('Gg per 10^3 m^3 conventional oil production', 'kg/m3', 1e-3),
        ('Gg per 10^3 m^3 heavy oil production', 'kg/m3', 1e-3),
        ('Gg per 10^3 m^3 thermal bitumen production', 'kg/m3', 1e-3),
        ('Gg per 10^3 m^3 oil transported by pipeline', 'kg/m3', 1e-3),
        ('m3 CH4/tonne of coal produced', 'm3/t', 1),
        ('m3/tonne of coal', 'm3/t', 1),
        ('KG/TJ', 'kg/TJ', 1),
        ('m3/tonne', 'm3/t', 1),
        ('kg/PJ of oil produced', 'kg/TJ', 1e-3),
        ('kg/PJ of gas produced', 'kg/TJ', 1e-3),
        ('kg/PJ of oil and gas produced', 'kg/TJ', 1e-3),
        ('kg/PJ of oil refined', 'kg/TJ', 1e-3),
        ('kg/PJ of gas consumed', 'kg/TJ', 1e-3),
        ('kg/PJ oil tankered', 'kg/TJ', 1e-3),
        ('kg/PJ of gas processed', 'kg/TJ', 1e-3),
        ('m^3/tonne of coal production', 'm3/t', 1),
        ('m3/tonne of coal', 'm3/t', 1),
        ('m3/tonnes of product', 'm3/t', 1),
        ('Gg/kMWh electricity produced', 'kg/TJ', 1),
        ('kg/TJ elec. generation and heat', 'kg/TJ', 1),
        ('Gg/m3', 'kg/m3', 1)
    ]
    # Apply the conversions
    for from_unit, to_unit, conversion_factor in conversions:
        convert_units(EF_df, "units", "value", from_unit, to_unit, conversion_factor)

    # density values for each ghg gas
    gas_densities = {
        'CO2': 1.98,
        'CH4': 0.717,
        'N2O': 1.98
    }

    # apply the gas densities to the density column
    EF_df.loc[EF_df['units'] == 'm3/t', 'density_value'] = EF_df['gas'].map(gas_densities)

    # apply the conversion and change the units
    EF_df.loc[EF_df['units'] == 'm3/t', 'value'] = EF_df['value'] * EF_df['density_value']

    # assign the density units
    EF_df.loc[EF_df['units'] == 'm3/t', 'density_units'] = 'kg/m3'

    # change the original units
    EF_df.loc[EF_df['units'] == 'm3/t', 'units'] = 'kg/t'

    conversions = [
        ('kg/t', 'kg/kg', 0.001)
    ]

    # Apply the conversions
    for from_unit, to_unit, conversion_factor in conversions:
        convert_units(EF_df, "units", "value", from_unit, to_unit, conversion_factor)

    # drop extra columns
    EF_df.drop(columns=['density_value', 'value_min', 'value_max', 'density_units'], inplace=True)

    # map the description to the fugitive activity type
    EF_df['extra'] = EF_df['description'].map(extraction_fugitive_dic)
    EF_df.dropna(subset=["extra"], inplace=True)

    # map the extra column to the activity type
    EF_df['parameters'] = EF_df['parameters'].map(mapping_parameters)

    EF_df['extra'] = EF_df['extra'].replace({
        'undeground mining': 'underground mines',
        'underground mining': 'underground mines',
        'undeground post-mining': 'underground post-mining'
        })

    # map the extra column to the activity type
    EF_df['activity_type_id'] = EF_df['extra'].map(activity_type_mapping)

    # Create a 'metadata' column based on density values, density units, NCV values and NCV units
    EF_df["metadata"] = EF_df.apply(
        lambda row: {
            "activity_name_1": row['activity_type_id'] if not pd.isna(row['activity_type_id']) else None,
            "activity_description_1": row['extra'] if not pd.isna(row['extra']) else None,
            "activity_description_2": row['parameters'] if not pd.isna(row['parameters']) else None,
        },
        axis=1,
    )

    EF_df["metadata"] = EF_df["metadata"].apply(json.dumps)

    # assign "GPC_refno" using the mapping dic
    EF_df["gpc_refno"] = EF_df["ipcc_2006_category"].map(mapping_ipcc_to_gpc)

    # remove EFs that don't apply
    EF_df = EF_df.dropna(subset=["gpc_refno"]).reset_index(drop=True)

    # make a row for each GPC_refno
    EF_df = EF_df.explode("gpc_refno", ignore_index=True)

    df_final = pd.concat([df_v2, EF_df], ignore_index=True)

    df_final.loc[df_final['gpc_refno'] == 'I.8.1', 'methodology_name'] = 'fugitive-emissions-oil-gas'
    df_final.loc[df_final['gpc_refno'] == 'I.7.1', 'methodology_name'] = 'fugitive-emissions-coal'

    # extra mappings
    # assign "actor_id" using the region_to_locode dic
    df_final['actor_id'] = df_final['region'].map(region_to_locode)

    # Replace None values, which means "generic EF", with "world"
    df_final['region'] = df_final['region'].fillna('world')
    df_final['actor_id'] = df_final['actor_id'].fillna('world')

    # make a row for each actor_id
    df_final = df_final.explode("actor_id", ignore_index=True)

    # make a row for each methodology_name
    df_final = df_final.explode("methodology_name", ignore_index=True)

    # year column
    df_final["year"] = ""

    # drop extra columns
    df_final = df_final.drop(
        columns=[
            "EF ID",
            "ipcc_2006_category",
            "fuel",
            "description",
            "practices",
            "parameters",
            "properties",
            "equation",
            'fuel_type_id',
            'user_type',
            'extra',
            'activity_type_id'
        ]
    )

    # delete a outlier value
    max_value = df_final[df_final['units'] == 'kg/m3']['value'].max()
    df_final = df_final[~((df_final['units'] == 'kg/m3') & (df_final['value'] == max_value))]

    df_final.rename(columns={'value': 'emissions_per_activity', 'gpc_refno': 'gpc_reference_number'}, inplace=True)

    df_final['reference'] = df_final['reference'].fillna('undefined')

    # methodology_name
    df_final['methodology_name'] = df_final['methodology_name'].str.replace('_', '-')

    df_final['methodology_id'] = df_final['methodology_name'].apply(uuid_generate_v3)

    df_final["id"] = df_final.apply(lambda row: uuid_generate_v4(), axis=1)

    df_final.to_csv(
        f"{output_dir}/EmissionsFactor.csv", index=False
    )

    # =================================================================
    # DataSourceEmissionsFactor
    # =================================================================
    datasource_emissions_factor_data = [
        {
            "datasource_id": datasource_data.get("datasource_id"),
            "emissions_factor_id": id,
        }
        for id in df_final["id"]
    ]

    write_dic_to_csv(
        output_dir, "DataSourceEmissionsFactor", datasource_emissions_factor_data
    )
