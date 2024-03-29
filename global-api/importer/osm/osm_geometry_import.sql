/* Create a staging table */

CREATE TEMP TABLE IF NOT EXISTS osm_staging (LIKE osm INCLUDING ALL);

/* Clear the staging table */

TRUNCATE osm_staging;

/* Load the staging table from the transformed file */

\copy osm_staging (geometry,bbox_north,bbox_south,bbox_east,bbox_west,place_id,osm_type,osm_id,lat,lon,class,type,place_rank,importance,addresstype,name,display_name,locode) FROM '/var/local/input-data/osm_geometry.csv' WITH CSV HEADER;

/* Delete conflicts */

DELETE FROM osm
WHERE EXISTS (SELECT 1 FROM osm_staging WHERE osm_staging.locode != osm.locode AND osm_staging.osm_id = osm.osm_id);

/* Update the main table with the staging table */

UPDATE osm
SET geometry = osm_staging.geometry,
    bbox_north = osm_staging.bbox_north,
    bbox_south = osm_staging.bbox_south,
    bbox_east = osm_staging.bbox_east,
    bbox_west = osm_staging.bbox_west,
    place_id = osm_staging.place_id,
    osm_type = osm_staging.osm_type,
    osm_id = osm_staging.osm_id,
    lat = osm_staging.lat,
    lon = osm_staging.lon,
    class = osm_staging.class,
    type = osm_staging.type,
    place_rank = osm_staging.place_rank,
    importance = osm_staging.importance,
    addresstype = osm_staging.addresstype,
    name = osm_staging.name,
    display_name = osm_staging.display_name
FROM osm_staging WHERE osm_staging.locode = osm.locode;

/* Insert new rows from the staging table */

INSERT INTO osm
SELECT osm_staging.*
FROM osm_staging
WHERE NOT EXISTS (SELECT 1 FROM osm WHERE osm.locode = osm_staging.locode);
