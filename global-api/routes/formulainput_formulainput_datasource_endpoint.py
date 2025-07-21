from fastapi import APIRouter, HTTPException
from sqlalchemy import text
from db.database import SessionLocal

api_router = APIRouter(prefix="/api/v0")

@api_router.get("/formula_input/formulainput_datasource", summary="Get formula input values datasource mappings (IPCC only)")
def get_ipcc_formulainput_mappings():
    """
    Retrieve formula input values datasource mappings where publisher_name = 'IPCC'.
    Returns a JSON object with a list of mappings under the key 'formulainput_datasource'.
    """
    with SessionLocal() as session:
        query = text(
            """
            select  distinct a.dataset_id, 
                            b.formula_input_id
            from modelled.publisher_datasource a
            inner join modelled.formula_input b
            on a.publisher_id = b.publisher_id 
            where publisher_name = 'IPCC'
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

    return {"formulainput_datasource": mappings} 