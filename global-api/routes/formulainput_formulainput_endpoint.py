from fastapi import APIRouter, HTTPException
from sqlalchemy import text
from db.database import SessionLocal

api_router = APIRouter(prefix="/api/v0")

@api_router.get("/formula_input/formula_input", summary="Get formula input values (IPCC only)")
def get_formulainput():
    """
    Retrieve formula input values where publisher_name = 'IPCC'.
    Returns a JSON object with a list of formula input values under the key 'formula_input'.
    """
    with SessionLocal() as session:
        query = text(
            """

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