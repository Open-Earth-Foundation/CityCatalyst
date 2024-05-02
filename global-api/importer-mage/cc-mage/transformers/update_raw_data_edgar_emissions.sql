CREATE TABLE IF NOT EXISTS raw_data.edgar_emissions AS 
SELECT  ST_SetSRID(ST_MakeEnvelope(lon - 0.05, lat - 0.05, lon + 0.05, lat + 0.05),  4326) AS geometry,
        e.lat, e.lon, e.emissions, a.lat_units, a.lon_units, a.emissions_substance, a.emissions_year, a.emissions_units, a.emissions_release, a.emissions_description, s.edgar_sector, s.ipcc_2006_code, s.gpc_refno
FROM raw_data.edgar_emissions_staging e
CROSS JOIN raw_data.edgar_attributes_staging a
LEFT JOIN raw_data.edgar_sector_description s
ON a.edgar_sector = s.edgar_sector
WHERE e.emissions > 0;

DELETE FROM raw_data.edgar_emissions
WHERE (emissions_description, emissions_substance, emissions_year) IN (
    SELECT emissions_description, emissions_substance, emissions_year 
    FROM raw_data.edgar_attributes_staging
);

INSERT INTO raw_data.edgar_emissions
SELECT  ST_SetSRID(ST_MakeEnvelope(lon - 0.05, lat - 0.05, lon + 0.05, lat + 0.05),  4326) AS geometry,
        e.lat, e.lon, e.emissions, a.lat_units, a.lon_units, a.emissions_substance, a.emissions_year, a.emissions_units, a.emissions_release, a.emissions_description, s.edgar_sector, s.ipcc_2006_code, s.gpc_refno
FROM raw_data.edgar_emissions_staging e
CROSS JOIN raw_data.edgar_attributes_staging a
LEFT JOIN raw_data.edgar_sector_description s
ON a.edgar_sector = s.edgar_sector
WHERE e.emissions > 0;

CREATE INDEX IF NOT EXISTS edgar_emission_i 
ON raw_data.edgar_emissions (emissions_substance, emissions_year, emissions_description);

CREATE INDEX IF NOT EXISTS edgat_emission_i_poly
ON raw_data.edgar_emissions (geometry);


DROP TABLE IF EXISTS raw_data.edgar_attributes_staging;
DROP TABLE IF EXISTS raw_data.edgar_emissions_staging;

