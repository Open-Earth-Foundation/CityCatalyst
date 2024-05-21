--DROP TABLE IF EXISTS raw_data.climatetrace_source_staging;

CREATE TABLE IF NOT EXISTS raw_data.climatetrace_source_emissions AS
SELECT 	source_id, 
		source_name, 
		source_type, 
		iso3_country, 
		original_inventory_sector, 
		EXTRACT(YEAR FROM CAST(start_time as DATE)) AS year, 
		ST_MakePoint(lon, lat) as geometry,
		lat, 
		lon, 
		gas, 
		temporal_granularity, 
		activity, 
		activity_units, 
		emissions_factor, 
		emissions_factor_units,
		capacity,
		capacity_units,
	    capacity_factor
FROM raw_data.climatetrace_source_staging
WHERE emissions_quantity > 0
;
DELETE FROM raw_data.climatetrace_source_emissions
WHERE (original_inventory_sector, year) IN 
(SELECT DISTINCT original_inventory_sector, year
FROM raw_data.climatetrace_source_staging)
;

INSERT INTO raw_data.climatetrace_source_emissions
SELECT 	source_id, 
		source_name, 
		source_type, 
		iso3_country, 
		original_inventory_sector, 
		EXTRACT(YEAR FROM CAST(start_time as DATE)) AS year, 
		ST_MakePoint(lon, lat) as geometry,
		lat, 
		lon, 
		gas, 
		temporal_granularity, 
		activity, 
		activity_units, 
		emissions_factor, 
		emissions_factor_units,
		capacity,
		capacity_units,
	    capacity_factor
FROM raw_data.climatetrace_source_staging
WHERE emissions_quantity > 0
;

CREATE INDEX IF NOT EXISTS i 
ON raw_data.climatetrace_source_emissions (original_inventory_sector, year);
;