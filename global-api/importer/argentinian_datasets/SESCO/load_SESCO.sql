-- Create a staging table
CREATE TEMP TABLE IF NOT EXISTS region_code_staging (LIKE regionwide_emissions INCLUDING ALL);

-- Clear the staging table
TRUNCATE region_code_staging;

-- Load the staging table from the downloaded file
\copy region_code_staging (id,source_name,"GPC_refno",region_name,region_code,temporal_granularity,year,activity_name,activity_value,activity_units,gas_name,emission_factor_value,emission_factor_units,emissions_value,emissions_units) FROM 'processed_SESCO_AR.csv' WITH (FORMAT CSV, HEADER);

-- Update the main table with the staging table
INSERT INTO regionwide_emissions (id,source_name,"GPC_refno",region_name,region_code,temporal_granularity,year,activity_name,activity_value,activity_units,gas_name,emission_factor_value,emission_factor_units,emissions_value,emissions_units)
    SELECT id,source_name,"GPC_refno",region_name,region_code,temporal_granularity,year,activity_name,activity_value,activity_units,gas_name,emission_factor_value,emission_factor_units,emissions_value,emissions_units
    FROM region_code_staging
    ON CONFLICT ON CONSTRAINT regionwide_emissions_pkey
    DO UPDATE SET
        id = excluded.id,
        source_name = excluded.source_name,
        "GPC_refno" = excluded."GPC_refno",
        region_name = excluded.region_name,
        region_code = excluded.region_code,
        temporal_granularity = excluded.temporal_granularity,
        year = excluded.year,
        activity_name = excluded.activity_name,
        activity_value = excluded.activity_value,
        activity_units = excluded.activity_units,
        gas_name = excluded.gas_name,
        emission_factor_value = excluded.emission_factor_value,
        emission_factor_units = excluded.emission_factor_units,
        emissions_value = excluded.emissions_value,
        emissions_units = excluded.emissions_units;

-- Drop the staging table
DROP TABLE region_code_staging;