import argparse
import csv
from functools import wraps
from io import StringIO
import logging
import osmnx as ox
from pathlib import Path
import requests
import time

def osmid_generator(fl: str):
    """create a generator to loop over rows in {fl}

    parameters
    -----------
    fl: str
        the path to CSV file you want to loop over
        default: https://github.com/Open-Earth-Foundation/locode-to-osmid/blob/main/locode_to_osmid.csv?raw=true)

    returns
    --------
    generator with dictionary with locode and osmid

    example
    --------
    fl = "https://github.com/Open-Earth-Foundation/locode-to-osmid/blob/main/locode_to_osmid.csv?raw=true"
    dic_generator = osmid_generator(fl)
    for dic in dic_generator:
        print(dic)
    """
    if fl.startswith("http"):
        response = requests.get(fl)
        csv_data = StringIO(response.text)
        csv_reader = csv.DictReader(csv_data)
        for row in csv_reader:
            yield {"locode": row["locode"], "osmid": row["osmid"]}
    else:
        with open(fl, "r") as csv_data:
            csv_reader = csv.DictReader(csv_data)
            for row in csv_reader:
                yield {"locode": row["locode"], "osmid": row["osmid"]}


def logger(func):
    """logging decorator"""

    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            logging.error(f"Error in {func.__name__}: {e}")
            raise

    return wrapper


@logger
def osmid_to_geometry(osmid: str):
    """gets geometry for osmid and saves to csv file

    parameters
    -----------
    osmid: str (default: None)
        the OSM ID you want to retrieve the geometry for

    returns
    --------
    df: pd.DataFrame
        pandas dataframe with geometry

    example
    --------
    osmid = 'N728422419'
    df = osmid_to_geometry(osmid=osmid)
    """
    return ox.geocode_to_gdf(osmid, by_osmid=True)


if __name__ == "__main__":
    url = "https://github.com/Open-Earth-Foundation/locode-to-osmid/blob/main/locode_to_osmid.csv?raw=true"
    parser = argparse.ArgumentParser()
    parser.add_argument("--input_file", help="path to osmid_to_locode csv", default=url)
    parser.add_argument("--output_dir", help="output_directory", default="./")
    parser.add_argument(
        "--log_file", help="path to log file", default="progress_osmid_to_geometry.log"
    )
    args = parser.parse_args()

    logging.basicConfig(
        filename=args.log_file,
        level=logging.INFO,
        format="%(asctime)s - %(levelname)s - %(message)s",
    )

    dic_generator = osmid_generator(fl=args.input_file)

    row_number = 0
    for dic in dic_generator:
        time.sleep(1)
        row_number = row_number + 1
        osmid = dic["osmid"]
        locode = dic["locode"]

        if osmid.startswith("R") or osmid.startswith("W"):
            logging.info(
                f"Processing: row number = {row_number}, locode={locode}, osmid={osmid}"
            )
            df = osmid_to_geometry(osmid=osmid)
            df["locode"] = locode

            output_file = Path(args.output_dir) / f"{osmid}_geometry.csv"
            df.to_csv(output_file, index=False)
        else:
            logging.info(
                f"Skipped: row number = {row_number}, locode={locode}, osmid={osmid}"
            )

    logging.info(f"Done!")
