"""seed datasource table with climatetrace data
-- query to get start and end year
SELECT
DISTINCT
    filename,
    EXTRACT(YEAR FROM MIN(start_time)) AS start_year,
    EXTRACT(YEAR FROM MAX(start_time)) AS end_year
FROM "asset"
GROUP BY "filename";
"""
import argparse
import os
from sqlalchemy import create_engine, MetaData, Table
from utils import DataSource, uuid_generate_v3, insert_record

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--database_uri",
        help="database URI (e.g. postgresql://ccglobal:@localhost/ccglobal)",
        default=os.environ.get("DB_URI"),
    )
    args = parser.parse_args()

    engine = create_engine(args.database_uri)
    metadata_obj = MetaData()
    table = Table("datasource", metadata_obj, autoload_with=engine)

    BASE_URL = "https://ccglobal.openearth.dev"

    if os.environ.get("ENV").lower() == 'production':
        BASE_URL = "https://ccglobal.openearth.cloud"

    PUBLISHER = "ClimateTRACE"

    # ---------------------------------------
    # create datasource objects
    # ---------------------------------------

    # asset_enteric-fermentation_emissions
    datasource_data = dict(
        publisher_id=PUBLISHER,
        name="asset_enteric-fermentation_emissions",
        description="Approach relies on the hypothesis that beef or daily facility area size can be used as a predictor to estimate the total cattle population, which can then be used to estimate enteric fermentation emissions.",
        source_type="",
        access_type="globalapi",
        url="https://climatetrace.org/",
        geographical_location="global",
        start_year="2020",
        end_year="2021",
        lastest_accounting_year="2021",
        frequency_of_update="",
        spatial_resolution="point source",
        language="en",
        accessibility="",
        data_quality="medium",
        notes="",
        units="kg",
        methodology_url="https://github.com/climatetracecoalition/methodology-documents/blob/main/Agriculture/Agriculture%20sector-%20Enteric%20fermentation%20and%20Manure%20management%20(asset)%20Methodology.pdf",
        retrieval_method="global_api",
        api_endpoint=f"{BASE_URL}/api/v0/climatetrace/city/:locode/:year/:gpcReferenceNumber",
        gpc_reference_number="V.1",
    )

    datasource_data["datasource_id"] = uuid_generate_v3(
        datasource_data["publisher_id"]
        + datasource_data["name"]
        + datasource_data["gpc_reference_number"]
    )
    datasource_enteric_fermentation = DataSource(**datasource_data)

    # asset_manure-management_emissions
    datasource_data = dict(
        publisher_id=PUBLISHER,
        name="asset_manure-management_emissions",
        description="Approach relies on the hypothesis that beef or daily facility area size can be used as a predictor to estimate the total cattle population, which can then be used to estimate manure management emissions.",
        source_type="",
        access_type="globalapi",
        url="https://climatetrace.org/",
        geographical_location="global",
        start_year="2020",
        end_year="2021",
        lastest_accounting_year="2021",
        frequency_of_update="",
        spatial_resolution="point source",
        language="en",
        accessibility="",
        data_quality="medium",
        notes="",
        units="kg",
        methodology_url="https://github.com/climatetracecoalition/methodology-documents/blob/main/Agriculture/Agriculture%20sector-%20Enteric%20fermentation%20and%20Manure%20management%20(asset)%20Methodology.pdf",
        retrieval_method="global_api",
        api_endpoint=f"{BASE_URL}/api/v0/climatetrace/city/:locode/:year/:gpcReferenceNumber",
        gpc_reference_number="V.1",
    )

    datasource_data["datasource_id"] = uuid_generate_v3(
        datasource_data["publisher_id"]
        + datasource_data["name"]
        + datasource_data["gpc_reference_number"]
    )
    datasource_manure_management = DataSource(**datasource_data)

    # asset_solid-waste-disposal_emissions
    datasource_data = dict(
        publisher_id=PUBLISHER,
        name="asset_solid-waste-disposal_emissions",
        description="ClimateTRACE sought to combine the best available sources into a model that could be deployed globally to estimate emissions.",
        source_type="",
        access_type="globalapi",
        url="https://climatetrace.org/",
        geographical_location="global",
        start_year="2021",
        end_year="2021",
        lastest_accounting_year="2021",
        frequency_of_update="",
        spatial_resolution="point source",
        language="en",
        accessibility="",
        data_quality="medium",
        notes="",
        units="kg",
        methodology_url="https://github.com/climatetracecoalition/methodology-documents/blob/main/Waste/Waste%20Sector-%20Solid%20Waste%20Disposal%20(asset)%20Methodology.pdf",
        retrieval_method="global_api",
        api_endpoint=f"{BASE_URL}/api/v0/climatetrace/city/:locode/:year/:gpcReferenceNumber",
        gpc_reference_number="III.1.1",
    )

    datasource_data["datasource_id"] = uuid_generate_v3(
        datasource_data["publisher_id"]
        + datasource_data["name"]
        + datasource_data["gpc_reference_number"]
    )
    datasource_solid_waste_disposal = DataSource(**datasource_data)

    # asset_domestic-aviation_emissions
    datasource_data = dict(
        publisher_id=PUBLISHER,
        name="asset_domestic-aviation_emissions",
        description="Emissions estimated based on fuel consumption.",
        source_type="",
        access_type="globalapi",
        url="https://climatetrace.org/",
        geographical_location="global",
        start_year="2015",
        end_year="2021",
        lastest_accounting_year="2021",
        frequency_of_update="",
        spatial_resolution="point source",
        language="en",
        accessibility="",
        data_quality="medium",
        notes="",
        units="kg",
        methodology_url="https://github.com/climatetracecoalition/methodology-documents/blob/main/Transportation/Transportation%20sector-%20Domestic%20and%20International%20Aviation%20Methodology.pdf",
        retrieval_method="global_api",
        api_endpoint=f"{BASE_URL}/api/v0/climatetrace/city/:locode/:year/:gpcReferenceNumber",
        gpc_reference_number="II.4.1",
    )

    datasource_data["datasource_id"] = uuid_generate_v3(
        datasource_data["publisher_id"]
        + datasource_data["name"]
        + datasource_data["gpc_reference_number"]
    )
    datasource_domestic_aviation = DataSource(**datasource_data)

    # asset_international-aviation_emissions
    datasource_data = dict(
        publisher_id=PUBLISHER,
        name="asset_international-aviation_emissions",
        description="Emissions estimated based on fuel consumption.",
        source_type="",
        access_type="globalapi",
        url="https://climatetrace.org/",
        geographical_location="global",
        start_year="2015",
        end_year="2021",
        lastest_accounting_year="2021",
        frequency_of_update="",
        spatial_resolution="point source",
        language="en",
        accessibility="",
        data_quality="medium",
        notes="",
        units="kg",
        methodology_url="https://github.com/climatetracecoalition/methodology-documents/blob/main/Transportation/Transportation%20sector-%20Domestic%20and%20International%20Aviation%20Methodology.pdf",
        retrieval_method="global_api",
        api_endpoint=f"{BASE_URL}/api/v0/climatetrace/city/:locode/:year/:gpcReferenceNumber",
        gpc_reference_number="II.4.3",
    )

    datasource_data["datasource_id"] = uuid_generate_v3(
        datasource_data["publisher_id"]
        + datasource_data["name"]
        + datasource_data["gpc_reference_number"]
    )
    datasource_international_aviation = DataSource(**datasource_data)

    # asset_coal-mining_emissions
    datasource_data = dict(
        publisher_id=PUBLISHER,
        name="asset_coal-mining_emissions",
        description="Estimate emissions from mining and quarrying extraction on a statistical basis by taking production numbers at national and facility level and applying specific emissions factors.",
        source_type="",
        access_type="globalapi",
        url="https://climatetrace.org/",
        geographical_location="global",
        start_year="2021",
        end_year="2021",
        lastest_accounting_year="2021",
        frequency_of_update="",
        spatial_resolution="point source",
        language="en",
        accessibility="",
        data_quality="medium",
        notes="",
        units="kg",
        methodology_url="https://github.com/climatetracecoalition/methodology-documents/blob/main/Fossil%20fuel%20operations/Fossil%20Fuel%20Operations%20sector-%20Coal%20mining%20Methodology.pdf",
        retrieval_method="global_api",
        api_endpoint=f"{BASE_URL}/api/v0/climatetrace/city/:locode/:year/:gpcReferenceNumber",
        gpc_reference_number="I.7.1",
    )

    datasource_data["datasource_id"] = uuid_generate_v3(
        datasource_data["publisher_id"]
        + datasource_data["name"]
        + datasource_data["gpc_reference_number"]
    )
    datasource_coal_mining = DataSource(**datasource_data)

    # asset_oil-and-gas-production-and-transport_emissions
    datasource_data = dict(
        publisher_id=PUBLISHER,
        name="asset_oil-and-gas-production-and-transport_emissions",
        description="ClimateTRACE uses a hybrid model to estimate emissions globally",
        source_type="",
        access_type="globalapi",
        url="https://climatetrace.org/",
        geographical_location="global",
        start_year="2015",
        end_year="2021",
        lastest_accounting_year="2021",
        frequency_of_update="",
        spatial_resolution="point source",
        language="en",
        accessibility="",
        data_quality="medium",
        notes="",
        units="kg",
        methodology_url="https://github.com/climatetracecoalition/methodology-documents/blob/main/Fossil%20fuel%20operations/Fossil%20Fuel%20Operations%20sector-%20Oil%20and%20Gas%20Production%20and%20Transport%20Oil%2C%20and%20Gas%20Refining%20Methodology.pdf",
        retrieval_method="global_api",
        api_endpoint=f"{BASE_URL}/api/v0/climatetrace/city/:locode/:year/:gpcReferenceNumber",
        gpc_reference_number="I.8.1",
    )

    datasource_data["datasource_id"] = uuid_generate_v3(
        datasource_data["publisher_id"]
        + datasource_data["name"]
        + datasource_data["gpc_reference_number"]
    )
    datasource_oil_gas_production = DataSource(**datasource_data)

    # asset_oil-and-gas-refining_emissions
    datasource_data = dict(
        publisher_id=PUBLISHER,
        name="asset_oil-and-gas-refining_emissions",
        description="ClimateTRACE uses a hybrid model to estimate emissions globally",
        source_type="",
        access_type="globalapi",
        url="https://climatetrace.org/",
        geographical_location="global",
        start_year="2015",
        end_year="2021",
        lastest_accounting_year="2021",
        frequency_of_update="",
        spatial_resolution="point source",
        language="en",
        accessibility="",
        data_quality="medium",
        notes="",
        units="kg",
        methodology_url="https://github.com/climatetracecoalition/methodology-documents/blob/main/Fossil%20fuel%20operations/Fossil%20Fuel%20Operations%20sector-%20Oil%20and%20Gas%20Production%20and%20Transport%20Oil%2C%20and%20Gas%20Refining%20Methodology.pdf",
        retrieval_method="global_api",
        api_endpoint=f"{BASE_URL}/api/v0/climatetrace/city/:locode/:year/:gpcReferenceNumber",
        gpc_reference_number="I.4.1",
    )

    datasource_data["datasource_id"] = uuid_generate_v3(
        datasource_data["publisher_id"]
        + datasource_data["name"]
        + datasource_data["gpc_reference_number"]
    )
    datasource_oil_gas_refining = DataSource(**datasource_data)

    # asset_road-transportation_emissions
    datasource_data = dict(
        publisher_id=PUBLISHER,
        name="asset_road-transportation_emissions",
        description="Hybrid emissions estimate model with two parts. 1. ML models trained to predict road transport activity 2. emission factors pipeline to convert activity to emissions.",
        source_type="",
        access_type="globalapi",
        url="https://climatetrace.org/",
        geographical_location="global",
        start_year="2021",
        end_year="2021",
        lastest_accounting_year="2021",
        frequency_of_update="",
        spatial_resolution="city",
        language="en",
        accessibility="",
        data_quality="medium",
        notes="",
        units="kg",
        methodology_url="https://github.com/climatetracecoalition/methodology-documents/blob/main/Transportation/Transportation%20Sector-%20Road%20transportation%20(asset)%20Methodology.pdf",
        retrieval_method="global_api",
        api_endpoint=f"{BASE_URL}/api/v0/climatetrace/city/:locode/:year/:gpcReferenceNumber",
        gpc_reference_number="II.1.1",
    )

    datasource_data["datasource_id"] = uuid_generate_v3(
        datasource_data["publisher_id"]
        + datasource_data["name"]
        + datasource_data["gpc_reference_number"]
    )
    datasource_road_transportation = DataSource(**datasource_data)

    # ---------------------------------------
    # insert records into database
    # ---------------------------------------
    merged_datasources = [
        datasource_road_transportation,
        datasource_oil_gas_refining,
        datasource_oil_gas_production,
        datasource_coal_mining,
        datasource_international_aviation,
        datasource_domestic_aviation,
        datasource_solid_waste_disposal,
        datasource_manure_management,
        datasource_enteric_fermentation,
    ]
    records = [datasource.__dict__ for datasource in merged_datasources]

    for record in records:
        insert_record(engine, table, "datasource_id", record)
