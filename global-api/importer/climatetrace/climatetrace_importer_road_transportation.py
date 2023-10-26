import argparse
import io
import logging
import math
import os
import pandas as pd
from pathlib import Path
from shapely import wkt
from shapely.geometry import Point
from shapely.wkt import loads
from sqlalchemy import create_engine, MetaData, Table, text
from sqlalchemy.orm import sessionmaker
import tarfile
import uuid
from lat_lon_to_locode import point_to_lat_lon, lat_lon_to_locode


refno_to_assets = {
    "II.1.1": ["./transportation/asset_road-transportation_emissions.csv"],
}


def lat_lon_inside_wkt(lat, lon, wkt):
    """test if lat lon is inside a WKT geometry

    Parameters
    ----------
    lat: float
        latitude value
    lon: float
        longitude value
    wkt: str
        geometry in well-known-text format

    Returns
    -------
    is_inside: bool
        boolean value indicating whether lat, lon is inside the WKT
    """
    point = Point(lon, lat)
    geometry = loads(wkt)
    return point.within(geometry)


def point_inside_wkt(point, wkt):
    """test if Point is inside a WKT geometry

    Parameters
    ----------
    point: str
        geojson point
    wkt: str
        geometry in well-known-text format

    Returns
    -------
    is_inside: bool
        boolean value indicating whether Point is inside the WKT
    """
    dic = point_to_lat_lon(point)
    lat, lon = dic["lat"], dic["lon"]
    return lat_lon_inside_wkt(lat, lon, wkt)


def lat_lon_inside_wkt(lat, lon, wkt):
    """test if lat lon is inside a WKT geometry

    Parameters
    ----------
    lat: float
        latitude value
    lon: float
        longitude value
    wkt: str
        geometry in well-known-text format

    Returns
    -------
    is_inside: bool
        boolean value indicating whether lat, lon is inside the WKT
    """
    point = Point(lon, lat)
    geometry = loads(wkt)
    return point.within(geometry)


def point_inside_wkt(point, wkt):
    """test if Point is inside a WKT geometry

    Parameters
    ----------
    point: str
        geojson point
    wkt: str
        geometry in well-known-text format

    Returns
    -------
    is_inside: bool
        boolean value indicating whether Point is inside the WKT
    """
    dic = point_to_lat_lon(point)
    lat, lon = dic["lat"], dic["lon"]
    return lat_lon_inside_wkt(lat, lon, wkt)


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


def climatetrace_file_names(file: str) -> list:
    with tarfile.open(file, "r:gz") as tar:
        return tar.getnames()


def load_climatetrace_file(file: str, path: str):
    """load climatetrace file as pandas dataframe"""
    with tarfile.open(file, "r:gz") as tar:
        with tar.extractfile(path) as f:
            return pd.read_csv(io.TextIOWrapper(f, encoding="utf-8"))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--database_uri",
        help="database URI (e.g. postgresql://ccglobal:@localhost/ccglobal)",
        default=os.environ.get("DB_URI"),
    )
    parser.add_argument("--file", help="path to gzipped climatetrace file")
    parser.add_argument(
        "--log_file", help="path to log file", default="./climatetrace_importer.log"
    )
    args = parser.parse_args()

    tar_file = Path(os.path.abspath(args.file))

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

    for refno in refno_to_assets.keys():
        logging.info(f"Reference number: {refno}")

        asset_files = refno_to_assets.get(refno)

        for file in asset_files:
            logging.info(f"File: {file}")
            filename = Path(file).stem

            df = load_climatetrace_file(tar_file, file)

            locode_list = []
            for _, row in df[["asset_name", "st_astext"]].drop_duplicates().iterrows():
                city = row.asset_name
                poly = wkt.loads(row.st_astext)

                lon = poly.centroid.x
                lat = poly.centroid.y

                locode = lat_lon_to_locode(session, lat, lon)
                locode_list.append(
                    {"asset_name": city, "st_astext": row.st_astext, "locode": locode}
                )

            df_locode = pd.DataFrame(locode_list)
            df_merged = df.merge(df_locode, on=["asset_name", "st_astext"])

            for _, row in df_merged.iterrows():
                record = row.to_dict()

                conditions = [
                    not_zero(record["emissions_quantity"]),
                ]

                if all(conditions):
                    # convert emissions from tonnes to kg
                    record["emissions_quantity"] *= TONNES_TO_KG
                    record["emissions_quantity_units"] = "kg"

                    # add keys filename and reno to record
                    record["filename"] = filename
                    record["reference_number"] = refno

                    id_string = (
                        record["filename"]
                        + record["start_time"]
                        + record["gas"]
                        + record["st_astext"]
                    )
                    record["id"] = uuid_generate_v3(id_string)

                    # remove keys with nan, none, and empty values
                    record = {
                        key: value
                        for key, value in record.items()
                        if not_nan_or_none(value)
                    }

                    table_data = {
                        key: record.get(key) for key in record.keys() if key in fields
                    }

                    logging.info(f"locode: {locode}")

                    insert_record(engine, asset, "id", table_data)

    logging.info("Done!")
    session.close()
