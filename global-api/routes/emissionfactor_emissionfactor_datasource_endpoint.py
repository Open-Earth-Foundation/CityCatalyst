from fastapi import APIRouter, HTTPException
from sqlalchemy import text
from db.database import SessionLocal

api_router = APIRouter(prefix="/api/v0")

@api_router.get("/emissions_factor/emissionfactor_datasource", summary="Get emission factor datasource mappings (IPCC only)")
def get_ipcc_emission_mappings():
    """
    Retrieve emission factor datasource mappings where publisher_name = 'IPCC'.
    Returns a JSON object with a list of mappings under the key 'emissionfactor_datasource'.
    """
    with SessionLocal() as session:
        query = text(
            """
            select  distinct a.dataset_id, 
                            b.emissionfactor_id
            from modelled.publisher_datasource a
            inner join modelled.emissions_factor b
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
            "emissions_factor_id": row["emissionfactor_id"]
        }
        for row in result
    ]

    return {"emissionfactor_datasource": mappings} 