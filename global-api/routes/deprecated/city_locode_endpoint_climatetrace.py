from fastapi import APIRouter, HTTPException
import math
from sqlalchemy import text
import pandas as pd
from db.database import SessionLocal

api_router = APIRouter(prefix="/api/v0")

gas_to_gwp100 = {"co2": 1, "ch4": 29.8, "n2o": 273}
gas_to_gwp20 = {"co2": 1, "ch4": 82.5, "n2o": 273}

gpc_quality_data = "TBD"
gpc_quality_EF = "TBD"


def not_nan_or_none(value):
    """return true if value is not nan, none, or empty"""
    if isinstance(value, float | int):
        return not math.isnan(value)
    return value is not None and value != ""


# Extract the data by locode, year and sector/subsector
def db_query(locode, year, reference_number):
    with SessionLocal() as session:
        query = text(
            """
            SELECT * FROM asset
            WHERE reference_number = :reference_number
            AND locode = :locode
            AND EXTRACT(YEAR FROM end_time) = :year;
            """
        )

        params = {"locode": locode, "year": year, "reference_number": reference_number}
        result = session.execute(query, params).fetchall()

    return result


@api_router.get("/climatetrace/city/{locode}/{year}/{gpcReferenceNumber}",
                summary="Get emissions from ClimateTRACE",
                description = "DEPRECATED WARNING: This endpoint will be migrated to a new endpoint /api/v1/source/climatetrace/city/{locode}/{year}/{gpcReferenceNumber} in the near future.")
def get_emissions_by_city_and_year(locode: str, year: int, gpcReferenceNumber: str):
    """
        Retrieves data on greenhouse gas emissions for a specific city identified by locode, for a given year and GPC reference number.

        - **locode**: Location code identifying the city.
        - **year**: Year for which the emissions data is retrieved.
        - **gpcReferenceNumber**: Unique reference number for the sector/subsector.

        Returns:
            dict: A dictionary containing total emissions summary and detailed asset-level data.

        Raises:
            HTTPException: 404 error if no emissions data is found for the given parameters.
    """
    gases = ["co2", "ch4", "n2o"]
    records = db_query(locode, year, gpcReferenceNumber)

    if not records:
        raise HTTPException(status_code=404, detail="No data available")

    df = pd.DataFrame(records)

    series = (
        df.groupby("gas")
        .sum("emissions_quantity")
        .astype({"emissions_quantity": int})
        .loc[:, ["emissions_quantity"]]
        .squeeze()
    )

    totals = {
        "totals": {
            "emissions": {
                "co2_mass": str(series.get("co2", 0)),
                "co2_co2eq": str(series.get("co2", 0)),
                "ch4_mass": str(series.get("ch4", 0)),
                "ch4_co2eq_100yr": str(series.get("ch4", 0) * gas_to_gwp100.get("ch4")),
                "ch4_co2eq_20yr": str(series.get("ch4", 0) * gas_to_gwp20.get("ch4")),
                "n2o_mass": str(series.get("n2o", 0)),
                "n2o_co2eq_100yr": str(series.get("n2o", 0) * gas_to_gwp100.get("n2o")),
                "n2o_co2eq_20yr": str(series.get("n2o", 0) * gas_to_gwp20.get("n2o")),
                "co2eq_100yr": str(series.get("co2e_100yr", 0)),
                "co2eq_20yr": str(series.get("co2e_20yr", 0)),
                "gpc_quality": str(gpc_quality_data),
            }
        }
    }

    list_of_points = []

    for _, row_data in df.iterrows():
        row = row_data.to_frame().T

        gas = row["gas"].item()

        conditions = [
            gas in gases,
            not_nan_or_none(row["emissions_quantity"].item()),
        ]

        if all(conditions):
            gwp100 = gas_to_gwp100.get(gas)
            gwp20 = gas_to_gwp20.get(gas)

            capacity_factor = (
                row["capacity_factor"].to_string(index=False, header=False).strip()
            )

            ownership = {
                "asset_name": row["asset_name"].item(),
                "asset_id": row["asset_id"].item(),
                "lat": row["lat"].to_string(index=False, header=False).strip(),
                "lon": row["lon"].to_string(index=False, header=False).strip(),
            }

            capacity = {
                "value": row["capacity"].to_string(index=False, header=False).strip(),
                "units": row["capacity_units"].item(),
                "factor": capacity_factor if capacity_factor != "None" else "NA",
            }

            activity = {
                "value": row["activity"].to_string(index=False, header=False).strip(),
                "units": row["activity_units"].item(),
                "gpc_quality": str(gpc_quality_data),
            }

            emissions_factor = {
                "gas": gas,
                "value": row["emissions_factor"]
                .to_string(index=False, header=False)
                .strip(),
                "units": row["emissions_factor_units"].item(),
                "gpc_quality": str(gpc_quality_EF),
            }

            emissions = {
                "gas": gas,
                "value": row["emissions_quantity"]
                .to_string(index=False, header=False)
                .strip(),
                "units": row["emissions_quantity_units"].item(),
                "co2eq_100yr": str(row["emissions_quantity"].item() * gwp100),
                "co2eq_20yr": str(row["emissions_quantity"].item() * gwp20),
                "gpc_quality": str(gpc_quality_data),
            }

            point_data = {
                "ownership": ownership,
                "capacity": capacity,
                "activity": activity,
                "emissions_factor": emissions_factor,
                "emissions": emissions,
            }

            list_of_points.append(point_data)

    points = {"points": list_of_points}

    return {**totals, **points}
