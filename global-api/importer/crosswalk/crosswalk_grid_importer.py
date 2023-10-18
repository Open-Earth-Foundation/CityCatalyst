#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# import Crosswalk Labs grid data into database
# >> python crosswalk_grid_importer.py --database_uri DB_URI


import argparse
from datetime import datetime
import os
from sqlalchemy import create_engine, MetaData, Table
from tqdm import tqdm
from utils import (
    area_of_polygon,
    bounding_coords,
    polygon_from_coords,
    tds_catalog,
    tds_generator,
    get_dataset_url,
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
    
    # create TDS catalog
    url = "https://thredds.daac.ornl.gov/thredds/catalog/ornldaac/1741/catalog.xml"
    catalog = tds_catalog(url)
    
    # lists all the datasets in the catalog
    gen = tds_generator(catalog)
    datasets = [fl for fl in gen]

    # load any file, just want the grid
    keywords = ['US', 'airport']
    datasets_filtered = [dataset for dataset in datasets if dataset.endswith('_hi.nc4') and all(keyword in dataset for keyword in keywords)]
    
    # read dataset_url
    dataset_url = get_dataset_url(catalog, datasets_filtered[0])
    
    # read the file
    ds = xr.open_dataset(dataset_url)

    engine = create_engine(args.database_uri)
    metadata_obj = MetaData()

    table = Table("crosswalk_GridCell", metadata_obj, autoload_with=engine)

    lats = ds.lat.values.flatten()
    lons = ds.lon.values.flatten()
    
    assert len(lats) == len(lons)
    
    for lat, lon in zip(lats, lons):
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