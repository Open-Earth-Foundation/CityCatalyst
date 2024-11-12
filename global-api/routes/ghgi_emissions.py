from fastapi import APIRouter, HTTPException
from sqlalchemy import text
from db.database import SessionLocal

api_router = APIRouter(prefix="/api/v1")

def db_query_total(datasource_name, spatial_granularity, actor_id, gpc_reference_number, emissions_year, gwp):
    with SessionLocal() as session:
        # Ensure `gwp` is a safe column name string.
        if gwp not in {"ar2", "ar3", "ar4", "ar5", "ar6"}:
            raise ValueError("Invalid GWP provided.")

        query = text(
            f"""
            SELECT		upper(e.gas_name) as gas_name,
             			sum(e.emissions_value) as emissions_value,
             			COALESCE(max(gwp.{gwp}),0) as gwp_100yr,
             			COALESCE(sum(e.emissions_value * gwp.{gwp}),0) as emissions_value_100yr,
                        COALESCE(sum(e.emissions_value * gwp2.{gwp}),0) as emissions_value_20yr
            FROM 		modelled.emissions e
            LEFT JOIN 	modelled.emissions_factor ef
            ON 			e.emissionfactor_id = ef.emissionfactor_id
            LEFT JOIN 	modelled.activity_subcategory a
            ON 			e.activity_id = a.activity_id
            LEFT JOIN 	modelled.gpc_methodology m
            ON 			e.gpcmethod_id = m.gpcmethod_id
            LEFT JOIN 	modelled.global_warming_potential gwp
            ON 			(CASE WHEN e.gas_name = 'CH4' THEN
                                CASE WHEN e.gpc_reference_number LIKE 'I.5%' OR e.gpc_reference_number LIKE 'III.%' OR e.gpc_reference_number LIKE 'V%' THEN 'CH4nonfossil'
                                ELSE 'CH4fossil' END
                        ELSE e.gas_name END)  = gwp.gas_name
            AND 		gwp.time_horizon = '100 year'
            LEFT JOIN 	modelled.global_warming_potential gwp2
            ON 			(CASE WHEN e.gas_name = 'CH4' THEN
                                CASE WHEN e.gpc_reference_number LIKE 'I.5%' OR e.gpc_reference_number LIKE 'III.%' OR e.gpc_reference_number LIKE 'V%' THEN 'CH4nonfossil'
                                ELSE 'CH4fossil' END
                        ELSE e.gas_name END)  = gwp2.gas_name
            AND 		gwp2.time_horizon = '20 year'
            WHERE 		e.datasource_name = :datasource_name
            AND         e.spatial_granularity = :spatial_granularity
            AND 		e.actor_id = :actor_id
            AND 		e.gpc_reference_number = :gpc_reference_number
            AND 		e.emissions_year = :emissions_year
            GROUP BY 	e.gas_name;
            """
        )
        params = {
            "datasource_name": datasource_name,
            "spatial_granularity": spatial_granularity,
            "actor_id": actor_id,
            "gpc_reference_number": gpc_reference_number,
            "emissions_year": emissions_year,
            "gwp": gwp
        }
        result = session.execute(query, params).fetchall()

    return result

def db_query_eq_total(datasource_name, spatial_granularity, actor_id, gpc_reference_number, emissions_year, gwp):
    with SessionLocal() as session:
        # Ensure `gwp` is a safe column name string.
        if gwp not in {"ar2", "ar3", "ar4", "ar5", "ar6"}:
            raise ValueError("Invalid GWP provided.")

        query = text(
            f"""
            SELECT		COALESCE(sum(e.emissions_value * gwp.{gwp}),0) as emissions_value_100yr,
                        COALESCE(sum(e.emissions_value * gwp2.{gwp}),0) as emissions_value_20yr
            FROM 		modelled.emissions e
            LEFT JOIN 	modelled.emissions_factor ef
            ON 			e.emissionfactor_id = ef.emissionfactor_id
            LEFT JOIN 	modelled.activity_subcategory a
            ON 			e.activity_id = a.activity_id
            LEFT JOIN 	modelled.gpc_methodology m
            ON 			e.gpcmethod_id = m.gpcmethod_id
            LEFT JOIN 	modelled.global_warming_potential gwp
            ON 			(CASE WHEN e.gas_name = 'CH4' THEN
                                CASE WHEN e.gpc_reference_number LIKE 'I.5%' OR e.gpc_reference_number LIKE 'III.%' OR e.gpc_reference_number LIKE 'V%' THEN 'CH4nonfossil'
                                ELSE 'CH4fossil' END
                        ELSE e.gas_name END)  = gwp.gas_name
            AND 		gwp.time_horizon = '100 year'
            LEFT JOIN 	modelled.global_warming_potential gwp2
            ON 			(CASE WHEN e.gas_name = 'CH4' THEN
                                CASE WHEN e.gpc_reference_number LIKE 'I.5%' OR e.gpc_reference_number LIKE 'III.%' OR e.gpc_reference_number LIKE 'V%' THEN 'CH4nonfossil'
                                ELSE 'CH4fossil' END
                        ELSE e.gas_name END)  = gwp2.gas_name
            AND 		gwp2.time_horizon = '20 year'
            WHERE 		e.datasource_name = :datasource_name
            AND         e.spatial_granularity = :spatial_granularity
            AND 		e.actor_id = :actor_id
            AND 		e.gpc_reference_number = :gpc_reference_number
            AND 		e.emissions_year = :emissions_year;
            """
        )
        params = {
            "datasource_name": datasource_name,
            "spatial_granularity": spatial_granularity,
            "actor_id": actor_id,
            "gpc_reference_number": gpc_reference_number,
            "emissions_year": emissions_year,
            "gwp": gwp
        }
        result = session.execute(query, params).fetchone()

    return result

