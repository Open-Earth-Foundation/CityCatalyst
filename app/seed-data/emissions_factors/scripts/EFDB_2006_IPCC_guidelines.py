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
        '1.A - Fuel Combustion Activities':[
            'I.1.1',
            'I.2.1',
            'I.3.1',
            'I.4.1',
            'I.5.1',
            'I.6.1'
        ],
        '1.A.1 - Energy Industries':[
            '1.4.1'
        ],
        '1.A.2 - Manufacturing Industries and Construction':[
            'I.3.1'
        ],
        '1.A.3.a - Civil Aviation':[
            'II.4.1'
        ],
        '1.A.3.b - Road Transportation':[
            'II.1.1',
            'II.2.1',
            'II.3.1',
            'II.5.1'
        ],
        '1.A.3.b.i - Cars':[
            'II.1.1',
            'II.5.1'
        ],
        '1.A.3.b.ii - Light-duty trucks':[
            'II.1.1',
            'II.5.1'
        ],
        '1.A.3.b.iii - Heavy-duty trucks and buses':[
            'II.1.1',
            'II.5.1'
        ],
        '1.A.3.b.iv - Motorcycles':[
            'II.1.1',
            'II.5.1'
        ],
        '1.A.3.c - Railways':[
            'II.2.1',
            'II.5.1'
        ],
        '1.A.3.d - Water-borne Navigation':[
            'II.3.1'
        ],
        '1.A.3.e.ii - Off-road':[
            'II.1.1',
            'II.2.1',
            'II.3.1',
            'II.5.1'
        ],
        '1.A.4.a - Commercial/Institutional':[
            'I.2.1'
        ],
        '1.A.4.b - Residential':[
            'I.1.1'
        ],
        '1.A.4.c.i - Stationary':[
            'I.1.1',
            'I.2.1',
            'I.3.1',
            'I.4.1',
            'I.5.1',
            'I.6.1',
            'I.7.1',
            'I.8.1'
        ],
        '1.A.4.c.ii - Off-road Vehicles and Other Machinery':[
            'II.5.1'
        ],
        '1.B.1.a.i.1 - Mining':[
            '1.7.1'
        ],
        '1.B.1.a.i.2 - Post-mining seam gas emissions':[
            '1.7.1'
        ],
        '1.B.1.a.i.3 - Abandoned underground mines':[
            '1.7.1'
        ],
        '1.B.1.a.ii.1 - Mining':[
            '1.7.1'
        ],
        '1.B.1.a.ii.2 - Post-mining seam gas emissions':[
            '1.7.1'
        ],
        '1.B.2.a.i - Venting':[
            '1.8.1'
        ],
        '1.B.2.a.iii.2 - Production and Upgrading':[
            '1.8.1'
        ],
        '1.B.2.a.iii.3 - Transport':[
            '1.8.1'
        ],
        '1.B.2.a.iii.4 - Refining':[
            '1.8.1'
        ],
        '1.B.2.a.iii.5 - Distribution of oil products':[
            '1.8.1'
        ],
        '1.B.2.b.i - Venting':[
            '1.8.1'
        ],
        '1.B.2.b.ii - Flaring':[
            '1.8.1'
        ],
        '1.B.2.b.iii.2 - Production':[
            '1.8.1'
        ],
        '1.B.2.b.iii.3 - Processing':[
            '1.8.1'
        ],
        '1.B.2.b.iii.4 - Transmission and Storage':[
            '1.8.1'
        ],
        '1.B.2.b.iii.5 - Distribution':[
            '1.8.1'
        ],
        '2.A - Mineral Industry':[
            'IV.1',
            'IV.2'
        ],
        '2.A.1 - Cement production':[
            'IV.1',
            'IV.2'
        ],
        '2.A.2 - Lime production':[
            'IV.1',
            'IV.2'
        ],
        '2.A.3 - Glass Production':[
            'IV.1',
            'IV.2'
        ],
        '2.A.4 - Other Process Uses of Carbonates':[
            'IV.1',
            'IV.2'
        ],
        '2.A.4.a - Ceramics':[
            'IV.1',
            'IV.2'
        ],
        '2.A.4.b - Other Uses of Soda Ash':[
            'IV.1',
            'IV.2'
        ],
        '2.A.4.c - Non Metallurgical Magnesia Production':[
            'IV.1',
            'IV.2'
        ],
        '2.A.4.d - Other (please specify)':[
            'IV.1',
            'IV.2'
        ],
        '2.A.5 - Other (please specify)':[
            'IV.1',
            'IV.2'
        ],
        '2.B.1 - Ammonia Production':[
            'IV.1',
            'IV.2'
        ],
        '2.B.2 - Nitric Acid Production':[
            'IV.1',
            'IV.2'
        ],
        '2.B.3 - Adipic Acid Production':[
            'IV.1',
            'IV.2'
        ],
        '2.B.4 - Caprolactam, Glyoxal and Glyoxylic Acid Production':[
            'IV.1',
            'IV.2'
        ],
        '2.B.5 - Carbide Production':[
            'IV.1',
            'IV.2'
        ],
        '2.B.6 - Titanium Dioxide Production':[
            'IV.1',
            'IV.2'
        ],
        '2.B.7 - Soda Ash Production':[
            'IV.1',
            'IV.2'
        ],
        '2.B.8.a - Methanol':[
            'IV.1',
            'IV.2'
        ],
        '2.B.8.b - Ethylene':[
            'IV.1',
            'IV.2'
        ],
        '2.B.8.c - Ethylene Dichloride and Vinyl Chloride Monomer':[
            'IV.1',
            'IV.2'
        ],
        '2.B.8.d - Ethylene Oxide':[
            'IV.1',
            'IV.2'
        ],
        '2.B.8.e - Acrylonitrile':[
            'IV.1',
            'IV.2'
        ],
        '2.B.8.f - Carbon Black':[
            'IV.1',
            'IV.2'
        ],
        '2.B.9.a - By-product emissions':[
            'IV.1',
            'IV.2'
        ],
        '2.B.9.b - Fugitive Emissions':[
            'IV.1',
            'IV.2'
        ],
        '2.C.1 - Iron and Steel Production':[
            'IV.1',
            'IV.2'
        ],
        '2.C.2 - Ferroalloys Production':[
            'IV.1',
            'IV.2'
        ],
        '2.C.3 - Aluminium production':[
            'IV.1',
            'IV.2'
        ],
        '2.C.4 - Magnesium production':[
            'IV.1',
            'IV.2'
        ],
        '2.C.5 - Lead Production':[
            'IV.1',
            'IV.2'
        ],
        '2.C.6 - Zinc Production':[
            'IV.1',
            'IV.2'
        ],
        '2.D.1 - Lubricant Use':[
            'IV.1',
            'IV.2'
        ],
        '2.D.2 - Paraffin Wax Use':[
            'IV.1',
            'IV.2'
        ],
        '2.E.1 - Integrated Circuit or Semiconductor':[
            'IV.1',
            'IV.2'
        ],
        '2.E.2 - TFT Flat Panel Display':[
            'IV.1',
            'IV.2'
        ],
        '2.E.3 - Photovoltaics':[
            'IV.1',
            'IV.2'
        ],
        '2.E.4 - Heat Transfer Fluid':[
            'IV.1',
            'IV.2'
        ],
        '2.F.1.a - Refrigeration and Stationary Air Conditioning':[
            'IV.1',
            'IV.2'
        ],
        '2.F.1.b - Mobile Air Conditioning':[
            'IV.1',
            'IV.2'
        ],
        '2.F.2 - Foam Blowing Agents':[
            'IV.1',
            'IV.2'
        ],
        '2.F.4 - Aerosols':[
            'IV.1',
            'IV.2'
        ],
        '2.F.5 - Solvents':[
            'IV.1',
            'IV.2'
        ],
        '2.G.1.a - Manufacture of Electrical Equipment':[
            'IV.1',
            'IV.2'
        ],
        '2.G.1.b - Use of Electrical Equipment':[
            'IV.1',
            'IV.2'
        ],
        '2.G.1.c - Disposal of Electrical Equipment':[
            'IV.1',
            'IV.2'
        ],
        '2.G.2.a - Military Applications':[
            'IV.1',
            'IV.2'
        ],
        '2.G.2.b - Accelerators':[
            'IV.1',
            'IV.2'
        ],
        '2.G.2.c - Other (please specify)':[
            'IV.1',
            'IV.2'
        ],
        '2.G.3.a - Medical Applications':[
            'IV.1',
            'IV.2'
        ],
        '2.G.3.b - Propellant for pressure and aerosol products':[
            'IV.1',
            'IV.2'
        ],
        '3.A.1 - Enteric Fermentation':[
            'V.1'
        ],
        '3.A.2 - Manure Management':[
            'V.1'
        ],
        '3.B.1 - Forest land':[
            'V.2'
        ],
        '3.B.2 - Cropland':[
            'V.2'
        ],
        '3.B.2.b - Land Converted to Cropland':[
            'V.2'
        ],
        '3.B.3 - Grassland':[
            'V.2'
        ],
        '3.B.3.b - Land Converted to Grassland':[
            'V.2'
        ],
        '3.B.4 - Wetlands':[
            'V.2'
        ],
        '3.B.4.b.ii - Land converted to flooded land':[
            'V.2'
        ],
        '3.B.4.a.ii - Flooded land remaining flooded land':[
            'V.2'
        ],
        '3.B.5 - Settlements':[
            'V.2'
        ],
        '3.C.1.a - Burning in Forest Land':[
            'V.2'
        ],
        '3.C.1.b - Burning in Cropland':[
            'V.2',
            'V.3'
        ],
        '3.C.1.c - Burning in Grassland':[
            'V.2',
            'V.3'
        ],
        '3.C.4 - Direct N2O Emissions from managed soils':[
            'V.3'
        ],
        '3.C.5 - Indirect N2O Emissions from managed soils':[
            'V.3'
        ],
        '3.C.7 - Rice cultivations':[
            'V.2',
            'V.3'
        ],
        '3.D.1 - Harvested Wood Products':[
            'V.2',
            'V.3'
        ],
        '4.A - Solid Waste Disposal':[
            'III.1.1',
            'III.1.2',
            'III.1.3'
        ],
        '4.B - Biological Treatment of Solid Waste':[
            'III.2.1',
            'III.2.2',
            'III.2.3'
        ],
        '4.C - Incineration and Open Burning of Waste':[
            'III.3.1',
            'III.3.2',
            'III.3.3'
        ],
        '4.C.1 - Waste Incineration':[
            'III.3.1',
            'III.3.2',
            'III.3.3'
        ],
        '4.C.2 - Open Burning of Waste':[
            'III.3.1',
            'III.3.2',
            'III.3.3'
        ]
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
    output_dir = "../data_processed/EFDB_2006_IPCC_guidelines/"
    output_dir = os.path.abspath(output_dir)
    make_dir(path=Path(output_dir).as_posix())

    # raw data file path
    input_fl = "../data_raw/EFDB_2006_IPCC_guidelines/EFDB_2006_IPCC_guidelines.csv"
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
        "name": "IPCC Emission Factor Database (EFDB) [2006 IPCC Guidelines]",
        "URL": "https://www.ipcc-nggip.iges.or.jp/EFDB/main.php",
        "publisher_id": publisher_data.get("publisher_id"),
    }
    datasource_data["datasource_id"] = uuid_generate_v3(name=datasource_data.get("name"))

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

    COLUMNS = ["gpc_sector", "value", "units_merged", "gas", "region", "reference"]
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
