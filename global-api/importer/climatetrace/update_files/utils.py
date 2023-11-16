import csv
import requests

from sqlalchemy import create_engine, MetaData, text
from sqlalchemy.orm import sessionmaker

def dict_to_csv(filename, rows):
    if isinstance(rows, dict):
        rows = [rows]

    with open(filename, mode="w") as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)

def osmid_from_nominatim(lat: float, lon: float, email: str):
    """reverse geocode a lat lon location
    Parameters
    ----------
    lat: float (default: None)
        latitude point
    lon: float (default: None)
        longitude point
    email: str (default: None)
        if you are making a large number of requests
        please include an appropriate email address to identify your requests.
        See [Nominatim's Usage Policy](https://operations.osmfoundation.org/policies/nominatim/)

    Returns
    -------
    response : dict
        output response as dictionary

    Example
    -------
    response = nominatim_reverse(lon=-53.559279, lat=-31.513208')
    """
    ENDPOINT = "https://nominatim.openstreetmap.org/reverse"

    params = {
        'lat': lat,
        'lon': lon,
        'format': "json", # either [xml|json|jsonv2|geojson|geocodejson]
        'accept-language': "en",
        'zoom': 10, # see https://nominatim.org/release-docs/develop/api/Reverse/
        'email': email
    }

    response = requests.get(ENDPOINT, params=params).json()
    return response.get('osm_id')


def osmid_to_locode(csv_file):
    osmid_to_locode = {}

    with open(csv_file, mode='r') as file:
        reader = csv.DictReader(file)
        for row in reader:
            # ignore the first character
            osmid_to_locode[row['osmid'][1:]] = row['locode']

        return osmid_to_locode


def lat_lon_generator(session):
    query = text(
        """
        SELECT DISTINCT lat, lon
        FROM asset
        WHERE (
            reference_number LIKE 'I.%'
            OR reference_number LIKE 'II.%'
            OR reference_number LIKE 'III.%'
        )
        AND locode IS NULL
        AND (lat IS NOT NULL OR lon IS NOT NULL);
        """
    )

    result = session.execute(query).fetchall()

    for row in result:
        yield row.lat, row.lon