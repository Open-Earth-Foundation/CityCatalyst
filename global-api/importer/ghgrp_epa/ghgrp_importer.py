#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import argparse
import logging
import os
import pandas as pd
from pathlib import Path
from sqlalchemy import create_engine, MetaData, Table
from sqlalchemy.orm import sessionmaker
import zipfile
import uuid
from lat_lon_to_locode import lat_lon_to_locode
from utils import (
    restructure,
    nan_to_zero,
    add_geometry,
    max_col_name,
    assign_value_to_max_col,
    format_change,
    count_words,
    assign_gpc_ref_no   
)

years_to_files = {
    "2019": ["2022_data_summary_spreadsheets/ghgp_data_2019.xlsx"],
    "2020": ["2022_data_summary_spreadsheets/ghgp_data_2020.xlsx"],
    "2021": ["2022_data_summary_spreadsheets/ghgp_data_2021.xlsx"],
    "2022": ["2022_data_summary_spreadsheets/ghgp_data_2022.xlsx"],
}

def record_generator(fl):
    """returns a generator for the csv file"""
    df = pd.read_csv(fl)
    for _, row in df.iterrows():
        yield row.to_dict()

def insert_record(engine, table, pkey, record):
    """insert record into table"""
    fields = [col.name for col in table.columns]

    table_data = {key: record.get(key) for key in record.keys() if key in fields}

    pkey_value = table_data.get(pkey)

    with engine.begin() as conn:
        pkey_exists = conn.execute(
            table.select().where(table.columns[pkey] == pkey_value)
        ).fetchone()

        if not pkey_exists:
            ins = table.insert().values(**table_data)
            conn.execute(ins)

def uuid_generate_v3(name, namespace=uuid.NAMESPACE_OID):
    """generate a version 3 UUID from namespace and name"""
    assert isinstance(name, str), "name needs to be a string"
    assert isinstance(namespace, uuid.UUID), "namespace needs to be a uuid.UUID"
    return str(uuid.uuid3(namespace, name))

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

    GHGRP_EPA = Table("GHGRP_EPA", metadata_obj, autoload_with=engine)
    fields = [col.name for col in GHGRP_EPA.columns]

    for year in years_to_files.keys():
        logging.info(f"Year: {year}")

        year_files = years_to_files.get(year)

        for file in year_files:
            logging.info(f"File: {file}")
            filename = Path(file).stem
            df = load_direct_emitters_from_zip(zip_file, file)
            print(f'Working on: {file}')
            
            # preproccesing data
            df = restructure(df)
            df = nan_to_zero(df)
            max_column = max_col_name(df)
            df = assign_value_to_max_col(df, max_column)
            df = format_change(df)
            df['final_industry'] = df['Industry Type (sectors)'].apply(lambda x: count_words(x))
            df = assign_gpc_ref_no(df)
            df = add_geometry(df)
            
            # insert proccess
            for _, row in df.iterrows():
                record = row.to_dict()
                
                # metric tonnes to kg
                record['emissions_quantity'] == record['emissions_quantity']*1000
                
                # get the locode and coordinate points
                locode = lat_lon_to_locode(session, record['Latitude'], record['Longitude'])

                # add keys filename and reno to record
                record["locode"] = locode
                record["filename"] = filename
                record["gas"] = 'CO2e'
                record["year"] = year
                record['units'] = 'kg'
                record['GWP_ref'] = 'AR4'

                id_string = (
                    record["filename"]
                    +record["gas"]
                    +record["geometry"]
                )
                record["id"] = uuid_generate_v3(id_string)

                table_data = {
                    key: record.get(key) for key in record.keys() if key in fields
                }

                insert_record(engine, GHGRP_EPA, "id", table_data)

    logging.info("Done!")
    session.close()