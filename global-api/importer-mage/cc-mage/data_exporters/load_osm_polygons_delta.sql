INSERT INTO raw_data.osm_polygon
SELECT DISTINCT *
FROM raw_data.osm_polygon_staging_delta
ON CONFLICT (locode) DO UPDATE SET 
    geometry = EXCLUDED.geometry, 
    bbox_north = EXCLUDED.bbox_north, 
    bbox_south = EXCLUDED.bbox_south, 
    bbox_east = EXCLUDED.bbox_east, 
    bbox_west = EXCLUDED.bbox_west, 
    place_id = EXCLUDED.place_id, 
    osm_type = EXCLUDED.osm_type, 
    osm_id = EXCLUDED.osm_id, 
    lat = EXCLUDED.lat, 
    lon = EXCLUDED.lon, 
    _class = EXCLUDED._class, 
    _type = EXCLUDED._type, 
    place_rank = EXCLUDED.place_rank, 
    importance = EXCLUDED.importance, 
    addresstype = EXCLUDED.addresstype, 
    _name = EXCLUDED._name, 
    display_name = EXCLUDED.display_name,
    osmid = EXCLUDED.osmid;

    DROP TABLE raw_data.osm_polygon_staging_delta;