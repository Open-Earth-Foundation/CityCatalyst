/* Create a staging table */

CREATE TEMP TABLE IF NOT EXISTS country_code_staging (LIKE country_code INCLUDING ALL);

/* Clear the staging table */

TRUNCATE country_code_staging;

/* Load the staging table from the transformed file */

\copy country_code_staging (country_name,year,activity_name,emissions_value,country_code,gas_name,emissions_units,source_name,temporal_granularity,"GPC_refno",id) FROM 'IEA_energy.csv' WITH CSV HEADER;

/* Update the main table with the staging table */

INSERT INTO country_code (year,activity_name,emissions_value,country_code,gas_name,emissions_units,source_name,temporal_granularity,"GPC_refno", id)
    SELECT year,activity_name,emissions_value,country_code,gas_name,emissions_units,source_name,temporal_granularity,"GPC_refno", id
    FROM country_code_staging
    ON CONFLICT ON CONSTRAINT country_code_pkey DO NOTHING;

/* Drop the staging table */

DROP TABLE country_code_staging;
