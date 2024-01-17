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
from utils import DataSource, uuid_generate_v3, upsert_record

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--database_uri",
        help="database URI (e.g. postgresql://ccglobal:@localhost/ccglobal)",
        default=os.environ.get("DB_URI")
    )
    parser.add_argument(
        "--base_url",
        help="base url of the api",
        default=os.environ.get("CC_GLOBAL_API_BASE_URL")
    )
    args = parser.parse_args()

    base_url = args.base_url

    if base_url is None:
        raise ValueError("base_url is not set")

    database_uri = args.database_uri

    if database_uri is None:
        raise ValueError("database_uri is not set")

    engine = create_engine(args.database_uri)
    metadata_obj = MetaData()
    table = Table("datasource", metadata_obj, autoload_with=engine)

    PUBLISHER = "Joint Research Centre"

    # ---------------------------------------
    # create datasource objects
    # ---------------------------------------

    # I.3.1
    datasource_data = dict(
        publisher_id=PUBLISHER,
        name="EDGARv7.0 Manufacturing Combustion Emissions",
        description=None,
        source_type="third_party",
        access_type="globalapi",
        url="https://joint-research-centre.ec.europa.eu/index_en",
        geographical_location="global",
        start_year="2021",
        end_year="2021",
        latest_accounting_year="2021",
        frequency_of_update="annual",
        spatial_resolution="0.1 degree",
        language="en",
        accessibility=None,
        data_quality="medium",
        notes=None,
        units="kg",
        methodology_url="https://edgar.jrc.ec.europa.eu/dataset_ghg70#intro",
        retrieval_method="global_api",
        api_endpoint=f"{base_url}/api/v0/climatetrace/city/:locode/:year/:gpcReferenceNumber",
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
        name="EDGARv7.0 Road Transportation Emissions (No Resuspension)",
        description=None,
        source_type="third_party",
        access_type="globalapi",
        url="https://joint-research-centre.ec.europa.eu/index_en",
        geographical_location="global",
        start_year="2021",
        end_year="2021",
        latest_accounting_year="2021",
        frequency_of_update="annual",
        spatial_resolution="0.1 degree",
        language="en",
        accessibility=None,
        data_quality="medium",
        notes=None,
        units="kg",
        methodology_url="https://edgar.jrc.ec.europa.eu/dataset_ghg70#intro",
        retrieval_method="global_api",
        api_endpoint=f"{base_url}/api/v0/climatetrace/city/:locode/:year/:gpcReferenceNumber",
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
        upsert_record(engine, table, "datasource_id", record)
