from decimal import Decimal
from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from db.database import SessionLocal

api_router = APIRouter(prefix="/api/v1")


def _normalize_population_value(value):
    if isinstance(value, Decimal):
        if value == value.to_integral_value():
            return int(value)
        return float(value)
    return value


def db_population_by_actor(actor_id: str):
    with SessionLocal() as session:
        query = text(
            """
            SELECT
                p.actor_id,
                p.year,
                p.population_value,
                p.population_source,
                pd.datasource_name,
                pd.dataset_name,
                pd.dataset_url,
                pd.publisher_name
            FROM modelled.population p
            JOIN modelled.publisher_datasource pd
              ON p.publisher_id = pd.publisher_id
             AND p.dataset_id = pd.dataset_id
            WHERE p.actor_id = :actor_id
            ORDER BY p.year DESC;
            """
        )

        result = session.execute(query, {"actor_id": actor_id}).mappings().all()

    return result


@api_router.get("/population/{actor_id}", summary="Get population history by actor ID")
def get_population_by_actor(actor_id: str):
    records = db_population_by_actor(actor_id)

    if not records:
        raise HTTPException(status_code=404, detail="No data available")

    response = {
        "actor_id": records[0]["actor_id"],
        "population": [],
    }

    for record in records:
        response["population"].append(
            {
                "year": record["year"],
                "population": _normalize_population_value(record["population_value"]),
                "datasource": {
                    "publisher_name": record["publisher_name"],
                    "datasource_name": record["datasource_name"],
                    "dataset": record["dataset_name"],
                    "url": record["dataset_url"],
                },
                "source_type": record["population_source"],
            }
        )

    return response
