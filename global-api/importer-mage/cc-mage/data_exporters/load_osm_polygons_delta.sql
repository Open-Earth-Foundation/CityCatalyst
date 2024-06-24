DELETE FROM raw_data.osm_city_polygon
WHERE locode IN (SELECT locode FROM raw_data.osm_polygon_staging_delta);

INSERT INTO raw_data.osm_city_polygon
SELECT 	DISTINCT locode,
		osmid,
		ST_SetSRID(ST_GeomFromText(geometry), 4326) as geometry,
		ST_GeometryType(ST_GeomFromText(geometry))  AS geometry_type, 
		cast(bbox_north as numeric) as bbox_north,
		cast(bbox_south as numeric) as bbox_south,
		cast(bbox_east as numeric) as bbox_east,
		cast(bbox_west as numeric) as bbox_west,
		cast(place_id as numeric) as place_id,
		osm_type,
		cast(osm_id as numeric) osm_id,
		cast(lat as DOUBLE PRECISION) as lat,
		cast(lon as DOUBLE PRECISION) as lon,
		"_class" as geom_class,
		"_type" as geom_type,
		cast(place_rank as int) as place_rank,
		cast(importance as numeric) as importance,
		addresstype,
		"_name" as geom_name,
		display_name
FROM 	raw_data.osm_polygon_staging_delta;

DROP TABLE raw_data.osm_polygon_staging_delta;