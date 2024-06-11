--SELECT locode, bbox_north, bbox_south, bbox_east, bbox_west, geometry, 'osm' AS source_system
--FROM raw_data.osm_polygon
--WHERE locode NOT IN (SELECT locode FROM raw_data.custom_polygons)
--UNION issue with different datatypes
SELECT locode, bbox_north, bbox_south, bbox_east, bbox_west, polygon_wkt AS geometry, 'custom' as source_system
FROM raw_data.custom_polygons;
