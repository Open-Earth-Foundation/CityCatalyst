from fastapi import APIRouter, HTTPException
from sqlalchemy import text
from db.database import SessionLocal

api_router = APIRouter(prefix="/api/v0")

def db_city_context(locode: str):
    with SessionLocal() as session:
        query = text(
            """
            SELECT a.locode, cp.city_name, cp.region_code,
            a.region_name as region_name,
            MAX(CASE WHEN attribute_type = 'population' THEN attribute_value END)::numeric AS population,
            MAX(CASE WHEN attribute_type = 'population density' THEN attribute_value END)::numeric AS population_density,
            MAX(ROUND(ST_Area(ST_Transform(geometry, 3857)) / 1000000)) AS area_km2,
            MAX(CASE WHEN attribute_type = 'elevation' THEN attribute_value END)::numeric AS elevation,
            MAX(CASE WHEN attribute_type = 'main biome' THEN attribute_value END) AS biome,
            MAX(CASE WHEN attribute_type = 'income' THEN attribute_value END) AS low_income,
            MAX(CASE WHEN attribute_type = 'inadequate water access' THEN attribute_value END) AS inadequate_water_access,
            MAX(CASE WHEN attribute_type = 'inadequate sanitation' THEN attribute_value END) AS inadequate_sanitation
            FROM modelled.city_attribute a
            INNER JOIN modelled.city_polygon cp
            ON a.locode = cp.locode
            WHERE REPLACE(a.locode, ' ', '') = REPLACE(:locode, ' ', '')
            GROUP BY a.locode, cp.city_name, cp.region_code, a.region_name
            """
        )

        params = {
            "locode": locode
        }
        result = session.execute(query, params).mappings().all()

    return result


@api_router.get("/city_context/city/{locode}", summary="Get contextual data about the city")
def get_city_context(locode: str):
    """
    Retrieve contextual data about the city based on the provided locode.

    - `locode`: Unique identifier for the city.

    Returns a structured response containing contextual data for the specified city.
    """

    records = db_city_context(locode)  # Fetch data using the locode as locode

    if not records:
        raise HTTPException(status_code=404, detail="No data available")

    # Transform database records into the desired format for the response
    response = {
        "locode": records[0]["locode"],
        "name": records[0]["city_name"],
        "region": records[0]["region_code"],
        "regionName": records[0]["region_name"],  # Can be modified if necessary
        "populationSize": records[0]["population"],
        "populationDensity": records[0]["population_density"],
        "area": records[0]["area_km2"],
        "elevation": records[0]["elevation"],
        "biome": records[0]["biome"],
        "socioEconomicFactors": {
            "lowIncome": records[0]["low_income"]
        },
        "accessToPublicServices": {
            "inadequateWaterAccess": records[0]["inadequate_water_access"],
            "inadequateSanitation": records[0]["inadequate_sanitation"]
        }
    }

    return response
