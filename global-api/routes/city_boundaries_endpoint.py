from db.database import SessionLocal
from fastapi import HTTPException, APIRouter
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
import json
from models.osm import Osm

api_router = APIRouter(prefix="/api/v0")


# Extract the polygon by locode
def db_query(locode):

    row = None

    with SessionLocal() as session:
        row = session.query(Osm).filter(Osm.locode == locode).limit(1).first()

    return row


@api_router.get("/cityboundary/city/{locode}")
def get_city_boundary(locode: str):
    city = db_query(locode)

    if not city:
        raise HTTPException(status_code=404, detail="City boundary not found")

    return {
        "city_geometry": city.geometry,
        "bbox_north": city.bbox_north,
        "bbox_south": city.bbox_south,
        "bbox_east": city.bbox_east,
        "bbox_west": city.bbox_west,
    }
