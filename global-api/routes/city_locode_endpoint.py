from main import app
from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.orm import SessionLocal, sessionmaker
from decouple import config
import pandas as pd
import numpy as np

# Define the database engine
engine = create_engine(config("DATABASE_URL"))

# Define SessionLocal for database interactions
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Extract the data by locode, year and sector/subsector
def db_query(locode, year, reference_number):
    with SessionLocal() as session:
        query = text(
            "SELECT * FROM asset "
            + "WHERE reference_number = :reference_number "
            + "AND locode = :locode "
            + "AND EXTRACT(YEAR FROM end_time) = :year"
        )

        result = session.execute(
            query,
            {"locode": locode, "year": year, "reference_number": reference_number},
        ).fetchall()

    return result


# AR6 GWP
ch4_GWP_100yr = 29.8
ch4_GWP_20yr = 82.5
n2o_GWP_100yr = 273
n2o_GWP_20yr = 273

# GPC quality classification
gpc_quality_data = "TBD"
gpc_quality_EF = "TBD"


@app.get("/api/v0/climatetrace/city/{locode}/{year}/{gpcReferenceNumber}")
def get_emissions_by_city_and_year(
    locode: str, year: int, inventoryPart: str, gpcReferenceNumber: float
):
    sources = db_query(locode, year, gpcReferenceNumber)

    sources = pd.DataFrame(sources)

    # Group each gas and add them to have "total emissions by gas"
    results = sources.groupby("gas").emissions_quantity.sum()
    results = results.apply(lambda x: int(x) if isinstance(x, np.int64) else x)

    # Build Totals dictionary
    totals = {
        "totals": {
            "emissions": {
                "co2_mass": str(results.get("co2", 0)),
                "co2_co2eq": str(results.get("co2", 0)),
                "ch4_mass": str(results.get("ch4", 0)),
                "ch4_co2eq_100yr": str(results.get("ch4", 0) * ch4_GWP_100yr),
                "ch4_co2eq_20yr": str(results.get("ch4", 0) * ch4_GWP_20yr),
                "n2o_mass": str(results.get("n2o", 0)),
                "n2o_co2eq_100yr": str(results.get("n2o", 0) * n2o_GWP_100yr),
                "n2o_co2eq_20yr": str(results.get("n2o", 0) * n2o_GWP_20yr),
                "co2eq_100yr": str(results.get("co2e_100yr", 0)),
                "co2eq_20yr": str(results.get("co2e_20yr", 0)),
                "gpc_quality": str(gpc_quality_data),
            }
        }
    }

    # Build Points dictionary
    points = {
        "points":{
            "Ownership": {
                "asset_name": str(sources["asset_name"]),
                "asset_id": str(sources["asset_id"]),
                "lat": str(sources["lat"]),
                "lon": str(sources["lon"]),    
            },
            "Capacity": {
                "value": str(sources["capacity"]),
                "units": str(sources["capacity_units"]),
                "factor": str(sources["capacity_factor"]),
            },
            "Activity": {
                "value": str(sources["activity"]),
                "units": str(sources["activity_units"]),
                "gpc_quality": str(gpc_quality_data),
            },
            "Emissions_factor": {
                "value": str(sources["emissions_factor"]),
                "units": str(sources["emissions_factor_units"]),
                "gpc_quality":str(gpc_quality_EF),
            },
            "Emissions": {
                "co2_mass": str(sources[sources["gas"] == "co2"]["emissions_quantity"] if "co2" in sources["gas"].values else "NA"),
                "co2_co2eq": str(sources[sources["gas"] == "co2"]["emissions_quantity"] if "co2" in sources["gas"].values else "NA"),
                "ch4_mass": str(sources[sources["gas"] == "ch4"]["emissions_quantity"] if "ch4" in sources["gas"].values else "NA"),
                "ch4_co2eq_100yr": str(sources[sources["gas"] == "ch4"][ "emissions_quantity"]* ch4_GWP_100yr if "ch4" in sources["gas"].values else "NA"),
                "ch4_co2eq_20yr": str(sources[sources["gas"] == "ch4"]["emissions_quantity"]* ch4_GWP_20yr if "ch4" in sources["gas"].values else "NA"),
                "n2o_mass": str(sources[sources["gas"] == "n2o"]["emissions_quantity"] if "n2o" in sources["gas"].values else "NA"),
                "n2o_co2eq_100yr": str(sources[sources["gas"] == "n2o"]["emissions_quantity"]* n2o_GWP_100yr if "n2o" in sources["gas"].values else "NA"),
                "n2o_co2eq_20yr": str(sources[sources["gas"] == "n2o"]["emissions_quantity"]* n2o_GWP_20yr if "n2o" in sources["gas"].values else "NA"),
                "co2eq_100yr": str(sources[sources["gas"] == "co2e_100yr"]),
                "co2eq_20yr": str(sources[sources["gas"] == "co2e_20yr"]),
                "gpc_quality": str(gpc_quality_data),
            },
        }
    }

    return {"totals": totals, "points": points}

