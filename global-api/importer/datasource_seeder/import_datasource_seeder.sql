CREATE TEMP TABLE IF NOT EXISTS datasource_staging (LIKE datasource INCLUDING ALL);

/* Clear the staging table */

TRUNCATE datasource_staging;

/* Load the staging table from the transformed file */

\copy datasource_staging (datasource_id,publisher_id,source_type,dataset_url,access_type,geographical_location,start_year,end_year,latest_accounting_year,frequency_of_update,spatial_resolution,language,accessibility,data_quality,notes,units,methodology_url,retrieval_method,api_endpoint,gpc_reference_number,datasource_name,dataset_name,methodology_description,transformation_description,scope) from 'datasource_seeder.csv' with CSV HEADER;

/* Update the main table with the staging table */

INSERT INTO datasource (datasource_id,publisher_id,source_type,dataset_url,access_type,geographical_location,start_year,end_year,latest_accounting_year,frequency_of_update,spatial_resolution,language,accessibility,data_quality,notes,units,methodology_url,retrieval_method,api_endpoint,gpc_reference_number,datasource_name,dataset_name,methodology_description,transformation_description,scope)
SELECT datasource_id,publisher_id,source_type,dataset_url,access_type,geographical_location,start_year,end_year,latest_accounting_year,frequency_of_update,spatial_resolution,language,accessibility,data_quality,notes,units,methodology_url,retrieval_method,api_endpoint,gpc_reference_number,datasource_name,dataset_name,methodology_description,transformation_description,scope
FROM datasource_staging
ON CONFLICT ON CONSTRAINT datasource_pkey
DO UPDATE SET
  publisher_id = EXCLUDED.publisher_id,
  source_type = EXCLUDED.source_type,
  dataset_url = EXCLUDED.dataset_url,
  access_type = EXCLUDED.access_type,
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
  datasource_name = EXCLUDED.datasource_name,
  dataset_name = EXCLUDED.dataset_name,
  methodology_description = EXCLUDED.methodology_description,
  transformation_description = EXCLUDED.transformation_description,
  scope = EXCLUDED.scope,
  modified_date = now();

DROP TABLE datasource_staging;
