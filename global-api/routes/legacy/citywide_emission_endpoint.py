from fastapi import APIRouter, HTTPException
from sqlalchemy import text
from db.database import SessionLocal

api_router = APIRouter(prefix="/api/v0")

# TODO: establish best-practice values for these numbers

CO2_EF_CH4_100yr = 30
CO2_EF_N2O_100yr = 298
CO2_EF_CH4_20yr = 84
CO2_EF_N2O_20yr = 264

# this is a placeholder for now
gpc_quality_data = "NA"

# Extract the data by locode, year and sector/subsector
def db_query(source_name, locode, year, GPC_refno):
    with SessionLocal() as session:
        query = text(
            """
            SELECT * FROM citywide_emissions
            WHERE source_name = :source_name
            AND "GPC_refno" = :GPC_refno
            AND locode = :locode
            AND year = :year;
            """
        )
        params = {"source_name": source_name, "locode": locode, "year": year, "GPC_refno": GPC_refno}
        result = session.execute(query, params).fetchall()

    return result


@api_router.get("/source/{source_name}/city/{locode}/{year}/{GPC_refno}",
                summary="Get city level emissions",
                description="DEPRECATED WARNING: This endpoint will be migrated to a new endpoint /api/v1/source/{source_name}/city/{locode}/{year}/{GPC_refno}/emissions in the near future.")
def get_emissions_by_locode_and_year(source_name: str, locode: str, year: str, GPC_refno: str):

    records = db_query(source_name, locode, year, GPC_refno)

    if not records:
        raise HTTPException(status_code=404, detail="No data available")

    masses = {'CO2': 0, 'CH4': 0, 'N2O': 0}

    for record in records:
        record = record._mapping
        gas = record['gas_name']
        mass = record['emissions_value']
        masses[gas] += mass

    totals = {
        "totals": {
            "emissions": {
                "co2eq_100yr": str(round(masses["CO2"] + CO2_EF_CH4_100yr * masses["CH4"] + CO2_EF_N2O_100yr * masses["N2O"])),
                "co2eq_20yr": str(round(masses["CO2"] + CO2_EF_CH4_20yr * masses["CH4"] + CO2_EF_N2O_20yr * masses["N2O"])),
                "co2_mass": str(round(masses["CO2"])),
                "ch4_mass": str(round(masses["CH4"])),
                "n2o_mass": str(round(masses["N2O"])),
                "gpc_quality": str(gpc_quality_data),
            }
        }
    }

    locode_info = {
        "city_emissions_details": {
            "temporal_granularity": str(record["temporal_granularity"]),
            "activity_name": str(record["activity_name"]),
            "activity_value": str(record["activity_value"]),
            "activity_units": str(record["activity_units"]),
            "gas_name": str(record["gas_name"]),
            "emission_factor_value": str(record["emission_factor_value"]),
            "emission_factor_units": str(record["emission_factor_units"])
        }
    }

    return {**totals, **locode_info}
