from fastapi import APIRouter, HTTPException
from sqlalchemy import text
from db.database import SessionLocal

api_router = APIRouter(prefix="/api/v0/ghgi/notation_key")


def db_query_notation_key(datasource_name, spatial_granularity, actor_id, gpc_reference_number):
    with SessionLocal() as session:
        query = text(
            """
            SELECT  'NO' as notation_key,
                    'no-occurrance' as notation_key_name,
                    'The activity or process does not occur or exist within the city' as unavailable_reason,
                    'There are no facilities found in the city boundary' as unavailable_explanation
            FROM modelled.ghgi_city_facility_occurance
            WHERE facility_count = 0
            AND locode = :actor_id
            AND gpc_reference_number = :gpc_reference_number
            AND datasource_name = :datasource_name
            AND spatial_granularity = :spatial_granularity
            """
        )
        params = {
            "datasource_name": datasource_name,
            "spatial_granularity": spatial_granularity,
            "actor_id": actor_id,
            "gpc_reference_number": gpc_reference_number,
        }
        result = session.execute(query, params).fetchone()

    return result


@api_router.get("/NO/source/{datasource_name}/{spatial_granularity}/{actor_id}/{gpc_reference_number}", summary="Get notation key NO for facilities not occurring in city")
def get_notation_key_no(
    datasource_name: str,  # The name of the data source to query.
    spatial_granularity: str,  # The level of spatial granularity (e.g., country, region, city).
    actor_id: str,  # Identifier for the actor (e.g., city locode) associated with the notation key.
    gpc_reference_number: str,  # Reference number associated with the Global Protocol for Community-Scale Greenhouse Gas Emission Inventories (GPC).
    ):
    """
    Retrieve notation key 'NO' data for facilities that do not occur within the city boundary.

    - `datasource_name`: Specifies the data source for facility occurrence data.
    - `spatial_granularity`: Determines the geographical resolution of the data.
    - `actor_id`: Unique identifier for the city (locode).
    - `gpc_reference_number`: GPC reference number related to the activity.

    Returns a structured response indicating that the activity does not occur in the city.
    """

    result = db_query_notation_key(datasource_name, spatial_granularity, actor_id, gpc_reference_number)

    if not result:
        raise HTTPException(status_code=404, detail="No notation key data available for the specified parameters")

    notation_key, notation_key_name, unavailable_reason, unavailable_explanation = result

    response = {
        "notation_key": notation_key,
        "notation_key_name": notation_key_name,
        "unavailable_reason": unavailable_reason,
        "unavailable_explanation": unavailable_explanation
    }

    return response

