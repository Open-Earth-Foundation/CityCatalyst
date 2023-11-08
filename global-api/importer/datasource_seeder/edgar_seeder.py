"""seed datasource table with edgar data
-- query to get start and end year
SELECT
DISTINCT
    reference_number,
    MIN(year) AS start_year,
    MAX(year) AS end_year
FROM "GridCellEmissionsEdgar"
GROUP BY "reference_number";
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

    PUBLISHER = "Joint Research Centre"

    # ---------------------------------------
    # create datasource objects
    # ---------------------------------------

    # I.3.1
    datasource_data = dict(
        publisher_id=PUBLISHER,
        name="EDGARv7.0 Combustion for manufacturing",
        description="",
        source_type="",
        access_type="globalapi",
        url="https://joint-research-centre.ec.europa.eu/index_en",
        geographical_location="global",
        start_year="2021",
        end_year="2021",
        latest_accounting_year="2021",
        frequency_of_update="annual",
        spatial_resolution="0.1 degree",
        language="en",
        accessibility="",
        data_quality="medium",
        notes="",
        units="kg",
        methodology_url="https://edgar.jrc.ec.europa.eu/dataset_ghg70#intro",
        retrieval_method="global_api",
        api_endpoint=f"{BASE_URL}/api/v0/climatetrace/city/:locode/:year/:gpcReferenceNumber",
        gpc_reference_number="I.3.1",
    )

    datasource_data["datasource_id"] = uuid_generate_v3(
        datasource_data["publisher_id"]
        + datasource_data["name"]
        + datasource_data["gpc_reference_number"]
    )
    datasource_I31 = DataSource(**datasource_data)

    # II.1.1
    datasource_data = dict(
        publisher_id=PUBLISHER,
        name="EDGARv7.0 Road transportation (no resuspension)",
        description="",
        source_type="",
        access_type="globalapi",
        url="https://joint-research-centre.ec.europa.eu/index_en",
        geographical_location="global",
        start_year="2021",
        end_year="2021",
        latest_accounting_year="2021",
        frequency_of_update="annual",
        spatial_resolution="0.1 degree",
        language="en",
        accessibility="",
        data_quality="medium",
        notes="",
        units="kg",
        methodology_url="https://edgar.jrc.ec.europa.eu/dataset_ghg70#intro",
        retrieval_method="global_api",
        api_endpoint=f"{BASE_URL}/api/v0/climatetrace/city/:locode/:year/:gpcReferenceNumber",
        gpc_reference_number="II.1.1",
    )

    datasource_data["datasource_id"] = uuid_generate_v3(
        datasource_data["publisher_id"]
        + datasource_data["name"]
        + datasource_data["gpc_reference_number"]
    )
    datasource_II11 = DataSource(**datasource_data)

    # ---------------------------------------
    # insert records into database
    # ---------------------------------------
    merged_datasources = [datasource_I31, datasource_II11]
    records = [datasource.__dict__ for datasource in merged_datasources]

    for record in records:
        insert_record(engine, table, "datasource_id", record)
