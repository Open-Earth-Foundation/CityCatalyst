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


IPCC_2006_THAT_ARE_GPC_BASIC = [
    "1.A - Fuel Combustion Activities",
    "1.A.1.a.ii - Combined Heat and Power Generation (CHP)",
    "1.A.3.b - Road Transportation",
    "1.B.1.a - Coal mining and handling",
    "1.B.2 - Oil and Natural Gas",
    "1.B.2.a - Oil",
    "1.B.2.b - Natural Gas",
    "4.B - Biological Treatment of Solid Waste",
    "4.D.1 - Domestic Wastewaster Treatment and Discharge",
]


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
        "1.A - Fuel Combustion Activities": [
            "I.1.1",
            "I.2.1",
            "I.3.1",
            "I.4.1",
            "I.5.1",
            "I.6.1",
        ],
        "1.A.3.b - Road Transportation": ["II.1.1"],
        "1.B.2 - Oil and Natural Gas": ["IV.1"],
        "1.B.2.a - Oil": ["IV.1"],
        "1.B.2.b - Natural Gas": ["IV.1"],
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
    filt_cat = df["IPCC 2006 Source/Sink Category"].isin(IPCC_2006_THAT_ARE_GPC_BASIC)
    filt = filt_desc & filt_cat
    df_filt = df.loc[filt].reset_index(drop=True)

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
