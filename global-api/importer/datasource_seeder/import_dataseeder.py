import yaml
import pandas as pd
from sqlalchemy import create_engine
import json
import argparse
import os
from sqlalchemy.sql import text

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--database_uri",
        help="database URI (e.g. postgresql://ccglobal:@localhost/ccglobal)",
        default=os.environ.get("DB_URI"),
    )
    args = parser.parse_args()

    # Load YAML file into Python dictionary
    with open('datasource_seeder.yaml', 'r') as file:
        data_dict = yaml.safe_load(file)

    # Convert dictionary to DataFrame
    df = pd.DataFrame.from_dict(data_dict)

    # Check if column contains dictionaries convert to json
    for column in df.columns:
        if df[column].apply(lambda x: isinstance(x, dict)).all():
            df[column] = df[column].apply(json.dumps)

    # Connect to PostgreSQL
    engine = create_engine(args.database_uri)

    # Insert DataFrame into PostgreSQL table
    df.to_sql('datasource_staging', engine, if_exists='replace', index=False)

    #update sql script 

    sql_query = """
                INSERT INTO datasource (
                            datasource_id,
                            publisher_id,
                            datasource_name,
                            dataset_name,
                            dataset_description,
                            source_type,
                            access_type,
                            dataset_url,
                            geographical_location,
                            start_year,
                            end_year,
                            latest_accounting_year,
                            frequency_of_update,
                            spatial_resolution,
                            language,
                            accessibility,
                            data_quality,
                            notes,
                            units,
                            methodology_description,
                            methodology_url,
                            transformation_description,
                            retrieval_method,
                            api_endpoint,
                            gpc_reference_number,
                            scope
                )
                SELECT
                    datasource_id::uuid,
                    publisher_id,
                    datasource_name,
                    dataset_name::jsonb as dataset_name,
                    dataset_description::jsonb as dataset_description,
                    source_type,
                    access_type,
                    dataset_url,
                    geographical_location,
                    start_year,
                    end_year,
                    latest_accounting_year,
                    frequency_of_update,
                    spatial_resolution,
                    language,
                    accessibility,
                    data_quality,
                    notes,
                    units,
                    methodology_description::jsonb as methodology_description,
                    methodology_url,
                    transformation_description::jsonb as transformation_description,
                    retrieval_method,
                    api_endpoint,
                    gpc_reference_number,
                    scope
                FROM datasource_staging
                ON CONFLICT ON CONSTRAINT datasource_pkey
                DO UPDATE SET
                    publisher_id = EXCLUDED.publisher_id,
                    datasource_name = EXCLUDED.datasource_name,
                    dataset_name = EXCLUDED.dataset_name,
                    dataset_description = EXCLUDED.dataset_description,
                    source_type = EXCLUDED.source_type,
                    access_type = EXCLUDED.access_type,
                    dataset_url = EXCLUDED.dataset_url,
                    geographical_location = EXCLUDED.geographical_location,
                    start_year = EXCLUDED.start_year,
                    end_year = EXCLUDED.end_year,
                    latest_accounting_year = EXCLUDED.latest_accounting_year,
                    frequency_of_update = EXCLUDED.frequency_of_update,
                    spatial_resolution = EXCLUDED.spatial_resolution,
                    language = EXCLUDED.language,
                    accessibility = EXCLUDED.accessibility,
                    data_quality = EXCLUDED.data_quality,
                    notes = EXCLUDED.notes,
                    units = EXCLUDED.units,
                    methodology_description = EXCLUDED.methodology_description,
                    methodology_url = EXCLUDED.methodology_url,
                    transformation_description = EXCLUDED.transformation_description,
                    retrieval_method = EXCLUDED.retrieval_method,
                    api_endpoint = EXCLUDED.api_endpoint,
                    gpc_reference_number = EXCLUDED.gpc_reference_number,
                    scope = EXCLUDED.scope,
                    modified_date = now();
                """

    with engine.connect() as connection:
        try:
            result = connection.execute(text(sql_query))
            connection.commit() 
            print("Query completed successfully.")
        except Exception as e:
            print("Error updating datasource table:", e)