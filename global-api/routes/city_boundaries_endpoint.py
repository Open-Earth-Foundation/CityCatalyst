from db.database import SessionLocal
from fastapi import HTTPException, APIRouter
from sqlalchemy import text
from decimal import Decimal

api_router = APIRouter(prefix="/api/v0")

# Extract the polygon by locode
def db_query(locode):
    """
        Query the database to retrieve city polygon data for a given locode.

        Args:
            locode (str): The location code to filter by.

        Returns:
            dict: The queried row from the modelled.city_polygon table matching the locode.
    """
    row = None

    with SessionLocal() as session:
        query = text(f"""
            SELECT 	city_name, 
                    country_code, 
                    region_code, 
                    locode,
                    geometry,
                    ST_AsText(geometry) as city_geometry,
                    bbox_north,
                    bbox_south,
                    bbox_east,
                    bbox_west,
                    ST_Area(ST_Transform(geometry, 5070)) / 1000000 AS area_km2
            FROM modelled.city_polygon
            WHERE locode = :locode
            LIMIT 1
        """)
        params = {
            "locode": locode
        }
        result = session.execute(query, params).fetchone()
        
        if result:
            # Convert to dictionary for easier access
            row = dict(result._mapping)

    return row


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

    return {
        "city_geometry": city["city_geometry"],
        "bbox_north": city["bbox_north"],
        "bbox_south": city["bbox_south"],
        "bbox_east": city["bbox_east"],
        "bbox_west": city["bbox_west"],
        "area": city["area_km2"]
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

    return {
        "area": city["area_km2"]
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
        query = text(f"""
            SELECT locode
            FROM modelled.city_polygon
            WHERE bbox_north >= :lat
                AND bbox_south <= :lat
                AND bbox_east >= :lon
                AND bbox_west <= :lon
                AND ST_Intersects(geometry, ST_SetSRID(ST_Point(:lon, :lat), 4326))
        """)
        
        result = session.execute(query, {"lat": lat, "lon": lon})
        candidates = result.fetchall()

    # Convert candidates to list of locodes
    matches = [candidate.locode for candidate in candidates]

    # Return the list; can be empty
    return {
        "locodes": matches
    }
