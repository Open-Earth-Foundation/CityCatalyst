-- The ID column is not unique based on the processed records, 
-- we have multiple acitivty records for single region_code, year, gas_name, GPC_refno
-- rather than upsert we will just delete existing source data and insert fresh with egenerated id to make record unique
-- the route for regions will need to be aggregated over region_code, year, gas_name, GPC_refno
DELETE FROM regionwide_emissions WHERE source_name = 'SESCO';

-- Update the main table with the staging table
INSERT INTO regionwide_emissions (
		id,source_name,"GPC_refno",region_name,region_code,temporal_granularity,year,activity_name,activity_value,
		activity_units,gas_name,emission_factor_value,emission_factor_units,emissions_value,emissions_units
		)
SELECT 	gen_random_uuid() as id,
		source_name,
		"GPC_refno",
		region_name,
		region_code,
		temporal_granularity,
		year,
		activity_name,
		activity_value,
		activity_units,
		gas_name,
		emission_factor_value,
		emission_factor_units,
		emissions_value,
		emissions_units
FROM sesco_region_emissions_staging
WHERE "GPC_refno" IS NOT NULL
AND gas_name IS NOT NULL;

-- Drop the staging table
DROP TABLE sesco_region_emissions_staging;