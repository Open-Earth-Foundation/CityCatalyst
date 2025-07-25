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
            SELECT
                fi.gas_name AS gas,
                fi.parameter_code,
                fi.parameter_name,
                gm.methodology_name,
                gm.gpc_reference_number AS gpc_refno,
                NULL AS year,
                fi.formula_input_value,
                fi.formula_input_units,
                fi.formula_name,
                fi.metadata,
                NULL AS region,
                fi.actor_id,
                pd.publisher_name AS datasource,
                1 AS rnk,
                gm.method_id AS methodology_id,
                fi.formula_input_id AS formulainput_id
            FROM
                modelled.formula_input fi
            INNER JOIN
                modelled.ghgi_methodology gm
                ON fi.method_id = gm.method_id
            INNER JOIN
                modelled.publisher_datasource pd
                ON fi.publisher_id = pd.publisher_id
                AND fi.dataset_id = pd.dataset_id;
            """
        )
        result = session.execute(query).mappings().all()

    if not result:
        raise HTTPException(status_code=404, detail="No data available")

    formulainput = [
        {
            "gas": row["gas"],
            "parameter_code": row["parameter_code"],
            "parameter_name": row["parameter_name"],
            "methodology_name": row["methodology_name"],
            "gpc_refno": row["gpc_refno"],
            "year": row["year"],
            "formula_input_value": row["formula_input_value"],
            "formula_input_units": row["formula_input_units"],
            "formula_name": row["formula_name"],
            "metadata": row["metadata"],
            "region": row["region"],
            "actor_id": row["actor_id"],
            "datasource": row["datasource"],
            "rnk": row["rnk"],
            "methodology_id": row["methodology_id"],
            "formulainput_id": row["formulainput_id"]
        }
        for row in result
    ]

    return {"formula_input": formulainput} 