from db.database import SessionLocal
from fastapi import HTTPException, APIRouter
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text, and_
import json
from models.osm import Osm
from decimal import Decimal
from shapely.geometry import Point, shape, Polygon, MultiPolygon
from shapely.wkt import loads
from functools import partial
from shapely.ops import transform
import math
from pyproj import Transformer

api_router = APIRouter(prefix="/api/v0")


# Extract the polygon by locode
def db_query(locode):
    """
        Query the database to retrieve OSM data for a given locode.

        Args:
            locode (str): The location code to filter by.

        Returns:
            Osm: The queried row from the OSM table matching the locode.
    """
    row = None

    with SessionLocal() as session:
        row = session.query(Osm).filter(Osm.locode == locode).limit(1).first()

    return row

def epsg_code(polygon):
    """
        Calculate the UTM zone and corresponding EPSG code for a polygon.

        Args:
            polygon (shapely Polygon): The polygon to calculate UTM code for.

        Returns:
            int: EPSG code for the latitude and longitudeof the polygon's centroid.
    """
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

def transform_geometry(geometry, transformer):
    """
        Transform a polygon's coordinates using a given transformer.

        Args:
            geometry (Polygon or MultiPolygon): The geometry to transform.
            transformer (Transformer): The transformation object to apply.

        Returns:
            Polygon or MultiPolygon: Transformed geometry in UTM projection.
    """
    if isinstance(geometry, Polygon):
        transformed_polygon = []
        for lat, lon in geometry.exterior.coords:
            x, y = transformer.transform(lon, lat)
            transformed_polygon.append((x, y))
        return Polygon(transformed_polygon)
    elif isinstance(geometry, MultiPolygon):
        transformed_polygons = []
        for polygon in geometry.geoms:
            transformed_polygon = transform_geometry(polygon, transformer)
            transformed_polygons.append(transformed_polygon)
        return MultiPolygon(transformed_polygons)
    else:
        raise ValueError("Unsupported geometry type")

def get_area(geometry):
    """
        Calculate the area of a geometry object in square kilometers.

        Args:
            geometry (str): WKT formatted string of the geometry.

        Returns:
            float: Area in square kilometers.
    """
    polygon = loads(geometry)

    transformer = Transformer.from_crs("epsg:4326", f'epsg:5070')

    utm_polygon = transform_geometry(polygon, transformer)

    area = utm_polygon.area / 10.0**6 # in km^2

    return area

@api_router.get("/cityboundary/city/{locode}", summary="Get city boundary and area")
def get_city_boundary(locode: str):
    """
        Retrieve the boundary and area of a city by its locode.

        Args:
            locode (str): Unique identifier for the city.

        Returns:
            dict: City boundary information including geometry, bounding boxes, and area.
    """
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

@api_router.get("/cityboundary/city/{locode}/area", summary="Get city area")
def get_city_area(locode: str):
    """
        Retrieve the area of a city by its locode.

        Args:
            locode (str): Unique identifier for the city.

        Returns:
            dict: City area in square kilometers.
        """
    city = db_query(locode)

    if not city:
        raise HTTPException(status_code=404, detail="City boundary not found")

    area = get_area(city.geometry)

    return {
        "area": area
    }

@api_router.get("/cityboundary/locode/{lat}/{lon}", summary="Get city by coordinates")
def get_locode(lat: Decimal, lon: Decimal):
    """
        Find the locode(s) of the city(ies) that contain given coordinates.

        Args:
            lat (Decimal): Latitude of the point.
            lon (Decimal): Longitude of the point.

        Returns:
            dict: A list of locodes for the cities containing the given point.
    """

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
