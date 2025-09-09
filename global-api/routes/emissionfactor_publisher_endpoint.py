from fastapi import APIRouter, HTTPException
from sqlalchemy import text
from db.database import SessionLocal

api_router = APIRouter(prefix="/api/v0")

@api_router.get("/emissions_factor/publisher", summary="Get emission factor publishers (IPCC only)")
def get_emissionfactor_publishers():
    """
    Retrieve emission factor publishers where publisher_name = 'IPCC'.
    Returns a JSON object with a list of publishers under the key 'emissionfactor_publisher'.
    """
    with SessionLocal() as session:
        query = text(
            """
            select distinct a.publisher_name, a.publisher_url, a.publisher_id
            from modelled.publisher_datasource a
            inner join modelled.emissions_factor b
            on a.publisher_id = b.publisher_id 
            and a.dataset_id = b.dataset_id
            where publisher_name = 'IPCC'
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

    return {"emissions_factor_publisher": publishers} 