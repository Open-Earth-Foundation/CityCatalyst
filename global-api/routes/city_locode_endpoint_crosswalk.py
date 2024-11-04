from fastapi import APIRouter, HTTPException
from sqlalchemy import text
import pandas as pd
from db.database import SessionLocal

api_router = APIRouter(prefix="/api/v0")

# GPC quality classification
gpc_quality_data = "TBD"


# Extract the data by locode, year and sector/subsector
def db_query(locode, year, reference_number):
    with SessionLocal() as session:
        query = text(
            """
            SELECT
                cco.cell_id,
                cg.area,
                cco.fraction_in_city,
                gce.emissions_quantity,
                gce.gas,
                gce.year,
                gce.reference_number
            FROM
                "crosswalk_CityGridOverlap" cco
            JOIN
                "crosswalk_GridCell" cg ON cco.cell_id = cg.id
            JOIN
                "crosswalk_GridCellEmissions" gce ON cco.cell_id = gce.cell_id
            WHERE cco.locode = :locode
            AND gce.reference_number = :reference_number
            AND gce.year = :year;"""
        )

        params = {"locode": locode, "year": year, "reference_number": reference_number}
        result = session.execute(query, params).fetchall()

    return result


@api_router.get("/crosswalk/city/{locode}/{year}/{gpcReferenceNumber}",
                summary="Get emissions from Crosswalk Labs",
                description="DEPRECATED WARNING: This endpoint will be migrated to a new endpoint /api/v1/source/crosswalk/city/{locode}/{year}/{gpcReferenceNumber} in the near future.")
def get_emissions_by_city_and_year(locode: str, year: int, gpcReferenceNumber: str):
    """
        Retrieves data from crosswalks labs on greenhouse gas emissions for a specific city identified by locode, for a given year and GPC reference number.
    """
    records = db_query(locode, year, gpcReferenceNumber)

    if not records:
        raise HTTPException(status_code=404, detail="No data available")

    series = (
        pd.DataFrame(records)
        .assign(
            emissions_total=lambda row: row["area"]
            * row["fraction_in_city"]
            * row["emissions_quantity"]
        )
        .groupby("gas")
        .sum("emissions_total")
        .astype({"emissions_total": int})
        .loc[:, ["emissions_total"]]
        .squeeze()
    )

    totals = {
        "emissions": {
            "co2_mass": series.get("CO2", 0),
            "co2_co2eq": series.get("CO2", 0),
            "gpc_quality": gpc_quality_data,
        }
    }

    return {"totals": totals}
