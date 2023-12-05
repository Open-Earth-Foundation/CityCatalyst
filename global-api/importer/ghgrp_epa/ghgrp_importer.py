#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# script.py
import sys
sys.path.append('.')
import argparse
import logging
import os
import pandas as pd
from pathlib import Path
from sqlalchemy import create_engine, MetaData, Table
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import sessionmaker
import zipfile
from utils import uuid_generate_v3
from lat_lon_to_locode import lat_lon_to_locode
from utils_ghgrp import (
    restructure,
    nan_to_zero,
    add_geometry,
    max_col_name,
    assign_value_to_max_col,
    format_change,
    count_words,
    drop_zero,
    gpc_classification
)

years_to_files = {
    "2019": ["2022_data_summary_spreadsheets/ghgp_data_2019.xlsx"],
    "2020": ["2022_data_summary_spreadsheets/ghgp_data_2020.xlsx"],
    "2021": ["2022_data_summary_spreadsheets/ghgp_data_2021.xlsx"],
    "2022": ["2022_data_summary_spreadsheets/ghgp_data_2022.xlsx"],
}

def insert_record(engine, table, pkey, record):
    """insert record into table"""
    fields = [col.name for col in table.columns]

    table_data = {key: record.get(key) for key in record.keys() if key in fields}

    do_update_ins = (
        insert(table)
        .values(table_data)
        .on_conflict_do_update(
            index_elements=[pkey],
            set_=table_data
        )
    )

    with engine.connect() as conn:
        conn.execute(do_update_ins)



def load_direct_emitters_from_zip(zip_file_path: str, file_name: str):
    """Load 'Direct Emitters' sheet from a specific XLSX file inside a zip archive into a pandas DataFrame"""
    with zipfile.ZipFile(zip_file_path, 'r') as zip_file:
        # Check if the specified file is in XLSX format
        if file_name.lower().endswith('.xlsx'):
            with zip_file.open(file_name) as xlsx_file:
                # Read the 'Direct Emitters' sheet from the XLSX file
                df = pd.read_excel(xlsx_file, sheet_name='Direct Emitters')
                return df

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--database_uri",
        help="database URI (e.g. postgresql://ccglobal:@localhost/ccglobal)",
        default=os.environ.get("DB_URI"),
    )
    parser.add_argument("--file", help="path to gzipped ghgrp file")
    parser.add_argument(
        "--log_file", help="path to log file", default="./ghgrp_importer.log"
    )
    args = parser.parse_args()

    zip_file = Path(os.path.abspath(args.file))

    logging.basicConfig(
        filename=args.log_file,
        level=logging.INFO,
        format="%(asctime)s - %(levelname)s - %(message)s",
    )

    engine = create_engine(args.database_uri)
    metadata_obj = MetaData()
    Session = sessionmaker(bind=engine)
    session = Session()

    ghgrp_epa = Table("ghgrp_epa", metadata_obj, autoload_with=engine)
    fields = [col.name for col in ghgrp_epa.columns]
    pkey_constraint_name = 'ghgrp_epa_pkey'

    for year in years_to_files.keys():
        logging.info(f"Year: {year}")

        year_files = years_to_files.get(year)

        for file in year_files:
            logging.info(f"File: {file}")
            filename = Path(file).stem
            df = load_direct_emitters_from_zip(zip_file, file)
            print(f'Working on: {filename}')

            # preproccesing data
            df = restructure(df)
            df = nan_to_zero(df)
            max_column = max_col_name(df)
            df = assign_value_to_max_col(df, max_column)
            df = format_change(df)
            df['final_sector'] = df['Industry Type (sectors)'].apply(lambda x: count_words(x))
            df = add_geometry(df)
            df = df.rename(columns={
                "Facility Id": "facility_id",
                "Facility Name" : "facility_name",
                "City" : "city",
                "State" : "state",
                "County" : "county",
                "Latitude" : "latitude",
                "Longitude" : "longitude",
                "Industry Type (subparts)" : "subparts",
                "Industry Type (sectors)" : "sectors"
                })
            df = drop_zero(df)

            for index, row in df.iterrows():
                subpart_name = row['subpart_name']
                final_sector = row['final_sector']

                if subpart_name in gpc_classification['subpart_name'].keys():
                    subpart_data = gpc_classification['subpart_name'][subpart_name]

                    # Check if the subpart has a final_sector key
                    if list(subpart_data.keys())[0] == 'gpc_refno':
                        df.at[index, 'GPC_ref_no'] = subpart_data['gpc_refno']
                    else:
                        # Check if the final_sector exists in the subpart_data
                        if 'final_sector' in subpart_data and final_sector in subpart_data['final_sector']:
                            final_sector_data = subpart_data['final_sector'][final_sector]
                            df.at[index, 'GPC_ref_no'] = final_sector_data['gpc_refno']
                        else:
                            continue

            # insertion process
            for index, row in df.iterrows():

                record = row.to_dict()

                # metric tonnes to kg
                record['emissions_quantity'] = record['emissions_quantity']*1000

                # get the locode and coordinate points
                locode = lat_lon_to_locode(session, record['latitude'], record['longitude'])

                if not locode:
                    logging.warning(f"Could not find locode for facility {record['facility_id']}")
                    continue

                # add keys filename and reno to record
                record["geometry"] = record["geometry"].wkt
                record["locode"] = locode
                record["filename"] = filename
                record["gas"] = 'CO2e'
                record["year"] = year
                record['emissions_quantity_units'] = 'kg'
                record['GWP_ref'] = 'AR4'

                id_string = (
                    str(record["filename"])
                    +str(record["gas"])
                    +str(record["geometry"])
                )
                record["id"] = uuid_generate_v3(id_string)

                insert_record(engine, ghgrp_epa, 'id', record)

    logging.info("Done!")
    session.close()