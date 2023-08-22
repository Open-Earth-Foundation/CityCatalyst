from fastapi import FastAPI
from sqlalchemy import create_engine, text 
from sqlalchemy.orm import sessionmaker

app = FastAPI()

# Read the DATABASE_URL from the .env file
DATABASE_URL = config("DATABASE_URL")

# Create a SQLAlchemy engine for database connection
engine = create_engine(DATABASE_URL)

# Create a session maker for SQLAlchemy
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Dictionary to map gpc_sector to reference_number
gpc_sector_to_reference_number = {
    "stationary_energy":["I.4.1"],
    "transportation":["II.1.1","II.4.1", "II.4.3"],
    "waste":["III.1.2"],
    "IPPU": ["IV.1.1"],
    "AFOLU": ["V.3.1", "V.1.1","V.2.1"],
}

def sector_to_filename(inventoryPart):
    gpc_reference_numbers = gpc_sector_to_reference_number.get(inventoryPart, [])
    filenames = []

    with SessionLocal() as session:
        for reference_number in gpc_reference_numbers:
            query_filenames = text("SELECT DISTINCT(filename) FROM ? WHERE reference_number = :reference_number")
            filenames_result = session.execute(query_filenames, {"reference_number": reference_number}).fetchall()
            filenames.extend(row[0] for row in filenames_result)

    return filenames

def db_query(filenames, locode, year):
    results = []

    with SessionLocal() as session:
        for filename in filenames:
            query = text(f"SELECT * FROM {filename} "
                        f"WHERE locode = :locode "
                        f"AND year = :year")

            result = session.execute(
                query,
                {
                    "locode": locode,
                    "year": year,
                }
            ).fetchall()

            results.append(result)

    return results


@app.get("/api/v0/climatetrace/city/{locode}/{year}/{inventoryPart}/{gpcReferenceNumber}")
def get_emissions_by_city_and_year(locode: str, year: int, inventoryPart: str, gpcReferenceNumber: float):

    file_names = sector_to_filename(inventoryPart)
    sources = db_query(file_names, locode, year)

#(.....)

    totals = {
        "totals": {
            "emissions": {
                "co2_mass": co2_mass,
                "co2_co2eq": co2_co2eq,
                "ch4_mass": ch4_mass,
                "ch4_co2eq": ch4_co2eq,
                "n2o_mass": n2o_mass,
                "n2o_co2eq": n2o_co2eq,
                "co2eq_100y": co2eq_100y,
                "co2eq_20y": co2eq_20y,
                "gpc_quality": gpc_quality
            }
        }
    }

    activity = {
        "activity": {
            "value": value,
            "units": units,
            "gpc_quality": gpc_quality
        }
    }

    emissions_factor = {
        "emissions_factor": {
            "value": value,
            "units": units,
            "gpc_quality": gpc_quality
        }
    }

    points = {
        "points": {
            "emissions": {
                "co2_mass": co2_mass,
                "co2_co2eq": co2_co2eq,
                "ch4_mass": ch4_mass,
                "ch4_co2eq": ch4_co2eq,
                "n2o_mass": n2o_mass,
                "n2o_co2eq": n2o_co2eq,
                "co2eq_100y": co2eq_100y,
                "co2eq_20y": co2eq_20y,
                "gpc_quality": gpc_quality
            },
            "ownership": {
                "asset_name": asset_name,
                "name": name,
                "data_source": data_source,
                "URL": URL,
                "location": location,
            },
            "capacity": {
                "value": value,
                "units": units,
                "factor": factor
            },
            "activity": {
                "value": value,
                "units": units,
                "gpc_quality": gpc_quality
            }
        }
    }

    return {"totals": totals, "activity": activity, "emissions_factor": emissions_factor, "points": points}
    


