from db.database import SessionLocal
from fastapi import HTTPException, APIRouter
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text, and_
import json
from models.osm import Osm
from decimal import Decimal
from shapely.geometry import Point, shape
from shapely.wkt import loads
import pyproj
from functools import partial
from shapely.ops import transform
import math

api_router = APIRouter(prefix="/api/v0")


# Extract the polygon by locode
def db_query(locode):

    row = None

    with SessionLocal() as session:
        row = session.query(Osm).filter(Osm.locode == locode).limit(1).first()

    return row

def epsg_code(polygon):
    """Calculate the UTM zone and corresponding EPSG code for a polygon"""
    # Calculate centroid of the polygon
    centroid = polygon.centroid
    longitude = centroid.x
    latitude = centroid.y

    # Calculate UTM zone from centroid longitude
    zone_number = math.floor((longitude + 180) / 6) + 1

    # Determine the hemisphere and corresponding EPSG code
    if latitude >= 0:
        code = 32600 + zone_number
    else:
        code = 32700 + zone_number

    return code

def get_area(geometry):
    polygon = loads(geometry)
    code = epsg_code(polygon)

    proj = partial(
        pyproj.transform,
        pyproj.Proj("epsg:4326"), # lat/lon
        pyproj.Proj(f'epsg:{code}')
    )

    utm_polygon = transform(proj, polygon)
    area = utm_polygon.area / 10.0**6 # in km^2
    return area

@api_router.get("/cityboundary/city/{locode}")
def get_city_boundary(locode: str):
    city = db_query(locode)

    if not city:
        raise HTTPException(status_code=404, detail="City boundary not found")

    area = get_area(city.geometry)

    return {
        "city_geometry": city.geometry,
        "bbox_north": city.bbox_north,
        "bbox_south": city.bbox_south,
        "bbox_east": city.bbox_east,
        "bbox_west": city.bbox_west,
        "area": area
    }

@api_router.get("/cityboundary/city/{locode}/area")
def get_city_area(locode: str):
    city = db_query(locode)

    if not city:
        raise HTTPException(status_code=404, detail="City boundary not found")

    area = get_area(city.geometry)

    return {
        "area": area
    }

@api_router.get("/cityboundary/locode/{lat}/{lon}")
def get_locode(lat: Decimal, lon: Decimal):
    """Returns the locode(s) of the city(ies) that contains the given coordinates"""

    # Get candidate cities whose bounding box is around our point

    candidates = []

    with SessionLocal() as session:

        query = session.query(Osm).filter(
            and_(
                Osm.bbox_north >= lat,
                Osm.bbox_south <= lat,
                Osm.bbox_east >= lon,
                Osm.bbox_west <= lon
            )
        )

        candidates = query.all()

    # Filter the candidates by the point being within the city polygon

    point = Point(lon, lat)

    matches = filter(lambda x: point.within(loads(x.geometry)), candidates)

    # Extract the locodes from the Osm objects

    locodes = list(map(lambda x: x.locode, matches))

    # Return the list; can be empty

    return {
        "locodes": locodes
    }