from fastapi import APIRouter, HTTPException
from sqlalchemy import text
from db.database import SessionLocal

api_router = APIRouter(prefix="/api/v0")

@api_router.get("/formula_input/datasource", summary="Get formula input values datasources (IPCC only)")
def get_formulainput_datasources():
    """
    Retrieve the formula input values datasources where publisher_name = 'IPCC'.
    Returns a JSON object with a list of datasources under the key 'formulainput_datasource'.
    """
    with SessionLocal() as session:
        query = text(
            """
            select  distinct a.datasource_name,
                            a.dataset_name,
                            a.dataset_url,
                            a.publisher_id,
                            a.dataset_id
            from modelled.publisher_datasource a
            inner join modelled.formula_input b
            on a.publisher_id = b.publisher_id 
            where publisher_name = 'IPCC'
            """
        )
        result = session.execute(query).mappings().all()

    if not result:
        raise HTTPException(status_code=404, detail="No data available")

    datasources = [
        {
            "datasource_name": row["datasource_name"],
            "dataset_name": row["dataset_name"],
            "URL": row["dataset_url"],
            "publisher_id": row["publisher_id"],
            "datasource_id": row["dataset_id"]
        }
        for row in result
    ]

    return {"formula_input_datasource": datasources} 