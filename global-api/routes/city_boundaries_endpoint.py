from db.database import SessionLocal
from fastapi import HTTPException, APIRouter
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
import json

api_router = APIRouter(prefix="/api/v0")


# Extract the polygon by locode
def db_query(locode):
    with SessionLocal() as session:
        query = text("SELECT geometry FROM osm " + "WHERE locode = :locode ")
        result = session.execute(
            query,
            {"locode": locode},
        ).fetchone()

    return result[0] if result else None


@api_router.get("/cityboundary/city/{locode}")
def get_city_boundary(locode: str):
    city_geometry = db_query(locode)

    if not city_geometry:
        raise HTTPException(status_code=404, detail="City boundary not found")

    return {"city_geometry": city_geometry}
