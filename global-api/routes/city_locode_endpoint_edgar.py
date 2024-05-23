from fastapi import APIRouter, HTTPException
from sqlalchemy import text
import pandas as pd
from db.database import SessionLocal

api_router = APIRouter(prefix="/api/v0")

# AR6 GWP
ch4_GWP_100yr = 29.8
ch4_GWP_20yr = 82.5
n2o_GWP_100yr = 273
n2o_GWP_20yr = 273

# GPC quality classification
gpc_quality_data = "medium"
gpc_quality_EF = "TBD"


# Extract the data by locode, year and sector/subsector
def db_query(locode, year, reference_number):
    with SessionLocal() as session:
        query = text(
            """
            SELECT 		edgar.emissions_substance as gas,
                        sum(emissions * ST_Area(ST_Intersection(edgar.geometry, osm.geometry)) / ST_Area(edgar.geometry)) * 1000 as total_emissions
            FROM 		raw_data.osm_city_polygon AS osm
            LEFT JOIN 	raw_data.edgar_emissions AS edgar
            ON 			ST_Intersects(osm.geometry, edgar.geometry)
            WHERE 		ST_Area(osm.geometry) > 0
            AND 		osm.locode = :locode
            AND 		edgar.gpc_refno = :reference_number
            AND 		edgar.emissions_year = :year
            GROUP BY 	edgar.emissions_substance 
            """
        )

        params = {"locode": locode, "year": year, "reference_number": reference_number}
        result = session.execute(query, params).fetchall()

    return result

def cvt(value):
    return str(int(round(float(value))))

@api_router.get("/edgar/city/{locode}/{year}/{gpcReferenceNumber}")
def get_emissions_by_city_and_year(locode: str, year: int, gpcReferenceNumber: str):
    records = db_query(locode, year, gpcReferenceNumber)

    if not records:
        raise HTTPException(status_code=404, detail="No data available")

    masses = {'CO2': 0.0, 'CH4': 0.0, 'N2O': 0.0}

    for record in records:
        gas = record[0]
        mass = record[1]
        masses[gas] += float(mass)

    totals = {
        "totals": {
            "emissions": {
                "co2_mass": cvt(masses["CO2"]),
                "co2_co2eq": cvt(masses["CO2"]),
                "ch4_mass": cvt(masses["CH4"]),
                "ch4_co2eq_100yr": cvt(masses["CH4"] * ch4_GWP_100yr),
                "ch4_co2eq_20yr": cvt(masses["CH4"] * ch4_GWP_20yr),
                "n2o_mass": cvt(masses["N2O"]),
                "n2o_co2eq_100yr": cvt(masses["N2O"] * n2o_GWP_100yr),
                "n2o_co2eq_20yr": cvt(masses["N2O"] * n2o_GWP_20yr),
                "gpc_quality": gpc_quality_data,
                "co2eq_100yr": cvt(masses["CO2"] + masses["CH4"] * ch4_GWP_100yr + masses["N2O"] * n2o_GWP_100yr),
                "co2eq_20yr": cvt(masses["CO2"] + masses["CH4"] * ch4_GWP_20yr + masses["N2O"] * n2o_GWP_20yr)
            }
        }
    }

    return totals
