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
            SELECT  locode,cluster_id,cluster_name,cluster_description,gpc_sector,forecast_year,future_year,growth_rate
            FROM 	(
            SELECT 	'BR SER' as locode,
    		3 as cluster_id,
    		'{"en": "Medium-sized cities with IPPU GHG emissions industries",
    		 "es": "Ciudades de tamaño medio con industrias de emisiones de GHG IPPU",
    		 "pt": "Cidades de médio porte com indústrias de emissões de GHG IPPU"}'::json AS cluster_name,
    		'{"en": "24 municipalities, 79% of which are small (<150k pop); high participation of services and industry in the GDP; GDP with high emissions intensity; high level of emissions per capita; high participation of industry in emissions. Medium-sized municipalities with specialization in emission-intensive industrial sectors.",
                        "es": "24 municipios, 79% de los cuales son pequeños (<150k pop); alta participación de los servicios y la industria en el PIB; PIB con alta intensidad de emisiones; alto nivel de emisiones per cápita; alta participación de la industria en las emisiones. Municipios de tamaño medio con especialización en sectores industriales intensivos en emisiones.",
                        "pt": "24 municípios, 79% dos quais são pequenos (<150k pop); alta participação de serviços e indústria no PIB; PIB com alta intensidade de emissões; alto nível de emissões per capita; alta participação da indústria nas emissões. Municípios de médio porte com especialização em setores industriais intensivos em emissões."
                   	}'::json  cluster_description,
                   	TRIM(unnest(STRING_TO_ARRAY(gpc_sector,','))) AS gpc_sector,
    		2023 as forecast_year,
    		year as future_year,
    		value/100 as growth_rate
            FROM (
            SELECT 'III' AS gpc_sector, 2024 AS year, 0.670 AS value UNION ALL
            SELECT 'III', 2025, 0.440 UNION ALL
            SELECT 'III', 2026, 0.460 UNION ALL
            SELECT 'III', 2027, 0.430 UNION ALL
            SELECT 'III', 2028, 0.430 UNION ALL
            SELECT 'III', 2029, 0.430 UNION ALL
            SELECT 'III', 2030, 0.430 UNION ALL
            SELECT 'III', 2031, 0.430 UNION ALL
            SELECT 'III', 2032, 0.430 UNION ALL
            SELECT 'III', 2033, 0.430 UNION ALL
            SELECT 'III', 2034, 0.430 UNION ALL
            SELECT 'III', 2035, 0.430 UNION ALL
            SELECT 'III', 2036, 0.430 UNION ALL
            SELECT 'III', 2037, 0.430 UNION ALL
            SELECT 'III', 2038, 0.430 UNION ALL
            SELECT 'III', 2039, 0.430 UNION ALL
            SELECT 'III', 2040, 0.430 UNION ALL
            SELECT 'III', 2041, 0.430 UNION ALL
            SELECT 'III', 2042, 0.430 UNION ALL
            SELECT 'III', 2043, 0.430 UNION ALL
            SELECT 'III', 2044, 0.430 UNION ALL
            SELECT 'III', 2045, 0.430 UNION ALL
            SELECT 'III', 2046, 0.430 UNION ALL
            SELECT 'III', 2047, 0.430 UNION ALL
            SELECT 'III', 2048, 0.430 UNION ALL
            SELECT 'III', 2049, 0.430 UNION ALL
            SELECT 'III', 2050, 0.430 UNION ALL
            SELECT 'I, II', 2024, 2.500 UNION ALL
            SELECT 'I, II', 2025, 1.630 UNION ALL
            SELECT 'I, II', 2026, 1.710 UNION ALL
            SELECT 'I, II', 2027, 1.590 UNION ALL
            SELECT 'I, II', 2028, 1.590 UNION ALL
            SELECT 'I, II', 2029, 1.590 UNION ALL
            SELECT 'I, II', 2030, 1.590 UNION ALL
            SELECT 'I, II', 2031, 1.590 UNION ALL
            SELECT 'I, II', 2032, 1.590 UNION ALL
            SELECT 'I, II', 2033, 1.590 UNION ALL
            SELECT 'I, II', 2034, 1.590 UNION ALL
            SELECT 'I, II', 2035, 1.590 UNION ALL
            SELECT 'I, II', 2036, 1.590 UNION ALL
            SELECT 'I, II', 2037, 1.590 UNION ALL
            SELECT 'I, II', 2038, 1.590 UNION ALL
            SELECT 'I, II', 2039, 1.590 UNION ALL
            SELECT 'I, II', 2040, 1.590 UNION ALL
            SELECT 'I, II', 2041, 1.590 UNION ALL
            SELECT 'I, II', 2042, 1.590 UNION ALL
            SELECT 'I, II', 2043, 1.590 UNION ALL
            SELECT 'I, II', 2044, 1.590 UNION ALL
            SELECT 'I, II', 2045, 1.590 UNION ALL
            SELECT 'I, II', 2046, 1.590 UNION ALL
            SELECT 'I, II', 2047, 1.590 UNION ALL
            SELECT 'I, II', 2048, 1.590 UNION ALL
            SELECT 'I, II', 2049, 1.590 UNION ALL
            SELECT 'I, II', 2050, 1.590 UNION all
            SELECT 'V', 2024, 1.230 UNION ALL
            SELECT 'V', 2025, 0.800 UNION ALL
            SELECT 'V', 2026, 0.840 UNION ALL
            SELECT 'V', 2027, 0.780 UNION ALL
            SELECT 'V', 2028, 0.780 UNION ALL
            SELECT 'V', 2029, 0.780 UNION ALL
            SELECT 'V', 2030, 0.780 UNION ALL
            SELECT 'V', 2031, 0.780 UNION ALL
            SELECT 'V', 2032, 0.780 UNION ALL
            SELECT 'V', 2033, 0.780 UNION ALL
            SELECT 'V', 2034, 0.780 UNION ALL
            SELECT 'V', 2035, 0.780 UNION ALL
            SELECT 'V', 2036, 0.780 UNION ALL
            SELECT 'V', 2037, 0.780 UNION ALL
            SELECT 'V', 2038, 0.780 UNION ALL
            SELECT 'V', 2039, 0.780 UNION ALL
            SELECT 'V', 2040, 0.780 UNION ALL
            SELECT 'V', 2041, 0.780 UNION ALL
            SELECT 'V', 2042, 0.780 UNION ALL
            SELECT 'V', 2043, 0.780 UNION ALL
            SELECT 'V', 2044, 0.780 UNION ALL
            SELECT 'V', 2045, 0.780 UNION ALL
            SELECT 'V', 2046, 0.780 UNION ALL
            SELECT 'V', 2047, 0.780 UNION ALL
            SELECT 'V', 2048, 0.780 UNION ALL
            SELECT 'V', 2049, 0.780 UNION ALL
            SELECT 'V', 2050, 0.780 UNION ALL
            SELECT 'IV', 2024, 1.960 UNION ALL
            SELECT 'IV', 2025, 1.270 UNION ALL
            SELECT 'IV', 2026, 1.330 UNION ALL
            SELECT 'IV', 2027, 1.240 UNION ALL
            SELECT 'IV', 2028, 1.240 UNION ALL
            SELECT 'IV', 2029, 1.240 UNION ALL
            SELECT 'IV', 2030, 1.240 UNION ALL
            SELECT 'IV', 2031, 1.240 UNION ALL
            SELECT 'IV', 2032, 1.240 UNION ALL
            SELECT 'IV', 2033, 1.240 UNION ALL
            SELECT 'IV', 2034, 1.240 UNION ALL
            SELECT 'IV', 2035, 1.240 UNION ALL
            SELECT 'IV', 2036, 1.240 UNION ALL
            SELECT 'IV', 2037, 1.240 UNION ALL
            SELECT 'IV', 2038, 1.240 UNION ALL
            SELECT 'IV', 2039, 1.240 UNION ALL
            SELECT 'IV', 2040, 1.240 UNION ALL
            SELECT 'IV', 2041, 1.240 UNION ALL
            SELECT 'IV', 2042, 1.240 UNION ALL
            SELECT 'IV', 2043, 1.240 UNION ALL
            SELECT 'IV', 2044, 1.240 UNION ALL
            SELECT 'IV', 2045, 1.240 UNION ALL
            SELECT 'IV', 2046, 1.240 UNION ALL
            SELECT 'IV', 2047, 1.240 UNION ALL
            SELECT 'IV', 2048, 1.240 UNION ALL
            SELECT 'IV', 2049, 1.240 UNION ALL
            SELECT 'IV', 2050, 1.240) t ) t
            WHERE locode = :actor_id
            AND forecast_year = :forecast_year
            AND 'city' = :spatial_granularity
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
