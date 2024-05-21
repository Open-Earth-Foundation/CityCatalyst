DROP TABLE IF EXISTS public.edgar_city_emissions_staging;

CREATE TABLE public.edgar_city_emissions_staging AS 
WITH 		city_edgar_emission as (
SELECT 		osm.locode,
			osm.geometry,
			osm.lat,
			osm.lon,
			osm.geom_name,
			edgar.geometry as grid_geometry,
			edgar.emissions,
			edgar.emissions_substance,
			edgar.emissions_year,
			edgar.emissions_units,
			edgar.emissions_description,
			edgar.gpc_refno,
    		ST_Area(ST_Intersection(edgar.geometry, osm.geometry)) / ST_Area(edgar.geometry) AS edgar_overlap_percentage,
    		ST_Area(ST_Intersection(osm.geometry, edgar.geometry)) / ST_Area(osm.geometry) AS osm_overlap_percentage
FROM 		raw_data.osm_polygon AS osm
LEFT JOIN 	raw_data.edgar_emissions AS edgar
ON 			ST_Intersects(osm.geometry, edgar.geometry)
WHERE 		ST_Area(osm.geometry) > 0
AND 		locode IN ( 'US PVK')		
			) 
SELECT 		uuid_generate_v5(uuid_nil(), CONCAT_WS(',', locode, 'edgar',emissions_substance, emissions_year, gpc_refno)) AS id,
			'edgar' as source_name,
			gpc_refno,
			geom_name as city_name,
			locode,
			'annual' as temporal_granularity,
			cast(emissions_year as numeric) as year,
			'unknown' as activity_name, 
			cast(null as numeric) as activity_value,
			'unknown' as activity_units,
			emissions_substance as gas_name,
			cast(null as numeric) as emission_factor_value,
			'unknown' as emission_factor_units,
			sum(emissions * edgar_overlap_percentage) * 1000 as emissions_value,
			'kg' as emissions_units
FROM 		city_edgar_emission e
GROUP BY 	locode, geom_name, emissions_year, emissions_substance, gpc_refno
;


CREATE INDEX IF NOT EXISTS i ON public.edgar_city_emissions_staging(id);

INSERT INTO public.citywide_emissions (id, source_name, "GPC_refno", city_name, locode, temporal_granularity, year, activity_name, activity_value, activity_units, gas_name, emission_factor_value, emission_factor_units, emissions_value, emissions_units)
SELECT id, source_name, gpc_refno, city_name, locode, temporal_granularity, year, activity_name, activity_value, activity_units, gas_name, emission_factor_value, emission_factor_units, emissions_value, emissions_units
FROM public.edgar_city_emissions_staging
ON CONFLICT (id) DO UPDATE
SET 
    source_name = EXCLUDED.source_name,
    "GPC_refno" = EXCLUDED."GPC_refno",
    city_name = EXCLUDED.city_name,
    locode = EXCLUDED.locode,
    temporal_granularity = EXCLUDED.temporal_granularity,
    year = EXCLUDED.year,
    activity_name = EXCLUDED.activity_name,
    activity_value = EXCLUDED.activity_value,
    activity_units = EXCLUDED.activity_units,
    gas_name = EXCLUDED.gas_name,
    emission_factor_value = EXCLUDED.emission_factor_value,
    emission_factor_units = EXCLUDED.emission_factor_units,
    emissions_value = EXCLUDED.emissions_value,
    emissions_units = EXCLUDED.emissions_units;

DROP TABLE IF EXISTS public.edgar_city_emissions_staging;