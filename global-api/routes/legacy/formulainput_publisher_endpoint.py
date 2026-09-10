from fastapi import APIRouter, HTTPException
from sqlalchemy import text
from db.database import SessionLocal

api_router = APIRouter(prefix="/api/v0")

@api_router.get("/formula_input/publisher", summary="Get formula input values datasources (IPCC only)")
def get_emissionfactor_publishers():
    """
    Retrieve the formula input values publishers where publisher_name = 'IPCC'.
    Returns a JSON object with a list of publishers under the key 'formula_input_publisher'.
    """
    with SessionLocal() as session:
        query = text(
            """
            SELECT DISTINCT 
                a.publisher_name, 
                a.publisher_url, 
                a.publisher_id
            FROM modelled.publisher_datasource a
            INNER JOIN modelled.formula_input b
            ON a.publisher_id = b.publisher_id 
            AND a.dataset_id = b.dataset_id
            WHERE publisher_name = 'IPCC'
            """
        )
        result = session.execute(query).mappings().all()

    if not result:
        raise HTTPException(status_code=404, detail="No data available")

    publishers = [
        {
            "name": row["publisher_name"],
            "URL": row["publisher_url"],
            "publisher_id": row["publisher_id"]
        }
        for row in result
    ]

    return {"formula_input_publisher": publishers} 