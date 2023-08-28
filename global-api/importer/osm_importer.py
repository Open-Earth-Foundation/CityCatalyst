# script to load OSM polygons into the database
# >> python osm_importer.py --database_uri DB_URI --log_file PATH_TO_LOGFILE
# by default, this will read the polygon data from a file on IPFS:
# https://ipfs.io/ipfs/QmVjaumaEr8aTyS48AzpsVvws7pT1kqXjLudYvqSCMt52r?filename=output.csv.gz

import argparse
import logging
import os
import pandas as pd
from pathlib import Path
from sqlalchemy import create_engine, insert, MetaData, Table


def record_generator(fl: str, compression: str = "infer"):
    """returns a generator for the csv file
    Note: I was getting the following error using csv.DictReader
    Error: field larger than field limit (131072)
    """
    df = pd.read_csv(fl, compression=compression)
    for _, row in df.iterrows():
        yield row.to_dict()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--database_uri",
        help="database URI (e.g. postgresql://ccglobal:@localhost/ccglobal)",
        default=os.environ.get("DB_URI"),
    )
    parser.add_argument(
        "--dir", help="path to directory with CSV files to import (optional)"
    )
    parser.add_argument(
        "--file",
        help="path to file you want to import (optional) (default: reads data from IPFS)",
    )
    parser.add_argument(
        "--log_file", help="path to log file", default="./osm_importer.log"
    )
    args = parser.parse_args()

    logging.basicConfig(
        filename=args.log_file,
        level=logging.INFO,
        format="%(asctime)s - %(levelname)s - %(message)s",
    )

    engine = create_engine(args.database_uri)
    metadata_obj = MetaData()

    osm = Table("osm", metadata_obj, autoload_with=engine)
    fields = [col.name for col in osm.columns]

    if args.file and args.dir:
        print("Error: --file and --dir can not be set at same time")
    elif args.file:
        file = Path(args.file).absolute()

        generator = record_generator(file)

        record_counter = 0
        for record in generator:
            record_counter += 1
            logging.info(f"Processing row num: {record_counter} in file: {file} ")

            record = {key: value for key, value in record.items() if value != ""}

            table_data = {
                key: record.get(key) for key in record.keys() if key in fields
            }

            primary_key_value = table_data.get("locode")

            with engine.begin() as conn:
                primary_key_exists = conn.execute(
                    osm.select().where(osm.c.locode == primary_key_value)
                ).fetchone()

                if not primary_key_exists:
                    ins = osm.insert().values(**table_data)
                    conn.execute(ins)

    elif args.dir:
        files = Path(args.dir).glob("*.csv")

        for file in files:
            generator = record_generator(file)

            record_counter = 0
            for record in generator:
                record_counter += 1
                logging.info(f"Processing row num: {record_counter} in file: {file} ")

                record = {key: value for key, value in record.items() if value != ""}

                table_data = {
                    key: record.get(key) for key in record.keys() if key in fields
                }

            primary_key_value = table_data.get("locode")

            with engine.begin() as conn:
                primary_key_exists = conn.execute(
                    osm.select().where(osm.c.locode == primary_key_value)
                ).fetchone()

                if not primary_key_exists:
                    ins = osm.insert().values(**table_data)
                    conn.execute(ins)
    else:
        # dataset created using importer/osmid_to_geometry.py
        # script was run by EP and output was stored on IPFS
        file = "https://ipfs.io/ipfs/QmVjaumaEr8aTyS48AzpsVvws7pT1kqXjLudYvqSCMt52r?filename=output.csv.gz"

        logging.info(
            f"Reading data from: {file} (may take about 30 seconds to read the data)"
        )

        generator = record_generator(file, compression="gzip")

        record_counter = 0
        for record in generator:
            record_counter += 1
            logging.info(f"Processing row num: {record_counter} in file: {file} ")

            record = {key: value for key, value in record.items() if value != ""}

            table_data = {
                key: record.get(key) for key in record.keys() if key in fields
            }

            primary_key_value = table_data.get("locode")

            with engine.begin() as conn:
                primary_key_exists = conn.execute(
                    osm.select().where(osm.c.locode == primary_key_value)
                ).fetchone()

                if not primary_key_exists:
                    ins = osm.insert().values(**table_data)
                    conn.execute(ins)

    logging.info(f"Done!")
