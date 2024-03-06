import csv
import math
import os
import pandas as pd
from pathlib import Path
import re
import statistics
from utils import (
    make_dir,
    write_dic_to_csv,
    uuid_generate_v4,
    get_filename,
    set_seed,
    string_to_hash,
)

def separate_min_max_median(val):
    """extract value, takes median if range is given"""
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


def strip_string(value):
    """strip whitespace from string"""
    if isinstance(value, str):
        return value.strip()
    return value


def gas_name_to_formula(value, replace_dict=None):
    """replace gas name with formula"""
    if replace_dict is None:
        replace_dict = {
            "CARBON DIOXIDE": "CO2",
            "METHANE": "CH4",
            "NITROUS OXIDE": "N2O",
            "Sulphur Hexafluoride": "SF6",
            "CARBON MONOXIDE": "CO",
            "Nitrogen Trifluoride": "NF3",
            "AMMONIA": "NH3"
        }
    else:
        replace_dict = {key.upper(): value for key, value in replace_dict.items()}

    new_value = replace_dict.get(value.upper(), None)

    if new_value:
        return new_value

    return value


def create_ipcc_to_gpc_mapping():
    """maps IPCC 2006 sectors to GPC reference numbers"""
    mapping = {
        '1.A - Fuel Combustion Activities':['I.1.1', 'I.2.1', 'I.3.1', 'I.4.1', 'I.5.1', 'I.6.1'],
        '1.A - Fuel Combustion Activities\n1.A.1.b - Petroleum Refining':['I.7.1'],
        '1.A - Fuel Combustion Activities\n1.A.3.b - Road Transportation':['II.1.1', 'II.5.1'],
        '1.A - Fuel Combustion Activities\n1.A.3.b - Road Transportation\n1.A.3.c - Railways\n1.A.3.d - Water-borne Navigation\n1.A.3.e.ii - Off-road':['II.1.1', 'II.2.1', 'II.3.1', 'II.5.1'],
        '1.A - Fuel Combustion Activities\n1.A.3.d - Water-borne Navigation':['II.3.1'],
        '1.A.1 - Energy Industries':['I.4.1', 'I.4.4'],
        '1.A.1 - Energy Industries\n1.A.1.a - Main Activity Electricity and Heat Production\n1.A.1.a.i - Electricity Generation\n1.A.1.a.ii - Combined Heat and Power Generation (CHP)\n1.A.1.a.iii - Heat Plants':['I.4.4'],
        '1.A.1 - Energy Industries\n1.A.2 - Manufacturing Industries and Construction':['I.4.4'],
        '1.A.1 - Energy Industries\n1.A.4.a - Commercial/Institutional\n1.A.4.b - Residential\n1.A.4.c - Agriculture/Forestry/Fishing/Fish Farms\n1.A.4.c.i - Stationary':['I.4.4'],
        '1.A.1.a - Main Activity Electricity and Heat Production':['I.1.2', 'I.1.3', 'I.2.2', 'I.2.3', 'I.3.2', 'I.3.3', 'I.4.2', 'I.4.3', 'I.4.4', 'I.5.2', 'I.5.3', 'I.6.2', 'I.6.3', 'II.1.2', 'II.2.2', 'II.3.2', 'II.4.2', 'II.5.2'],
        '1.A.1.a - Main Activity Electricity and Heat Production\n1.A.1.a.i - Electricity Generation\n1.A.1.a.ii - Combined Heat and Power Generation (CHP)\n1.A.1.a.iii - Heat Plants':['I.1.2', 'I.1.3', 'I.2.2', 'I.2.3', 'I.3.2', 'I.3.3', 'I.4.2', 'I.4.3', 'I.4.4', 'I.5.2', 'I.5.3', 'I.6.2', 'I.6.3', 'II.1.2', 'II.2.2', 'II.3.2', 'II.4.2', 'II.5.2'],
        '1.A.1.a.i - Electricity Generation':['I.1.2', 'I.1.3', 'I.2.2', 'I.2.3', 'I.3.2', 'I.3.3', 'I.4.2', 'I.4.3', 'I.4.4', 'I.5.2', 'I.5.3', 'I.6.2', 'I.6.3', 'II.1.2', 'II.2.2', 'II.3.2', 'II.4.2', 'II.5.2'],
        '1.A.1.a.ii - Combined Heat and Power Generation (CHP)':['I.1.2', 'I.1.3', 'I.2.2', 'I.2.3', 'I.3.2', 'I.3.3', 'I.4.2', 'I.4.3', 'I.4.4', 'I.5.2', 'I.5.3', 'I.6.2', 'I.6.3', 'II.1.2', 'II.2.2', 'II.3.2', 'II.4.2', 'II.5.2'],
        '1.A.1.a.iii - Heat Plants':['I.1.2', 'I.1.3', 'I.2.2', 'I.2.3', 'I.3.2', 'I.3.3', 'I.4.2', 'I.4.3', 'I.4.4', 'I.5.2', 'I.5.3', 'I.6.2', 'I.6.3', 'II.1.2', 'II.2.2', 'II.3.2', 'II.4.2', 'II.5.2'],
        '1.A.1.b - Petroleum Refining':['I.4.4'],
        '1.A.1.c.i - Manufacture of Solid Fuels':['I.4.4', 'I.7.1', 'I.8.1'],
        '1.A.1.c.ii - Other Energy Industries':['I.4.4'],
        '1.A.2 - Manufacturing Industries and Construction':['I.3.1'],
        '1.A.2.a - Iron and Steel':['I.3.1'],
        '1.A.2.b - Non-Ferrous Metals':['I.3.1'],
        '1.A.2.c - Chemicals':['I.3.1'],
        '1.A.2.d - Pulp, Paper and Print':['I.3.1'],
        '1.A.2.e - Food Processing, Beverages and Tobacco':['I.3.1'],
        '1.A.2.f - Non-Metallic Minerals':['I.3.1'],
        '1.A.2.g - Transport Equipment':['I.3.1'],
        '1.A.2.h - Machinery':['I.3.1'],
        '1.A.2.j - Wood and wood products':['I.3.1'],
        '1.A.2.l - Textile and Leather':['I.3.1'],
        '1.A.3 - Transport':['II.1.1', 'II.2.1', 'II.3.1', 'II.4.1', 'II.5.1'],
        '1.A.3.a - Civil Aviation':['II.4.1'],
        '1.A.3.a - Civil Aviation\n1.A.3.a.i - International Aviation (International Bunkers)\n1.A.3.a.ii - Domestic Aviation':['II.4.1'],
        '1.A.3.a - Civil Aviation\n1.A.3.a.ii - Domestic Aviation':['II.4.1'],
        '1.A.3.a.i - International Aviation (International Bunkers)':['II.4.1'],
        '1.A.3.a.ii - Domestic Aviation':['II.4.1'],
        '1.A.3.b - Road Transportation':['II.1.1', 'II.2.1', 'II.5.1'],
        '1.A.3.b - Road Transportation\n1.A.3.b.ii - Light-duty trucks\n1.A.3.b.iii - Heavy-duty trucks and buses':['II.1.1', 'II.2.1', 'II.5.1'],
        '1.A.3.b.i - Cars':['II.1.1', 'II.5.1'],
        '1.A.3.b.i.1 - Passenger cars with 3-way catalysts':['II.1.1', 'II.5.1'],
        '1.A.3.b.ii - Light-duty trucks':['II.1.1', 'II.5.1'],
        '1.A.3.b.iii - Heavy-duty trucks and buses':['II.1.1', 'II.5.1'],
        '1.A.3.b.iv - Motorcycles':['II.1.1', 'II.5.1'],
        '1.A.3.c - Railways':['II.2.1'],
        '1.A.3.d - Water-borne Navigation':['II.3.1'],
        '1.A.3.e.ii - Off-road':['II.5.1'],
        '1.A.4.a - Commercial/Institutional':['I.2.1'],
        '1.A.4.b - Residential':['I.1.1'],
        '1.A.4.b - Residential\n1.A.4.c.i - Stationary':['I.1.1'],
        '1.A.4.c.i - Stationary':['I.1.1', 'I.2.1', 'I.3.1', 'I.4.1', 'I.5.1', 'I.6.1'],
        '1.A.4.c.ii - Off-road Vehicles and Other Machinery':['II.5.1'],
        '1.A.4.c.ii - Off-road Vehicles and Other Machinery\n1.A.4.c.iii - Fishing (mobile combustion)':['II.5.1'],
        '1.A.5.b - Mobile':['II.4.3', 'II.1.3', 'II.2.3', 'I.6.1', 'II.5.1'],
        '1.B.1.a - Coal mining and handling':['I.7.1'],
        '1.B.1.a.i - Underground mines':['I.7.1'],
        '1.B.1.a.i.1 - Mining':['I.7.1'],
        '1.B.1.a.i.2 - Post-mining seam gas emissions':['I.7.1'],
        '1.B.1.a.i.3 - Abandoned underground mines':['I.7.1'],
        '1.B.1.a.ii.1 - Mining':['I.7.1'],
        '1.B.1.a.ii.2 - Post-mining seam gas emissions':['I.7.1'],
        '1.B.2 - Oil and Natural Gas':['I.8.1'],
        '1.B.2.a - Oil':['I.8.1'],
        '1.B.2.a.i - Venting':['I.8.1'],
        '1.B.2.a.ii - Flaring':['I.8.1'],
        '1.B.2.a.ii - Flaring\n1.B.2.b.ii - Flaring':['I.8.1'],
        '1.B.2.b - Natural Gas':['I.8.1'],
        '1.B.2.b.i - Venting':['I.8.1'],
        '1.B.2.b.ii - Flaring':['I.8.1'],
        '2.A - Mineral Industry\n2.A.1 - Cement production\n2.A.2 - Lime production\n2.A.3 - Glass Production\n2.A.4 - Other Process Uses of Carbonates\n2.A.4.a - Ceramics\n2.A.4.b - Other Uses of Soda Ash\n2.A.4.c - Non Metallurgical Magnesia Production\n2.A.4.d - Other (please specify)\n2.A.5 - Other (please specify)':['IV.1','IV.2'],
        '2.A - Mineral Industry\n2.A.3 - Glass Production\n2.A.4 - Other Process Uses of Carbonates\n2.A.4.b - Other Uses of Soda Ash\n2.A.5 - Other (please specify)':['IV.1','IV.2'],
        '2.A - Mineral Industry\n2.A.5 - Other (please specify)':['IV.1','IV.2'],
        '2.A.1 - Cement production':['IV.1','IV.2'],
        '2.A.2 - Lime production':['IV.1','IV.2'],
        '2.A.3 - Glass Production':['IV.1','IV.2'],
        '2.A.4 - Other Process Uses of Carbonates':['IV.1','IV.2'],
        '2.A.4.a - Ceramics':['IV.1','IV.2'],
        '2.A.4.b - Other Uses of Soda Ash':['IV.1','IV.2'],
        '2.A.4.d - Other (please specify)':['IV.1','IV.2'],
        '2.A.5 - Other (please specify)':['IV.1','IV.2'],
        '2.B.1 - Ammonia Production':['IV.1'],
        '2.B.2 - Nitric Acid Production':['IV.1'],
        '2.B.3 - Adipic Acid Production':['IV.1'],
        '2.B.4 - Caprolactam, Glyoxal and Glyoxylic Acid Production':['IV.1'],
        '2.B.5 - Carbide Production':['IV.1'],
        '2.B.6 - Titanium Dioxide Production':['IV.1'],
        '2.B.7 - Soda Ash Production':['IV.1'],
        '2.B.8.a - Methanol':['IV.1'],
        '2.B.8.b - Ethylene':['IV.1'],
        '2.B.8.c - Ethylene Dichloride and Vinyl Chloride Monomer':['IV.1'],
        '2.B.8.d - Ethylene Oxide':['IV.1'],
        '2.B.8.e - Acrylonitrile':['IV.1'],
        '2.B.8.f - Carbon Black':['IV.1'],
        '2.B.9.a - By-product emissions':['I.7.1', 'I.8.1'],
        '2.B.9.b - Fugitive Emissions':['I.7.1', 'I.8.1'],
        '2.C.1 - Iron and Steel Production':['IV.1'],
        '2.C.2 - Ferroalloys Production':['IV.1'],
        '2.C.3 - Aluminium production':['IV.1'],
        '2.C.4 - Magnesium production':['IV.1'],
        '2.C.5 - Lead Production':['IV.1'],
        '2.C.6 - Zinc Production':['IV.1'],
        '2.E.1 - Integrated Circuit or Semiconductor':['VI.1'],
        '2.E.2 - TFT Flat Panel Display':['VI.1'],
        '2.E.3 - Photovoltaics':['VI.1'],
        '2.E.4 - Heat Transfer Fluid':['VI.1'],
        '2.F.1 - Refrigeration and Air Conditioning':['VI.1'],
        '2.F.1 - Refrigeration and Air Conditioning\n2.F.1.a - Refrigeration and Stationary Air Conditioning\n2.F.1.b - Mobile Air Conditioning\n2.F.6 - Other Applications (please specify)':['VI.1'],
        '2.F.1.a - Refrigeration and Stationary Air Conditioning':['VI.1'],
        '2.F.1.b - Mobile Air Conditioning':['VI.1'],
        '2.F.2 - Foam Blowing Agents':['VI.1'],
        '2.F.3 - Fire Protection':['VI.2'],
        '2.F.4 - Aerosols':['VI.2'],
        '2.F.5 - Solvents':['VI.2'],
        '2.F.6 - Other Applications (please specify)':['VI.2'],
        '2.G.1.a - Manufacture of Electrical Equipment':['VI.1'],
        '2.G.1.b - Use of Electrical Equipment':['VI.2'],
        '2.G.1.c - Disposal of Electrical Equipment':['VI.2'],
        '2.G.2.a - Military Applications':['VI.2'],
        '2.G.2.b - Accelerators':['VI.2'],
        '2.G.3.a - Medical Applications':['VI.2'],
        '2.G.3.b - Propellant for pressure and aerosol products':['VI.1'],
        '2.G.4 - Other (Please specify)':['VI.1', 'IV.2'],
        '3 - Agriculture, Forestry, and Other Land Use':['V.1','V.2','V.3'],
        '3 - Agriculture, Forestry, and Other Land Use\n3.A - Livestock\n3.A.2 - Manure Management':['V.1'],
        '3 - Agriculture, Forestry, and Other Land Use\n3.C.4 - Direct N2O Emissions from managed soils':['V.3'],
        '3 - Agriculture, Forestry, and Other Land Use\n3.C.5 - Indirect N2O Emissions from managed soils':['V.3'],
        '3 - Agriculture, Forestry, and Other Land Use\n3.C.7 - Rice cultivations':['V.3'],
        '3.A.1 - Enteric Fermentation':['V.1'],
        '3.A.1.a - Cattle':['V.1'],
        '3.A.1.a.i - Dairy Cows':['V.1'],
        '3.A.1.a.ii - Other Cattle':['V.1'],
        '3.A.1.b - Buffalo':['V.1'],
        '3.A.1.b - Buffalo\n3 - Agriculture, Forestry, and Other Land Use\n3.A - Livestock\n3.A.1 - Enteric Fermentation':['V.1'],
        '3.A.1.c - Sheep':['V.1'],
        '3.A.1.c - Sheep\n3.A.1.d - Goats':['V.1'],
        '3.A.1.d - Goats':['V.1'],
        '3.A.1.e - Camels':['V.1'],
        '3.A.1.f - Horses':['V.1'],
        '3.A.1.g - Mules and Asses':['V.1'],
        '3.A.1.h - Swine':['V.1'],
        '3.A.1.j - Other (please specify)':['V.1'],
        '3.A.2 - Manure Management':['V.1'],
        '3.A.2 - Manure Management\n3.A.2.j - Other (please specify)\n3 - Agriculture, Forestry, and Other Land Use\n3.A - Livestock':['V.1'],
        '3.A.2.a - Cattle':['V.1'],
        '3.A.2.a - Cattle\n3.A.2.j - Other (please specify)\n3 - Agriculture, Forestry, and Other Land Use\n3.A - Livestock\n3.A.2 - Manure Management':['V.1'],
        '3.A.2.a.i - Dairy cows':['V.1'],
        '3.A.2.a.i - Dairy cows\n3 - Agriculture, Forestry, and Other Land Use\n3.A - Livestock\n3.A.2 - Manure Management':['V.1'],
        '3.A.2.a.i - Dairy cows\n3.A.2.a.ii - Other cattle':['V.1'],
        '3.A.2.a.ii - Other cattle':['V.1'],
        '3.A.2.a.ii - Other cattle\n3 - Agriculture, Forestry, and Other Land Use\n3.A - Livestock\n3.A.1 - Enteric Fermentation\n3.A.1.a.ii - Other Cattle\n3.A.2 - Manure Management':['V.1'],
        '3.A.2.a.ii - Other cattle\n3 - Agriculture, Forestry, and Other Land Use\n3.A - Livestock\n3.A.2 - Manure Management':['V.1'],
        '3.A.2.b - Buffalo':['V.1'],
        '3.A.2.b - Buffalo\n3 - Agriculture, Forestry, and Other Land Use\n3.A - Livestock\n3.A.1 - Enteric Fermentation\n3.A.1.b - Buffalo\n3.A.2 - Manure Management':['V.1'],
        '3.A.2.c - Sheep':['V.1'],
        '3.A.2.c - Sheep\n3 - Agriculture, Forestry, and Other Land Use\n3.A - Livestock\n3.A.2 - Manure Management':['V.1'],
        '3.A.2.c - Sheep\n3 - Agriculture, Forestry, and Other Land Use\n3.A - Livestock\n3.A.2 - Manure Management\n3.A.2.a - Cattle':['V.1'],
        '3.A.2.d - Goats':['V.1'],
        '3.A.2.d - Goats\n3 - Agriculture, Forestry, and Other Land Use\n3.A - Livestock\n3.A.2 - Manure Management':['V.1'],
        '3.A.2.e - Camels':['V.1'],
        '3.A.2.e - Camels\n3 - Agriculture, Forestry, and Other Land Use\n3.A - Livestock\n3.A.2 - Manure Management':['V.1'],
        '3.A.2.f - Horses':['V.1'],
        '3.A.2.f - Horses\n3 - Agriculture, Forestry, and Other Land Use\n3.A - Livestock\n3.A.2 - Manure Management':['V.1'],
        '3.A.2.g - Mules and Asses':['V.1'],
        '3.A.2.g - Mules and Asses\n3 - Agriculture, Forestry, and Other Land Use\n3.A - Livestock\n3.A.2 - Manure Management':['V.1'],
        '3.A.2.h - Swine':['V.1'],
        '3.A.2.h - Swine\n3 - Agriculture, Forestry, and Other Land Use\n3.A - Livestock\n3.A.2 - Manure Management':['V.1'],
        '3.A.2.i - Poultry':['V.1'],
        '3.A.2.i - Poultry\n3 - Agriculture, Forestry, and Other Land Use\n3.A - Livestock\n3.A.2 - Manure Management':['V.1'],
        '3.A.2.i - Poultry\n3.A.2.j - Other (please specify)\n3 - Agriculture, Forestry, and Other Land Use\n3.A - Livestock\n3.A.2 - Manure Management\n3.A.2.a - Cattle\n3.A.2.b - Buffalo\n3.A.2.c - Sheep\n3.A.2.d - Goats\n3.A.2.e - Camels\n3.A.2.f - Horses\n3.A.2.g - Mules and Asses\n3.A.2.h - Swine':['V.1'],
        '3.A.2.j - Other (please specify)':['V.1'],
        '3.B - Land':['V.2'],
        '3.B.1 - Forest land':['V.2'],
        '3.B.1.a - Forest land Remaining Forest land':['V.2'],
        '3.B.1.a - Forest land Remaining Forest land\n3.B.1.b.iii - Wetlands converted to Forest Land\n3.B.4.a - Wetlands Remaining Wetlands\n3.B.4.b.iii - Land converted to other wetlands':['V.2'],
        '3.B.2 - Cropland':['V.2'],
        '3.B.2.a - Cropland Remaining Cropland':['V.2'],
        '3.B.2.b.i - Forest Land converted to Cropland\n3.B.1.a - Forest land Remaining Forest land\n3.B.2.b.ii - Grassland converted to Cropland\n3.B.3.a - Grassland Remaining Grassland':['V.2'],
        '3.B.2.b.i - Forest Land converted to Cropland\n3.B.1.a - Forest land Remaining Forest land\n3.B.5.b.i - Forest Land converted to Settlements':['V.2'],
        '3.B.2.b.i - Forest Land converted to Cropland\n3.B.1.a - Forest land Remaining Forest land\n3.B.5.b.i - Forest Land converted to Settlements\n3.B.2.b.ii - Grassland converted to Cropland\n3.B.3.a - Grassland Remaining Grassland\n3.B.5.b.iii - Grassland converted to Settlements':['V.2'],
        '3.B.2.b.ii - Grassland converted to Cropland\n3.B.3.a - Grassland Remaining Grassland\n3.B.5.b.iii - Grassland converted to Settlements':['V.2'],
        '3.B.2.b.iii - Wetlands converted to Cropland\n3.B.5.b.iv - Wetlands converted to Settlements\n3.B.4.a - Wetlands Remaining Wetlands':['V.2'],
        '3.B.3 - Grassland':['V.2'],
        '3.B.3.a - Grassland Remaining Grassland':['V.2'],
        '3.B.3.b - Land Converted to Grassland':['V.2'],
        '3.B.4 - Wetlands':['V.2'],
        '3.B.4.a - Wetlands Remaining Wetlands':['V.2'],
        '3.B.4.a - Wetlands Remaining Wetlands\n3.B.4.b.iii - Land converted to other wetlands':['V.2'],
        '3.B.4.a.i - Peat Extraction remaining Peat Extraction':['V.2'],
        '3.B.4.a.ii - Flooded land remaining flooded land\n3.B - Land\n3.B.4 - Wetlands':['V.2'],
        '3.B.4.b - Land Converted to Wetlands':['V.2'],
        '3.B.4.b.ii - Land converted to flooded land\n3.B - Land\n3.B.4 - Wetlands':['V.2'],
        '3.B.4.b.iii - Land converted to other wetlands':['V.2'],
        '3.C.1.a - Burning in Forest Land':['V.3'],
        '3.C.1.b - Burning in Cropland':['V.3'],
        '3.C.1.c - Burning in Grassland':['V.3'],
        '3.C.10 - CH4 from Rewetting of Organic Soils':['V.3'],
        '3.C.11 - CH4 Emissions from Rewetting of Mangroves and Tidal Marshes':['V.3'],
        '3.C.3 - Urea application':['V.3'],
        '3.C.4 - Direct N2O Emissions from managed soils':['V.3'],
        '3.C.5 - Indirect N2O Emissions from managed soils':['V.3'],
        '3.C.7 - Rice cultivations':['V.3'],
        '3.C.8 - CH4 from Drained Organic Soils':['V.3'],
        '4.A - Solid Waste Disposal':['III.1.1', 'III.1.2', 'III.1.3'],
        '4.A.1 - Managed Waste Disposal Sites':['III.1.1', 'III.1.2', 'III.1.3'],
        '4.B - Biological Treatment of Solid Waste':['III.2.1', 'III.2.2', 'III.2.3'],
        '4.C - Incineration and Open Burning of Waste':['III.3.1', 'III.3.2', 'III.3.3'],
        '4.C.1 - Waste Incineration':['III.3.1', 'III.3.2', 'III.3.3'],
        '4.C.2 - Open Burning of Waste':['III.3.1', 'III.3.2', 'III.3.3'],
        '4.D - Wastewater Treatment and Discharge':['III.4.1', 'III.4.2', 'III.4.3'],
        '4.D.1 - Domestic Wastewaster Treatment and Discharge':['III.4.1', 'III.4.2', 'III.4.3'],
        '4.D.1 - Domestic Wastewaster Treatment and Discharge\n4.D.2 - Industrial Wastewater Treatment and Discharge':['III.4.1', 'III.4.2', 'III.4.3'],
        '4.D.2 - Industrial Wastewater Treatment and Discharge':['III.4.1', 'III.4.2', 'III.4.3'],
        '4.E - Other (please specify)':['III.2.1', 'III.2.2', 'III.2.3', 'III.4.1', 'III.4.2', 'III.4.3'],
        'nan':['NA']
    }

    lst = []
    for key, val in mapping.items():
        for v in val:
            lst.append({"ipcc_2006_category": key, "gpc_sector": v})

    return pd.DataFrame(lst)


