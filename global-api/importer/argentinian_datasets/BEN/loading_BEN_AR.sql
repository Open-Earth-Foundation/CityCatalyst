-- The ID column is not unique based on the processed records, 
-- we have multiple acitivty records for single region_code, year, gas_name, GPC_refno
-- rather than upsert we will just delete existing source data and insert fresh with egenerated id to make record unique
-- the route for regions will need to be aggregated over region_code, year, gas_name, GPC_refno
DELETE FROM country_code WHERE source_name = 'BEN';

-- Update the main table with the staging table
INSERT INTO country_code (
    id,source_name,"GPC_refno",country_name,country_code,temporal_granularity,year,activity_name,activity_value,
    activity_units,gas_name,emission_factor_value,emission_factor_units,emissions_value,emissions_units
    )
SELECT 	gen_random_uuid() as id,
		source_name,
		"GPC_refno",
		country_name,
		country_code,
		temporal_granularity,
		cast(year as int) as year,
		activity_name,
		activity_value,
		activity_units,
		gas_name,
		emission_factor_value,
		emission_factor_units,
		emissions_value,
		emissions_units
FROM 	ben_country_emissions_staging;

-- Drop the staging table
DROP TABLE ben_country_emissions_staging;