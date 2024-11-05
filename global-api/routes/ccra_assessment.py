from fastapi import APIRouter, HTTPException
from sqlalchemy import text
from db.database import SessionLocal

api_router = APIRouter(prefix="/api/v0")

def db_risk_assessment(actor_id, scenario_name):
    with SessionLocal() as session:
        query = text(
            """
            SELECT  b.keyimpact_name,
              		b.hazard_name,
              		b.latest_year,
              		b.scenario_name,
              		a.actor_id,
              		a.hazard_score * a.exposure_score * a.vulnerability_score as risk_score,
              		a.risk_score as normalised_risk_score,
              		a.hazard_score,
              		a.exposure_score,
              		a.vulnerability_score,
              		a.adaptive_capacity_score,
              		a.sensitivity_score,
              		a.risk_lower_limit,
              		a.risk_upper_limit
            FROM modelled.ccra_riskassessment a
            LEFT JOIN modelled.ccra_impactchain b
            ON a.impact_id = b.id
            WHERE actor_id = :actor_id
            AND b.scenario_name = :scenario_name
            """
        )

        params = {
            "actor_id": actor_id,
            "scenario_name": scenario_name,
        }
        result = session.execute(query, params).mappings().all()

    return result

def db_impactchain_indicator(actor_id, scenario_name):
    with SessionLocal() as session:
        query = text(
            """
            SELECT 	c.keyimpact_name,
              		c.hazard_name,
              		c.scenario_name,
                    a.actor_id,
              		a.category,
              		a.subcategory,
              		a.indicator_name,
              		b.indicator_score,
              		b.indicator_units,
              		b.indicator_normalized_score,
              		a.indicator_weight,
              		a.relationship,
              		b.indicator_year,
              		b.datasource
            FROM modelled.ccra_impactchain_indicator a
            LEFT JOIN modelled.ccra_indicator b
            ON a.indicator_id = b.id
            LEFT JOIN modelled.ccra_impactchain c
            ON a.impact_id = c.id
            WHERE a.actor_id = :actor_id
            AND c.scenario_name = :scenario_name
            """
        )

        params = {
            "actor_id": actor_id,
            "scenario_name": scenario_name,
        }
        result = session.execute(query, params).mappings().all()

    return result


def db_ccra_cities(country_code):
    with SessionLocal() as session:
        query = text(
            """
            SELECT 	city_name,
              		region_code,
              		locode as actor_id,
              		'R' || osm_id as osm_id
            FROM 	modelled.city_polygon
            WHERE 	country_code = :country_code
            """
        )

        params = {
            "country_code": country_code,
        }
        result = session.execute(query, params).mappings().all()

    return result


@api_router.get("/ccra/city/{country_code}", summary="Get ccra cities")
def get_ccra_cities(
    country_code: str,  # This is the two letter country code (ISO 3166-1 alpha-2)
    ):
    """
    Retrieve ccra risk assessment based on specified parameters.

    - `country_code`: Unique identifier for the country, e.g BR for Brazil

    """

    records = db_ccra_cities(country_code)

    if not records:
        raise HTTPException(status_code=404, detail="No data available")

    # Transform database records into the desired format for the response
    response = [
            {
                "cityname": record['city_name'],
                "region": record['region_code'],
                "actor_id": record['actor_id'],
                "osm_id": record['osm_id']
            }
            for record in records
    ]

    return response


@api_router.get("/ccra/risk_assessment/city/{actor_id}/{scenario_name}", summary="Get ccra risk assessment for a city")
def get_city_risk_assessment(
    actor_id: str,  # This is the city locode
    scenario_name: str,  # This is the scenario name, can be current, pesimistic, optimistic
    ):
    """
    Retrieve ccra risk assessment based on specified parameters.

    - `actor_id`: Unique identifier for the entity contributing to or associated with emissions.
    - `scenario_name`: This is based on scenarios defined in the ccra model. The scenarios are pesimistic, optimistic, current.

    Returns a structured response containing risk assessment data for the specified city and scenario.
    """

    records = db_risk_assessment(actor_id, scenario_name)

    if not records:
        raise HTTPException(status_code=404, detail="No data available")

    # Transform database records into the desired format for the response
    response = [
            {
                "keyimpact": record['keyimpact_name'],
                "hazard": record['hazard_name'],
                "latest_year": record['latest_year'],
                "scenario": record['scenario_name'],
                "actor_id": record['actor_id'],
                "risk_score": record['risk_score'],
                "normalised_risk_score": record['normalised_risk_score'],
                "hazard_score": record['hazard_score'],
                "exposure_score": record['exposure_score'],
                "vulnerability_score": record['vulnerability_score'],
                "adaptive_capacity_score": record['adaptive_capacity_score'],
                "sensitivity_score": record['sensitivity_score'],
                "risk_lower_limit": record['risk_lower_limit'],
                "risk_upper_limit": record['risk_upper_limit']
            }
            for record in records
    ]

    return response


@api_router.get("/ccra/impactchain_indicators/city/{actor_id}/{scenario_name}", summary="Get ccra impact chain with the indicators for a city")
def get_city_impactchain_indicators(
    actor_id: str,  # This is the city locode
    scenario_name: str,  # This is the scenario name, can be current, pesimistic, optimistic
    ):
    """
    Retrieve ccra impact chain with indicators for a city and scenario

    - `actor_id`: Unique identifier for the entity contributing to or associated with emissions.
    - `scenario_name`: This is based on scenarios defined in the ccra model. The scenarios are pesimistic, optimistic, current.

    Returns a structured response containing risk assessment data for the specified city and scenario.
    """

    records = db_impactchain_indicator(actor_id, scenario_name)

    if not records:
        raise HTTPException(status_code=404, detail="No data available")

    # Transform database records into the desired format for the response
    response = [
            {
                "keyimpact": record['keyimpact_name'],
                "hazard": record['hazard_name'],
                "scenario": record['scenario_name'],
                "actor_id": record['actor_id'],
                "category": record['category'],
                "subcategory": record['subcategory'],
                "indicator_name": record['indicator_name'],
                "indicator_score": record['indicator_score'],
                "indicator_units": record['indicator_units'],
                "indicator_normalized_score": record['indicator_normalized_score'],
                "indicator_weight": record['indicator_weight'],
                "relationship": record['relationship'],
                "indicator_year": record['indicator_year'],
                "datasource": record['datasource']
            }
            for record in records
    ]

    return response
