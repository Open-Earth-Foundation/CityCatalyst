CREATE TABLE IF NOT EXISTS raw_data.custom_polygon AS 
SELECT locode, bbox_north, bbox_south, bbox_east, bbox_west, center_lat, center_lon, ST_GeomFromText(polygon_wkt, 4326) as geometry
FROM raw_data.custom_polygon_staging;

DELETE FROM raw_data.custom_polygon
WHERE locode IN (SELECT locode FROM raw_data.custom_polygon_staging);

INSERT INTO raw_data.custom_polygon
SELECT locode, bbox_north, bbox_south, bbox_east, bbox_west, center_lat, center_lon, ST_GeomFromText(polygon_wkt, 4326) as geometry
FROM raw_data.custom_polygon_staging;

DROP TABLE IF EXISTS raw_data.custom_polygon_staging;

UPDATE raw_data.osm_city_polygon AS tgt
SET
    geometry = src.geometry,
    bbox_north = src.bbox_north,
    bbox_south = src.bbox_south,
    bbox_east = src.bbox_east,
    bbox_west = src.bbox_west,
    geom_type = 'custom'
FROM raw_data.custom_polygon AS src
WHERE tgt.locode = src.locode;