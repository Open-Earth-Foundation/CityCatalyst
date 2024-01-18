from fastapi import APIRouter, HTTPException
from sqlalchemy import text
import pandas as pd
from db.database import SessionLocal

api_router = APIRouter(prefix="/api/v0")

gpc_quality_data = "high"

# Extract the data by locode, year and sector/subsector
def db_query(source_name, locode, year, GPC_refno):
    with SessionLocal() as session:
        query = text(
            """
            SELECT * FROM city_locode
            WHERE source_name = :source_name
            AND "GPC_refno" = :GPC_refno
            AND locode = :locode
            AND year = :year;
            """
        )
        params = {"source_name": source_name, "locode": locode, "year": year, "GPC_refno": GPC_refno}
        result = session.execute(query, params).fetchall()

    return result


@api_router.get("/source/{source_name}/city/{locode}/{year}/{GPC_refno}")
def get_emissions_by_locode_and_year(source_name: str, locode: str, year: str, GPC_refno: str):

    records = db_query(source_name, locode, year, GPC_refno)

    if not records:
        raise HTTPException(status_code=404, detail="No data available")

    df = pd.DataFrame(records)

    for _, row_data in df.iterrows():
        row = row_data.to_frame().T

        gas = row["gas"].item()
    
        emissions = {
            "gas": gas,
            "value": row["emissions_value"].item(),
            "units": row["emissions_unit"].item(),
            "gpc_quality": str(gpc_quality_data),   
            }

    return {**emissions}