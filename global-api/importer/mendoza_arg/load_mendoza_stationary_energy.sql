/* Create a staging table */

CREATE TEMP TABLE IF NOT EXISTS mendoza_stationary_energy_staging (LIKE citywide_emissions INCLUDING ALL);

/* Clear the staging table */

TRUNCATE mendoza_stationary_energy_staging;

/* Load the staging table from the downloaded file */

\copy mendoza_stationary_energy_staging (id,source_name,"GPC_refno",city_name,locode,temporal_granularity,year, activity_name, activity_value, activity_units, gas_name, emission_factor_value, emission_factor_units, emissions_value, emissions_units) FROM 'epa.csv' WITH CSV HEADER;

/* Update the main table with the staging table */

INSERT INTO citywide_emissions (id,source_name,"GPC_refno",city_name,locode,temporal_granularity,year, activity_name, activity_value, activity_units, gas_name, emission_factor_value, emission_factor_units, emissions_value, emissions_units)
    SELECT id,source_name,"GPC_refno",city_name,locode,temporal_granularity,year, activity_name, activity_value, activity_units, gas_name, emission_factor_value, emission_factor_units, emissions_value, emissions_units
    FROM mendoza_stationary_energy_staging
    ON CONFLICT ON CONSTRAINT citywide_emissions_pkey
    DO UPDATE SET
        source_name = excluded.source_name,
        "GPC_refno" = excluded."GPC_refno",
        city_name = excluded.city_name,
        locode = excluded.locode,
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

/* Drop the staging table */

DROP TABLE mendoza_stationary_energy_staging;
