import argparse
import logging
import math
import os
import pandas as pd
from pathlib import Path
from sqlalchemy import create_engine, MetaData, Table
from sqlalchemy.orm import sessionmaker


def not_nan_or_none(value):
    """return true if value is not nan, none, or empty"""
    if isinstance(value, float | int):
        return not math.isnan(value)
    return value is not None and value != ""


def not_zero(value):
    """return true is value is not number or string 0"""
    return not (value == 0 or value == "0")


def can_map_sector_to_gpc(sector):
    """boolean if sector can accurately be mapped to GPC reference number"""
    sectors_with_high_confience = ["residential", "ground transport", "aviation"]
    return sector.lower() in sectors_with_high_confience


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


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--database_uri",
        help="database URI (e.g. postgresql://ccglobal:@localhost/ccglobal)",
        default=os.environ.get("DB_URI"),
    )
    parser.add_argument("--file", help="path to CSV file to import")
    parser.add_argument("--log_file", help="path to log file", default="./importer.log")
    args = parser.parse_args()

    logging.basicConfig(
        filename=args.log_file,
        level=logging.INFO,
        format="%(asctime)s - %(levelname)s - %(message)s",
    )

    engine = create_engine(args.database_uri)
    metadata_obj = MetaData()
    Session = sessionmaker(bind=engine)
    session = Session()

    table = Table("CarbonMonitor", metadata_obj, autoload_with=engine)
    fields = [col.name for col in table.columns]

    df = pd.read_csv(args.file)

    for _, row in df.iterrows():
        record = row.to_dict()

        conditions = [
            not_zero(record["emissions_quantity"]),
            can_map_sector_to_gpc(record["sector"]),
        ]

        if all(conditions):
            # remove keys with nan, none, and empty values
            record = {
                key: value for key, value in record.items() if not_nan_or_none(value)
            }

            table_data = {
                key: record.get(key) for key in record.keys() if key in fields
            }

            insert_record(engine, table, "id", table_data)

    logging.info("Done!")
    session.close()
