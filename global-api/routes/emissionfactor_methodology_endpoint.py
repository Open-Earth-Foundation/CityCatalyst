from fastapi import APIRouter, HTTPException
from sqlalchemy import text
from db.database import SessionLocal
from typing import Dict, List, Union

api_router = APIRouter(prefix="/api/v0")

@api_router.get("/emissions_factor/methodology", summary="Get emission factor methodologies (IPCC only)")
def get_emissionfactor_methodologies() -> Dict[str, List[Dict[str, Union[int, str, None]]]]:
    """
    Retrieve emission factor methodologies where publisher_name = 'IPCC'.
    Returns a JSON object with a list of methodologies under the key 'emissionfactor_methodology'.
    """
    with SessionLocal() as session:
        query = text(
            """
            select distinct d.method_id, d.methodology_name, null as methodology_url, a.dataset_id
            from modelled.publisher_datasource a
            inner join modelled.emissions_factor b
            on a.publisher_id = b.publisher_id 
            and a.dataset_id = b.dataset_id
            inner join modelled.activity_subcategory c
            on b.activity_id = c.activity_id
            inner join modelled.ghgi_methodology d
            on c.gpcmethod_id = d.method_id
            where publisher_name = 'IPCC'
            """
        )
        result = session.execute(query).mappings().all()

    if not result:
        raise HTTPException(status_code=404, detail="No data available")

    methodologies = [
        {
            "methodology_id": row["method_id"],
            "methodology": row["methodology_name"],
            "methodology_url": None,
            "datasource_id": row["dataset_id"]
        }
        for row in result
    ]

    return {"emissionfactor_methodology": methodologies} 