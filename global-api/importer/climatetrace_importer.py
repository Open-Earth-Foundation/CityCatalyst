import argparse
import logging
import math
import os
import pandas as pd
from pathlib import Path
from sqlalchemy import create_engine, insert, MetaData, Table
from sqlalchemy.orm import sessionmaker
from lat_lon_to_locode import point_to_locode, point_to_lat_lon


def not_nan_or_none(value):
    """return true if value is not nan, none, or empty"""
    if isinstance(value, float | int):
        return not math.isnan(value)
    return value is not None and value != ""


def not_zero(value):
    """return true is value is not number or string 0"""
    return not (value == 0 or value == "0")


def record_generator(fl):
    """returns a generator for the csv file"""
    df = pd.read_csv(fl)
    for _, row in df.iterrows():
        yield row.to_dict()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--database_uri",
        help="database URI (e.g. postgresql://ccglobal:@localhost/ccglobal)",
        default=os.environ.get("DB_URI"),
    )
    parser.add_argument("--file", help="path to file to import")
    parser.add_argument("--refno", help="GPC reference number")
    parser.add_argument(
        "--log_file", help="path to log file", default="./climatetrace_importer.log"
    )
    args = parser.parse_args()

    TONNES_TO_KG = 1000  # 1 tonne == 1000 kg

    logging.basicConfig(
        filename=args.log_file,
        level=logging.INFO,
        format="%(asctime)s - %(levelname)s - %(message)s",
    )

    engine = create_engine(args.database_uri)
    metadata_obj = MetaData()
    Session = sessionmaker(bind=engine)
    session = Session()

    asset = Table("asset", metadata_obj, autoload_with=engine)
    fields = [col.name for col in asset.columns]

    fl = os.path.abspath(args.file)
    path = Path(fl)
    generator = record_generator(path)

    record_counter = 0
    for record in generator:
        record_counter = record_counter + 1
        logging.info(f"Processing row num: {record_counter}")

        if not_zero(record["emissions_quantity"]):
            # convert emissions from tonnes to kg
            record["emissions_quantity"] *= TONNES_TO_KG
            record["emissions_quantity_units"] = "kg"

            # get the locode and coordinate points
            locode = point_to_locode(session, record["st_astext"])
            coord_dic = point_to_lat_lon(record["st_astext"])
            lat, lon = coord_dic["lat"], coord_dic["lon"]

            # add keys filename and reno to record
            record["locode"] = locode
            record["lat"] = lat
            record["lon"] = lon
            record["filename"] = path.stem
            record["reference_number"] = args.refno

            # remove keys with nan, none, and empty values
            record = {
                key: value for key, value in record.items() if not_nan_or_none(value)
            }

            table_data = {
                key: record.get(key) for key in record.keys() if key in fields
            }
            ins = asset.insert().values(**table_data)

            with engine.begin() as conn:
                conn.execute(ins)

    logging.info("Done!")
    session.close()