def db_source_dq(datasource_name, spatial_granularity, actor_id, gpc_reference_number, emissions_year, gwp):
    with SessionLocal() as session:
        # Ensure `gwp_column_name` is a safe column name string.
        if gwp not in {"ar2", "ar3", "ar4", "ar5", "ar6"}:
            raise ValueError("Invalid GWP provided.")

        query = text(
            f"""
            SELECT 	data_quality
            FROM 	datasource
            WHERE 	publisher_id = :datasource_name
            AND 	:emissions_year BETWEEN start_year AND end_year
            AND 	gpc_reference_number = :gpc_reference_number
            LIMIT 1;
            """
        )
        params = {
            "datasource_name": datasource_name,
            "spatial_granularity": spatial_granularity,
            "actor_id": actor_id,
            "gpc_reference_number": gpc_reference_number,
            "emissions_year": emissions_year,
            "gwp": gwp
        }
        result = session.execute(query, params).fetchone()

        return result[0] if result else None

# query for the detailed emissions data
def db_query(datasource_name, spatial_granularity, actor_id, gpc_reference_number, emissions_year, gwp):
    with SessionLocal() as session:
        # Ensure `gwp` is a safe column name string.
        if gwp not in {"ar2", "ar3", "ar4", "ar5", "ar6"}:
            raise ValueError("Invalid GWP column name provided.")

        query = text(
            f"""
            SELECT		e.emissions_value,
             			e.gas_name,
             			ef.emissionfactor_value,
             			a.activity_name,
             			e.activity_value,
             			a.activity_units,
             			a.activity_subcategory_type,
             			m.methodology_name,
                        e.geometry as emissions_geometry,
             			COALESCE(gwp.{gwp},0) as gwp_100yr,
             			COALESCE(e.emissions_value * gwp.{gwp},0) as emissions_value_100yr,
                        COALESCE(e.emissions_value * gwp2.{gwp},0) as emissions_value_20yr
            FROM 		modelled.emissions e
            LEFT JOIN 	modelled.emissions_factor ef
            ON 			e.emissionfactor_id = ef.emissionfactor_id
            LEFT JOIN 	modelled.activity_subcategory a
            ON 			e.activity_id = a.activity_id
            LEFT JOIN 	modelled.gpc_methodology m
            ON 			e.gpcmethod_id = m.gpcmethod_id
            LEFT JOIN 	modelled.global_warming_potential gwp
            ON 			(CASE WHEN e.gas_name = 'CH4' THEN
                                CASE WHEN e.gpc_reference_number LIKE 'I.5%' OR e.gpc_reference_number LIKE 'III.%' OR e.gpc_reference_number LIKE 'V%' THEN 'CH4nonfossil'
                                ELSE 'CH4fossil' END
                        ELSE e.gas_name END)  = gwp.gas_name
            AND 		gwp.time_horizon = '100 year'
            LEFT JOIN 	modelled.global_warming_potential gwp2
            ON 			(CASE WHEN e.gas_name = 'CH4' THEN
                                CASE WHEN e.gpc_reference_number LIKE 'I.5%' OR e.gpc_reference_number LIKE 'III.%' OR e.gpc_reference_number LIKE 'V%' THEN 'CH4nonfossil'
                                ELSE 'CH4fossil' END
                        ELSE e.gas_name END)  = gwp2.gas_name
            AND 		gwp2.time_horizon = '20 year'
            WHERE 		e.datasource_name = :datasource_name
            AND         e.spatial_granularity = :spatial_granularity
            AND 		e.actor_id = :actor_id
            AND 		e.gpc_reference_number = :gpc_reference_number
            AND 		e.emissions_year = :emissions_year
            """
        )
        params = {
            "datasource_name": datasource_name,
            "spatial_granularity": spatial_granularity,
            "actor_id": actor_id,
            "gpc_reference_number": gpc_reference_number,
            "emissions_year": emissions_year,
            "gwp": gwp
        }
        result = session.execute(query, params).fetchall()

    return result

