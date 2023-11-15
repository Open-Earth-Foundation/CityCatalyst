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
    insert_record,
    load_wkt,
    uuid_generate_v3,
    get_edgar_cells_in_bounds,
)
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
        logger.info(f"{count}: Locode: {row.locode}")
        locode = row.locode
        boundary_str = row.geometry
        boundary_polygon = load_wkt(boundary_str)
        west, south, east, north = row.bbox_west, row.bbox_south, row.bbox_east, row.bbox_north

        # add padding to ensure we get edge cells
        bbox_north = north + lat_res
        bbox_south = south - lat_res
        bbox_east = east + lon_res
        bbox_west = west - lon_res

        logger.info(f"Bounding box: {bbox_north, bbox_south, bbox_east, bbox_west}")
        records = get_edgar_cells_in_bounds(
            session, bbox_north, bbox_south, bbox_east, bbox_west
        )

        for record in records:
            cell_id = str(record.id)
            logger.info(f"Cell ID: {cell_id}")
            cell_wkt = record.geometry

            record_id = uuid_generate_v3(locode + cell_id)

            logger.info("Calculating overlap")
            cell = load_wkt(cell_wkt)
            intersection_polygon = cell.intersection(boundary_polygon)
            cell_area = area_of_polygon(cell)
            intersection_area = area_of_polygon(intersection_polygon)

            logger.info(f"Intersection area: {intersection_area}")

            if intersection_area > 0:
                fraction_in_city = intersection_area / cell_area

                overlap = {
                    "id": record_id,
                    "locode": locode,
                    "fraction_in_city": fraction_in_city,
                    "cell_id": cell_id,
                    "created_date": str(datetime.now()),
                }

                insert_record(engine, table, "id", overlap)

    logger.info(f"Running query")

    session.close()
