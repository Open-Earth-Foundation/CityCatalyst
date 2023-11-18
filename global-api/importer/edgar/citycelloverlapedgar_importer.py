# import EDGAR city data into database
# >> python citycelloverlapedgar_importer.py --database-uri DB_URI
# author: L. Gloege
# created: 2023-09-28

import argparse
from datetime import datetime
import os
from sqlalchemy import create_engine, MetaData, Table
from sqlalchemy.orm import sessionmaker
from utils import (
    all_locodes_and_geometries_generator,
    area_of_polygon,
    create_grid_cell_coords,
    insert_record,
    load_wkt,
    uuid_generate_v3,
)
from shapely.geometry import Polygon
import logging

logging.basicConfig(level=logging.INFO)

logger = logging.getLogger(__name__)
logger.debug('This is a debug message')

# EDGAR grid resolution
lon_res = 0.1  # degrees
lat_res = 0.1  # degrees

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--database_uri",
        help="database URI (e.g. postgresql://ccglobal:@localhost/ccglobal)",
        default=os.environ.get("DB_URI"),
    )
    args = parser.parse_args()

    logger.info(f"Connecting to database")
    engine = create_engine(args.database_uri)
    metadata_obj = MetaData()
    Session = sessionmaker(bind=engine)
    session = Session()

    table = Table("CityCellOverlapEdgar", metadata_obj, autoload_with=engine)

    logger.info(f"Running query")

    results_generator = all_locodes_and_geometries_generator(session)

    logger.info(f"Query done")

    count = 0

    for row in results_generator:
        count = count + 1
        locode, boundary_str, west, south, east, north = row
        logger.info(f"{count}: Locode: {locode}")
        boundary_polygon = load_wkt(boundary_str)
        city_area = area_of_polygon(boundary_polygon)
        logger.info(f"City area: {city_area}")

        # add padding to ensure we get edge cells
        bbox_north = north + lat_res
        bbox_south = south - lat_res
        bbox_east = east + lon_res
        bbox_west = west - lon_res

        logger.info(f"Bounding box: {bbox_north, bbox_south, bbox_east, bbox_west}")

        total_intersection_area = 0

        for lat in range(round(bbox_south * 10), round(bbox_north * 10) + 1):
            for lon in range(round(bbox_west * 10), round(bbox_east * 10) + 1):
                logger.info(f"Cell: {lat, lon}")
                coords = create_grid_cell_coords(
                    lat=lat/10.0,
                    lon=lon/10.0,
                    lon_res=lon_res,
                    lat_res=lat_res
                )
                polygon = Polygon(coords)
                cell = load_wkt(polygon.wkt)
                intersection_polygon = cell.intersection(boundary_polygon)
                cell_area = area_of_polygon(cell)
                intersection_area = area_of_polygon(intersection_polygon)

                logger.info(f"Intersection area: {intersection_area}")

                total_intersection_area = total_intersection_area + intersection_area

                if intersection_area > 0:
                    fraction_in_city = intersection_area / cell_area

                    logger.info(f"fraction in city: {fraction_in_city}")

                    overlap = {
                        "id": uuid_generate_v3(f'{locode}_{lat}_{lon}'),
                        "locode": locode,
                        "fraction_in_city": fraction_in_city,
                        "cell_lat": lat,
                        "cell_lon": lon,
                        "created_date": str(datetime.now()),
                    }

                    insert_record(engine, table, "id", overlap)

        logger.info(f"Total intersection area: {total_intersection_area}")
        logger.info(f"City area percent in intersections: {(total_intersection_area/city_area)*100.0}")

    logger.info(f"Total count: {count}")

    session.close()