def merge_columns(row):
    """merge columns two columns"""
    if row["fuel"]:
        if pd.isna(row["fuel"]):
            return f"{row['units']}"
        else:
            return f"{row['units']} {row['fuel']}"
    else:
        return row["units"]


def save_to_csv(fl, data):
    """save list of dictionaries to CSV"""
    with open(fl, "w", newline="") as csvfile:
        fieldnames = data[0].keys()  # Assuming all dictionaries have the same keys
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)

        writer.writeheader()
        writer.writerows(data)


if __name__ == "__main__":
    # set random.seed so UUID is reproducible
    #! assumes records always generated in same order
    seed_string = get_filename()
    seed_value = string_to_hash(seed_string)
    set_seed(seed_value)

    # output directory
    output_dir = "../data_processed/EFDB_US/"
    output_dir = os.path.abspath(output_dir)
    make_dir(path=Path(output_dir).as_posix())

    # raw data file path
    input_fl = "../data_raw/EFDB_US/EFDB_US.csv"
    input_fl = os.path.abspath(input_fl)

    # =================================================================
    # Publisher
    # =================================================================
    publisher_data = {
        "publisher_id": uuid_generate_v4(),
        "name": "IPCC",
        "URL": "https://www.ipcc.ch/",
    }

    write_dic_to_csv(output_dir, "Publisher", publisher_data)

    # =================================================================
    # DataSource
    # =================================================================
    datasource_data = {
        "datasource_id": uuid_generate_v4(),
        "name": "IPCC Emission Factor Database (EFDB) [US only]",
        "URL": "https://www.ipcc-nggip.iges.or.jp/EFDB/main.php",
        "geographical_location": "US",
        "publisher_id": publisher_data.get("publisher_id"),
    }

    write_dic_to_csv(output_dir, "DataSource", datasource_data)

    # =================================================================
    # EmissionsFactor
    # =================================================================
    # read raw dataset
    df = pd.read_csv(input_fl)
    filt_desc = df["Description"].str.contains("emission factor", case=False, na=False)
    df_filt = df.loc[filt_desc].reset_index(drop=True)

    # only keep emission factors from US
    output_list = []
    ACCEPTABLE_REGION_NAMES = ["UNITED STATES OF AMERICA", "USA"]
    NEW_REGION_NAME = "US"

    for _, row in df_filt.iterrows():
        # strip extraneous whitespace
        row = row.apply(strip_string)

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

        if output_dic["region"].upper() in ACCEPTABLE_REGION_NAMES:
            # change name
            output_dic["region"] = NEW_REGION_NAME

            # append to list
            output_list.append(output_dic)

    # sort list by ipcc sector
    output_list = sorted(output_list, key=lambda x: x["ipcc_2006_category"])

    # create dataframe
    df = pd.DataFrame(output_list)

    # create mapping for ipcc to gpc sectors
    df_tmp = create_ipcc_to_gpc_mapping()
    df_out = pd.merge(df, df_tmp, on="ipcc_2006_category")

    df_out["units_merged"] = df_out.apply(merge_columns, axis=1)

    df_out["value"] = df_out["value"].round(3)

    COLUMNS = ["gpc_sector", "value", "units_merged", "gas", "description", "region", "reference"]
    df_emissions_factor = df_out.loc[:, COLUMNS].rename(
        columns={
            "units_merged": "units",
            "gpc_sector": "gpc_refno",
            "value": "emissions_factor",
        }
    )
    df_emissions_factor["emissions_factor_id"] = df_emissions_factor.apply(
        lambda row: uuid_generate_v4(), axis=1
    )

    df_emissions_factor.to_csv(f"{output_dir}/EmissionsFactor.csv", index=False)

    # =================================================================
    # DataSourceEmissionsFactor
    # =================================================================
    datasource_emissions_factor_data = [
        {
            "datasource_id": datasource_data.get("datasource_id"),
            "emissions_factor_id": emissions_factor_id,
        }
        for emissions_factor_id in df_emissions_factor["emissions_factor_id"]
    ]

    write_dic_to_csv(
        output_dir, "DataSourceEmissionsFactor", datasource_emissions_factor_data
    )
