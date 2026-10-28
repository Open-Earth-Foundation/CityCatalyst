from fastapi import APIRouter, HTTPException
from sqlalchemy import text
from db.database import SessionLocal

api_router = APIRouter(prefix="/api/v0")

@api_router.get("/formula_input/formulainput_datasource", summary="Get formula input values datasource mappings (IPCC only)")
def get_ipcc_formulainput_mappings():
    """
    Retrieve formula input values datasource mappings where publisher_name = 'IPCC'.
    Returns a JSON object with a list of mappings under the key 'formula_input_datasource'.
    """
    with SessionLocal() as session:
        query = text(
            """
            SELECT DISTINCT 
                a.dataset_id, 
                b.formula_input_id
            FROM modelled.publisher_datasource a
            INNER JOIN modelled.formula_input b
            ON a.publisher_id = b.publisher_id 
            WHERE publisher_name = 'IPCC'
            """
        )
        result = session.execute(query).mappings().all()

    if not result:
        raise HTTPException(status_code=404, detail="No data available")

    mappings = [
        {
            "datasource_id": row["dataset_id"],
            "formula_input_id": row["formula_input_id"]
        }
        for row in result
    ]

    return {"formula_input_datasource": mappings} 