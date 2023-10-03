#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Created on Fri Sep 29 16:44:16 2023

@author: maureenfonseca

"""

#import Crosswalk Labs city data into database
#>> python crosswalk_city_data_importer.py --database-uri DB_URI 

import argparse
from datetime import datetime
import os
import pandas as pd
from sqlalchemy import create_engine, MetaData, Table
from sqlalchemy.orm import sessionmaker
from tqdm import tqdm
from utils import (
    all_locodes_and_geometries,
    area_of_polygon,
    bounds_from_polygon,
    get_crosswalk_grid_coords_and_wkt,
    insert_record,
    load_wkt,
    uuid_generate_v3,
)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--database_uri",
        help="database URI (e.g. postgresql://ccglobal:@localhost/ccglobal)",
        default=os.environ.get("DB_URI"),
    )
    args = parser.parse_args()

    engine = create_engine(args.database_uri)
    metadata_obj = MetaData()
    Session = sessionmaker(bind=engine)
    session = Session()

    list_grid_coords = get_crosswalk_grid_coords_and_wkt(session)
    df_grid = (
        pd.DataFrame(list_grid_coords)
        .rename(columns={"id": "grid_id"})
        .astype({"grid_id": str})
    )

    table = Table("crosswalk_CityGridOverlap", metadata_obj, autoload_with=engine)

    lon_res = 0.05
    lat_res = 0.05

    results = all_locodes_and_geometries(session)

    for row in tqdm(results):
        locode = row.locode
        boundary_str = row.geometry
        boundary_polygon = load_wkt(boundary_str)
        west, south, east, north = bounds_from_polygon(boundary_polygon)

        # add padding to ensure we get edge cells
        bbox_north = north + lat_res
        bbox_south = south - lat_res
        bbox_east = east + lon_res
        bbox_west = west - lon_res

        # filter for coords
        filt = (
            (df_grid["lat_center"] >= bbox_south)
            & (df_grid["lat_center"] <= bbox_north)
            & (df_grid["lon_center"] >= bbox_west)
            & (df_grid["lon_center"] <= bbox_east)
        )
        df_tmp = df_grid.loc[filt]
        geoms = df_tmp.to_dict(orient="records")

        for row in geoms:
            cell_id = str(row.get("grid_id"))
            cell_wkt = row.get("geometry")

            record_id = uuid_generate_v3(locode + cell_id)

            cell = load_wkt(cell_wkt)
            intersection_polygon = cell.intersection(boundary_polygon)
            cell_area = area_of_polygon(cell)
            intersection_area = area_of_polygon(intersection_polygon)

            if intersection_area > 0:
                fraction_in_city = intersection_area / cell_area

                record = {
                    "id": record_id,
                    "locode": locode,
                    "fraction_in_city": fraction_in_city,
                    "grid_id": cell_id,
                    "created_date": str(datetime.now()),
                }

                insert_record(engine, table, "id", record)

    session.close()