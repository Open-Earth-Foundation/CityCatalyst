CREATE TEMP TABLE IF NOT EXISTS datasource_staging (LIKE datasource INCLUDING ALL);

/* Clear the staging table */

TRUNCATE datasource_staging;

/* Load the staging table from the transformed file */

\copy datasource_staging (datasource_id,publisher_id,name,description,source_type,access_type,url,geographical_location,start_year,end_year,latest_accounting_year,frequency_of_update,spatial_resolution,language,accessibility,data_quality,notes,units,methodology_url,retrieval_method,api_endpoint,gpc_reference_number) from 'datasource_seeder.csv' with CSV HEADER;

/* Update the main table with the staging table */

INSERT INTO datasource (datasource_id,publisher_id,name,description,source_type,access_type,url,geographical_location,start_year,end_year,latest_accounting_year,frequency_of_update,spatial_resolution,language,accessibility,data_quality,notes,units,methodology_url,retrieval_method,api_endpoint,gpc_reference_number)
SELECT datasource_id,publisher_id,name,description,source_type,access_type,url,geographical_location,start_year,end_year,latest_accounting_year,frequency_of_update,spatial_resolution,language,accessibility,data_quality,notes,units,methodology_url,retrieval_method,api_endpoint,gpc_reference_number
FROM datasource_staging
ON CONFLICT ON CONSTRAINT datasource_pkey
DO UPDATE SET
  publisher_id = EXCLUDED.publisher_id,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  source_type = EXCLUDED.source_type,
  access_type = EXCLUDED.access_type,
  url = EXCLUDED.url,
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
  methodology_url = EXCLUDED.methodology_url,
  retrieval_method = EXCLUDED.retrieval_method,
  api_endpoint = EXCLUDED.api_endpoint,
  gpc_reference_number = EXCLUDED.gpc_reference_number,
  modified_date = now();

DROP TABLE datasource_staging;
