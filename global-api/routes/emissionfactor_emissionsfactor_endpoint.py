from fastapi import APIRouter, HTTPException
from sqlalchemy import text
from db.database import SessionLocal

api_router = APIRouter(prefix="/api/v0")

@api_router.get("/emissions_factor/emissions_factor", summary="Get emission factors (IPCC only)")
def get_emissionfactors():
    """
    Retrieve emission factors where publisher_name = 'IPCC'.
    Returns a JSON object with a list of emission factors under the key 'emissionfactor'.
    """
    with SessionLocal() as session:
        query = text(
            """
            SELECT  
            b.gas_name, 
            NULL AS region, 
            b.unit_denominator, 
            NULL AS reference, 
            b.emissionfactor_value,
            d.gpc_reference_number,
            d.methodology_name,
            c.activity_subcategory_type ,
            b.actor_id,
            EXTRACT(YEAR FROM b.active_from) AS year,
            d.method_id,
            b.emissionfactor_id
            FROM
            modelled.publisher_datasource a
            INNER JOIN
            modelled.emissions_factor b
            ON a.publisher_id = b.publisher_id 
            AND a.dataset_id = b.dataset_id
            INNER JOIN
            modelled.activity_subcategory c
            ON b.activity_id = c.activity_id
            INNER JOIN
            modelled.ghgi_methodology d
            ON c.gpcmethod_id = d.method_id
            WHERE
            a.publisher_name = 'IPCC';
            """
        )
        result = session.execute(query).mappings().all()

    if not result:
        raise HTTPException(status_code=404, detail="No data available")

    emissionfactors = [
        {
            "gas": row["gas_name"],
            "region": row["region"],
            "units": row["unit_denominator"],
            "reference": row["reference"],
            "emissions_per_activity": row["emissionfactor_value"],
            "gpc_reference_number": row["gpc_reference_number"],
            "methodology_name": row["methodology_name"],
            "metadata": row["activity_subcategory_type"],
            "actor_id": row["actor_id"],
            "year": row["year"],
            "methodology_id": row["method_id"],
            "id": row["emissionfactor_id"]
        }
        for row in result
    ]

    return {"emissions_factor": emissionfactors} 