@api_router.get("/source/{datasource_name}/{spatial_granularity}/{actor_id}/{emissions_year}/{gpc_reference_number}", summary="Get emissions for any spatial granularity")
def get_emissions_by_city_and_year(
    datasource_name: str,  # The name of the data source to query.
    spatial_granularity: str,  # The level of spatial granularity for the emissions data (e.g., country, region, city).
    actor_id: str,  # Identifier for the actor (e.g., city, region country) code associated with the emissions data.
    emissions_year: int,  # The year for which emissions data is requested.
    gpc_reference_number: str,  # Reference number associated with the Global Protocol for Community-Scale Greenhouse Gas Emission Inventories (GPC).
    gwp: str = "ar5"  # Global warming potential impact factor, default is 'ar5'. Should be one of: ar2, ar3, ar4, ar5, or ar6.
    ):
    """
    Retrieve emissions data based on specified parameters.

    - `datasource_name`: Specifies the data source for emissions.
    - `spatial_granularity`: Determines the geographical resolution of the data.
    - `actor_id`: Unique identifier for the entity contributing to or associated with emissions.
    - `emissions_year`: Year for which the emissions data is required.
    - `gpc_reference_number`: GPC reference number related to emissions data.
    - `gwp`: (optional) Global warming potential to use in calculations. Defaults to "ar5".

    Returns a structured response containing totals and detailed records of emissions for the specified parameters.
    """

    records = db_query_total(datasource_name, spatial_granularity, actor_id, gpc_reference_number, emissions_year, gwp)

    if not records:
        raise HTTPException(status_code=404, detail="No data available")

    record_details = db_query(datasource_name, spatial_granularity, actor_id, gpc_reference_number, emissions_year, gwp)

    data_quality = db_source_dq(datasource_name, spatial_granularity, actor_id, gpc_reference_number, emissions_year, gwp)

    record_eq = db_query_eq_total(datasource_name, spatial_granularity, actor_id, gpc_reference_number, emissions_year, gwp)

    results = {
            "totals": {
                "emissions": {
                    "co2_mass": "0",
                    "co2_co2eq": "0",
                    "ch4_mass": "0",
                    "ch4_co2eq_100yr": "0",
                    "ch4_co2eq_20yr": "0",
                    "n2o_mass": "0",
                    "n2o_co2eq_100yr": "0",
                    "n2o_co2eq_20yr": "0",
                    "co2eq_100yr": "0",
                    "co2eq_20yr": "0",
                    "gpc_quality": "",
                }
            },
            "records": []
        }

    emissions = results["totals"]["emissions"]
    for record in records:
        gas_name, emissions_value, gwp_100yr, emissions_value_100yr, emissions_value_20yr = record
        if gas_name == "CO2":
            emissions["co2_mass"] = str(emissions_value)
            emissions["co2_co2eq"] = str(emissions_value_100yr)
        elif gas_name == "CH4":
            emissions["ch4_mass"] = str(emissions_value)
            emissions["ch4_co2eq_100yr"] = str(emissions_value_100yr)
            emissions["ch4_co2eq_20yr"] = str(emissions_value_20yr)
        elif gas_name == "N2O":
            emissions["n2o_mass"] = str(emissions_value)
            emissions["n2o_co2eq_100yr"] = str(emissions_value_100yr)
            emissions["n2o_co2eq_20yr"] = str(emissions_value_20yr)
    if data_quality is not None:
        emissions["gpc_quality"] = str(data_quality)

    emissions_value_100yr, emissions_value_20yr = record_eq
    emissions["co2eq_100yr"] = str(emissions_value_100yr)
    emissions["co2eq_20yr"] = str(emissions_value_20yr)

    for detail in record_details:
            detail_dict = {
                "emissions_value": str(detail[0]),
                "gas_name": str(detail[1]),
                "emissionfactor_value": str(detail[2]),
                "activity_name": str(detail[3]),
                "activity_value": str(detail[4]),
                "activity_units": str(detail[5]),
                "activity_subcategory_type": detail[6],
                "methodology_name": str(detail[7]),
                "emissions_geometry": str(detail[8]),
                "gwp_100yr": str(detail[9]),
                "emissions_value_100yr": str(detail[10])
            }
            results["records"].append(detail_dict)

    return results
