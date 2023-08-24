from main import app
from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.orm import SessionLocal, sessionmaker
from decouple import config
import pandas as pd

# Define the database engine
engine = create_engine(config("DATABASE_URL"))

# Define SessionLocal for database interactions
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Extract the data by locode, year and sector/subsector
def db_query(locode, year, reference_number):
    
    with SessionLocal() as session:
        query = text("SELECT * FROM Asset " +
                    "WHERE reference_number = :reference_number " +
                    "AND locode = :locode " +
                    "AND year = :year ")

        result = session.execute(
            query,
            {
                "locode": locode,
                "year": year,
                "reference_number": reference_number
            }
        ).fetchall()

    return result

#AR6 GWP
ch4_GWP_100yr = 29.8
ch4_GWP_20yr = 82.5
n2o_GWP_100yr = 273
n2o_GWP_20yr = 273

#GPC quality classification
gpc_quality_data = 'TBD'
gpc_quality_EF = 'TBD'

@app.get("/api/v0/climatetrace/city/{locode}/{year}/{gpcReferenceNumber}")
def get_emissions_by_city_and_year(locode: str, year: int, inventoryPart: str, gpcReferenceNumber: float):

    sources = db_query(locode, year, gpcReferenceNumber)

    sources = pd.DataFrame(sources)

    # Group each gas and add them to have "total emissions by gas"
    results = sources.groupby('gas').emissions_quantity.sum()

    # Build Totals dictionary
    Totals = {
        "totals": {
            "emissions": {
                "co2_mass": results.get('co2', 0),
                "co2_co2eq": results.get('co2', 0),
                "ch4_mass": results.get('ch4', 0),
                "ch4_co2eq_100yr": results.get('ch4', 0) * ch4_GWP_100yr,
                "ch4_co2eq_20yr": results.get('ch4', 0) * ch4_GWP_20yr,
                "n2o_mass": results.get('n2o', 0),
                "n2o_co2eq_100yr": results.get('n2o', 0) * n2o_GWP_100yr,
                "n2o_co2eq_20yr": results.get('n2o', 0) * n2o_GWP_20yr,
                "co2eq_100yr": results.get('co2e_100yr', 0),
                "co2eq_20yr": results.get('co2e_20yr', 0),
                "gpc_quality": gpc_quality_data
            }
        }
    }

    # Build Details dictionary
    Details = {
        "Activity":{
            "value": sources['activity'],
            "units": sources['activity_units'],
            "gpc_quality": gpc_quality_data
        },
        "Emissions_factor":{
            "value": sources['emissions_factor'],
            "units": sources['emissions_factor_units'],
            "gpc_quality": gpc_quality_EF
        }
    }

    # Build Points dictionary
    Points = {
        "points": {
            "Ownership": {
                "asset_name": sources['asset_name'],
                "asset_id": sources['asset_id'],
                "lat": sources['lat'],
                "lon": sources['lon']
            },
            "Capacity": {
                "value": sources['capacity'],
                "units": sources['capacity_units'],
                "factor": sources['capacity_factor']
            },
            "Activity": {
                "value": sources['activity'],
                "units": sources['activity_units'],
                "gpc_quality": gpc_quality_data
            },
            "Emissions_factor": {
                "value": sources['emissions_factor'],
                "units": sources['emissions_factor_units'],
                "gpc_quality": gpc_quality_EF
            },
            "Emissions": {
                "co2_mass": sources[sources['gas']=='co2'],
                "co2_co2eq": sources[sources['gas']=='co2'],
                "ch4_mass": sources[sources['gas']=='ch4'],
                "ch4_co2eq_100yr": sources[sources['gas']=='ch4']*ch4_GWP_100yr,
                "ch4_co2eq_20yr": sources[sources['gas']=='ch4']*ch4_GWP_20yr,
                "n2o_mass": sources[sources['gas']=='co2'],
                "n2o_co2eq_100yr": sources[sources['gas']=='n2o']*n2o_GWP_100yr,
                "n2o_co2eq_20yr": sources[sources['gas']=='n2o']*n2o_GWP_100yr,
                "co2eq_100yr": sources[sources['gas']=='co2e_100yr'],
                "co2eq_20yr": sources[sources['gas']=='co2e_20yr'],
                "gpc_quality": gpc_quality_data
            }
        }
    }

    return {"totals": Totals, "details": Details, "points": Points}
    


