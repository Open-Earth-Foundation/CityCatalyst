# import EDGAR grid cells into database
# Note: run this script first
# >> python gridcelledgar_importer.py --database-uri DB_URI
# author: L. Gloege
# created: 2023-09-28

import argparse
from datetime import datetime
import os
from shapely.geometry import Polygon
from sqlalchemy import create_engine, MetaData, Table
from tqdm import tqdm
from utils import (
    area_of_polygon,
    create_grid_cell_coords,
    get_edgar,
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
    ds = get_edgar(sector="ENE", gas="CH4", year=2021)

    engine = create_engine(args.database_uri)
    metadata_obj = MetaData()

    table = Table("GridCellEdgar", metadata_obj, autoload_with=engine)

    lats = ds.lat.values
    lons = ds.lon.values

    lat_res = 0.1  # degrees
    lon_res = 0.1  # degrees

    for lat in tqdm(lats):
        for lon in lons:
            coords = create_grid_cell_coords(
                lat=lat, lon=lon, lon_res=lon_res, lat_res=lat_res
            )

            polygon = Polygon(coords)

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
