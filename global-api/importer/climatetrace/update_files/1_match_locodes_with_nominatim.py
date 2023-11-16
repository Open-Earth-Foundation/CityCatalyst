import argparse
import os
from pathlib import Path

from sqlalchemy import create_engine, MetaData
from sqlalchemy.orm import sessionmaker

from utils import osmid_from_nominatim, osmid_to_locode, lat_lon_generator, dict_to_csv


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--database_uri",
        help="database URI (e.g. postgresql://ccglobal:@localhost/ccglobal)",
        default=os.environ.get("DB_URI"),
    )
    parser.add_argument("--file", help="path to locode_to_osmid.csv file")
    parser.add_argument("--dir", help="directory to store csv files")
    args = parser.parse_args()

    tmp_dir = Path(args.dir)
    tmp_dir.mkdir(parents=True, exist_ok=True)

    engine = create_engine(args.database_uri)
    metadata_obj = MetaData()
    Session = sessionmaker(bind=engine)

    osmid_dict = osmid_to_locode(args.file)

    counter = 0
    with Session() as session:
        for lat, lon in lat_lon_generator(session):
            counter += 1
            filename = tmp_dir / f"file_{counter}.csv"

            if not filename.exists():
                osmid = osmid_from_nominatim(
                    lat=lat, lon=lon, email="luke@openearth.org"
                )
                locode = osmid_dict.get(str(osmid), None)

                if locode:
                    output_dict = {"lat": lat, "lon": lon, "locode": locode}
                    dict_to_csv(filename, output_dict)
