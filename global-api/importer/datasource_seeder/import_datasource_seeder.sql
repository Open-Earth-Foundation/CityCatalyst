
DROP TABLE IF EXISTS datasource_staging;

CREATE TEMP TABLE datasource_staging (LIKE datasource INCLUDING ALL);

/* Clear the staging table */

TRUNCATE datasource_staging;

/* Load the staging table from the transformed file */

\copy datasource_staging (datasource_id,publisher_id,datasource_name,dataset_name,dataset_description,source_type,access_type,dataset_url,geographical_location,start_year,end_year,latest_accounting_year,frequency_of_update,spatial_resolution,language,accessibility,data_quality,notes,units,methodology_description,methodology_url,transformation_description,retrieval_method,api_endpoint,gpc_reference_number,scope) from 'datasource_seeder.yaml' with CSV HEADER;

/* Update the main table with the staging table */

INSERT INTO datasource (datasource_id,publisher_id,datasource_name,dataset_name,dataset_description,source_type,access_type,dataset_url,geographical_location,start_year,end_year,latest_accounting_year,frequency_of_update,spatial_resolution,language,accessibility,data_quality,notes,units,methodology_description,methodology_url,transformation_description,retrieval_method,api_endpoint,gpc_reference_number,scope)
SELECT datasource_id,publisher_id,datasource_name,dataset_name,dataset_description,source_type,access_type,dataset_url,geographical_location,start_year,end_year,latest_accounting_year,frequency_of_update,spatial_resolution,language,accessibility,data_quality,notes,units,methodology_description,methodology_url,transformation_description,retrieval_method,api_endpoint,gpc_reference_number,scope
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

DROP TABLE datasource_staging;