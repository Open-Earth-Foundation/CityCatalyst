#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Created on Fri Sep 29 16:43:02 2023

@author: maureenfonseca
"""

# import Crosswalk Labs grid data into database
# >> python crosswalk_grid_importer.py --database-uri DB_URI


import argparse
from datetime import datetime
import os
from sqlalchemy import create_engine, MetaData, Table
from tqdm import tqdm
from utils import (
    area_of_polygon,
    bounding_coords,
    polygon_from_coords,
    get_crosswalk,
    insert_record,
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

    # load any file, just want the grid
    ds = get_crosswalk('US', 'airport', 'hi')

    engine = create_engine(args.database_uri)
    metadata_obj = MetaData()

    table = Table("crosswalk_GridCell", metadata_obj, autoload_with=engine)

    lats = ds.lat.values
    lons = ds.lon.values
    
    for lat_row in tqdm(lats):
        for lat in lat_row:
            for lon_row in lons:
                for lon in lon_row:

                    coords_dict = bounding_coords(
                        lat_center=lat, lon_center=lon, distance_m=500
                        )

                    polygon = polygon_from_coords(**coords_dict)

                    area = area_of_polygon(polygon)
                    cell_id = uuid_generate_v3(polygon.wkt)

                    record = {
                        "id": cell_id,
                        "lat_center": round(float(lat), 2),
                        "lon_center": round(float(lon), 2),
                        "geometry": polygon.wkt,
                        "area": round(area),
                        "created_date": str(datetime.now()),
                        }

                insert_record(engine, table, "id", record)