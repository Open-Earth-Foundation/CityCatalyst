from fastapi import APIRouter, HTTPException
from sqlalchemy import text
from db.database import SessionLocal
from typing import Dict, List, Union

api_router = APIRouter(prefix="/api/v0")

@api_router.get("/formula_input/methodology", summary="Get formula input values methodologies (IPCC only)")
def get_formulainput_methodologies() -> Dict[str, List[Dict[str, Union[int, str, None]]]]:
    """
    Retrieve formula input values methodologies where publisher_name = 'IPCC'.
    Returns a JSON object with a list of methodologies under the key 'formula_input_methodology'.
    """
    with SessionLocal() as session:
        query = text(
            """
            SELECT DISTINCT
                c.method_id, 
                c.methodology_name, 
                null as methodology_url, 
                a.dataset_id
            FROM modelled.publisher_datasource a
            INNER JOIN modelled.formula_input b
            ON a.publisher_id = b.publisher_id 
            AND a.dataset_id = b.dataset_id
            INNER JOIN modelled.ghgi_methodology c
            ON b.method_id = c.method_id
            WHERE publisher_name = 'IPCC'
            """
        )
        result = session.execute(query).mappings().all()

    if not result:
        raise HTTPException(status_code=404, detail="No data available")

    methodologies = [
        {
            "methodology_id": str(row["method_id"]),
            "methodology": str(row["methodology_name"]),
            "methodology_url": None,
            "datasource_id": str(row["dataset_id"])
        }
        for row in result
    ]

    return {"formula_input_methodology": methodologies}