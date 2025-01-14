from fastapi import APIRouter, HTTPException
from sqlalchemy import text
from db.database import SessionLocal

api_router = APIRouter(prefix="/api/v0")

def db_city_emission_forecast(actor_id, forecast_year, spatial_granularity):
    with SessionLocal() as session:
        # This is a hard coded based on the cluster 3 results
        # TO DO: once the data has been loaded into the database we need to update the query
        query = text(
            """
            SELECT actor_id,cluster_id,cluster_name,cluster_description,gpc_sector,forecast_year,future_year,growth_rate
            FROM modelled.ghgi_emission_forecast
            WHERE actor_id = :actor_id
            AND forecast_year = :forecast_year
            AND spatial_granularity = :spatial_granularity
            """
        )

        params = {
            "actor_id": actor_id,
            "forecast_year": forecast_year,
            "spatial_granularity":spatial_granularity
        }
        result = session.execute(query, params).mappings().all()

    return result



@api_router.get("/ghgi/emissions_forecast/{spatial_granularity}/{actor_id}/{forecast_year}", summary="Get no action emission projection")
def get_city_risk_assessment(
    actor_id: str,  # This is the city locode
    spatial_granularity:str, # This can be city, country, region
    forecast_year: str,
    ):
    """
    Retrieve ccra risk assessment based on specified parameters.

    - `actor_id`: Unique identifier for the entity contributing to or associated with emissions.
    - `forecast_year`: This is based the base year the forecasting was completed eg. 2023.

    Returns a structured response containing risk assessment data for the specified city and scenario.
    """

    records = db_city_emission_forecast(actor_id, forecast_year, spatial_granularity)

    if not records:
        raise HTTPException(status_code=404, detail="No data available")

    # Transform database records into the desired format for the response
    response = {
        "cluster": {
            "id": records[0]["cluster_id"],
            "name": records[0]["cluster_name"],
            "description": records[0]["cluster_description"]
        },
        "growth_rates": {}
    }

    # Fill the growth_rates dictionary based on records
    for record in records:
        future_year = record["future_year"]
        gpc_sector = record["gpc_sector"]
        growth_rate = record["growth_rate"]

        if future_year not in response["growth_rates"]:
            response["growth_rates"][future_year] = {}

        # Add the growth rate under the relevant sector
        response["growth_rates"][future_year][gpc_sector] = growth_rate

    return response
