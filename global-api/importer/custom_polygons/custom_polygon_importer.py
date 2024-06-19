import zipfile
import pandas as pd
import geopandas as gpd
from shapely.geometry import LineString
from shapely import wkt
import argparse
import os
from sqlalchemy import create_engine
import osmnx as ox
from sqlalchemy.sql import text
from shapely.geometry import Polygon



def unzip_file(zip_file_path, extract_to_path='./'):
    """
    Unzips a file to a specified directory. If no extraction directory is provided, it defaults to the current directory.

    Args:
        zip_file_path (str): Path to the ZIP file.
        extract_to_path (str, optional): Directory where the contents of the ZIP file will be extracted. Defaults to './'.

    Returns:
        None
    """
    # Open the ZIP file for reading
    with zipfile.ZipFile(zip_file_path, 'r') as zip_ref:
        # Extract all the contents of the ZIP file to the specified directory
        zip_ref.extractall(extract_to_path)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--database_uri",
        help="database URI (e.g. postgresql://ccglobal:@localhost/ccglobal)",
        default=os.environ.get("DB_URI"),
    )
    parser.add_argument(
        "--zip_file_path",
        help="Path to the ZIP file",
        default="./Limites Ciudad-001.zip",
    )
    parser.add_argument(
        "--extract_to_path",
        help="Directory where the contents of the ZIP file will be extracted",
        default="./",
    )
    args = parser.parse_args()

    unzip_file(args.zip_file_path, args.extract_to_path)
    gdf = gpd.read_file(os.path.join(args.extract_to_path, './Limites Ciudad/Limites Ciudad.shp'))

    # Set the CRS to EPSG:22172
    gdf.crs = "EPSG:22192"

    # Convert the CRS of your data to EPSG:4326
    gdf = gdf.to_crs("EPSG:4326")

    linestring = gdf['geometry'].iloc[0]

    # Convert LineString to Polygon
    polygon = Polygon(linestring)

    # Convert LineString to well-known text (WKT) representation
    polygon_wkt = wkt.dumps(polygon)

    # Get the bounding box coordinates
    bbox = linestring.bounds

    # Extract individual bounding box coordinates
    bbox_north = bbox[3]
    bbox_south = bbox[1]
    bbox_east = bbox[2]
    bbox_west = bbox[0]

    # Add the locode for Mendoza 
    locode = 'AR MDZ'

    # Extract center point coordinates from gdf
    center_point = linestring.centroid
    lat = center_point.y
    lon = center_point.x

    # Retrieve the GeoDataFrame with the place boundary from OpenStreetMap
    place_gdf = ox.geocode_to_gdf('R4206710', by_osmid=True)

    # Extract required attributes
    data = {
        'geometry': [polygon_wkt],
        'bbox_north': [bbox_north],
        'bbox_south': [bbox_south],
        'bbox_east': [bbox_east],
        'bbox_west': [bbox_west],
        'locode': [locode],
        'lat': [lat],
        'lon': [lon],
        'type': ['custom']
    }

    # Merge with attributes from place_gdf
    data = {**data, **place_gdf.iloc[0].drop(['geometry', 'bbox_north', 'bbox_south', 'bbox_east', 'bbox_west', 'lat', 'lon', 'type']).to_dict()}

    # Create a DataFrame with the data to be inserted into the database
    df = pd.DataFrame(data)

    # Create a SQLAlchemy engine
    engine = create_engine(args.database_uri)

    # Write the DataFrame to the database table
    df.to_sql('osm_staging', engine, if_exists='replace', index=False)
    
    # Define the UPSERT query using text() construct
    upsert_query = """
    INSERT INTO osm (geometry, bbox_north, bbox_south, bbox_east, bbox_west, place_id, osm_type, osm_id, lat, lon, "class", "type", place_rank, importance, addresstype, name, display_name, locode)
    SELECT geometry, bbox_north, bbox_south, bbox_east, bbox_west, place_id, osm_type, osm_id, lat, lon, "class", "type", place_rank, importance, addresstype, name, display_name, locode
    FROM osm_staging
    ON CONFLICT (locode)
    DO UPDATE SET
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
    "class" = EXCLUDED."class",
    "type" = EXCLUDED."type",
    place_rank = EXCLUDED.place_rank,
    importance = EXCLUDED.importance,
    addresstype = EXCLUDED.addresstype,
    name = EXCLUDED.name,
    display_name = EXCLUDED.display_name;

    DROP TABLE osm_staging
    """

    with engine.connect() as connection:
        try:
            result = connection.execute(text(upsert_query))
            connection.commit() 
            print("Query completed successfully.")
        except Exception as e:
            print("Error updating osm table:", e)


    # Part2: AR VLO
    gdf_vl = ox.geocode_to_gdf('R1224657', by_osmid=True)
    gdf_vl['geometry'] = gdf_vl['geometry'].apply(lambda x: x.wkt)
    gdf_vl['locode'] = 'AR VLO'
    gdf_vl = pd.DataFrame(gdf_vl)

    engine = create_engine(args.database_uri)
    gdf_vl.to_sql('osm_staging', engine, if_exists='replace', index=False)

    # Define the UPSERT query using text() construct
    upsert_query = """
    INSERT INTO osm (geometry, bbox_north, bbox_south, bbox_east, bbox_west, place_id, osm_type, osm_id, lat, lon, "class", "type", place_rank, importance, addresstype, name, display_name, locode)
    SELECT geometry, bbox_north, bbox_south, bbox_east, bbox_west, place_id, osm_type, osm_id, lat, lon, "class", "type", place_rank, importance, addresstype, name, display_name, locode
    FROM osm_staging
    ON CONFLICT (locode)
    DO UPDATE SET
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
    "class" = EXCLUDED."class",
    "type" = EXCLUDED."type",
    place_rank = EXCLUDED.place_rank,
    importance = EXCLUDED.importance,
    addresstype = EXCLUDED.addresstype,
    name = EXCLUDED.name,
    display_name = EXCLUDED.display_name;

    DROP TABLE osm_staging
    """

    with engine.connect() as connection:
        try:
            result = connection.execute(text(upsert_query))
            connection.commit() 
            print("Query completed successfully.")
        except Exception as e:
            print("Error updating osm table:", e)    


    # Part3 AR DES
    gdf_de = ox.geocode_to_gdf('R5317158', by_osmid=True)
    gdf_de['geometry'] = gdf_de['geometry'].apply(lambda x: x.wkt)
    gdf_de['locode'] = 'AR DES'
    gdf_de = pd.DataFrame(gdf_de)

    engine = create_engine(args.database_uri)
    gdf_de.to_sql('osm_staging', engine, if_exists='replace', index=False)

    # Define the UPSERT query using text() construct
    upsert_query = """
    INSERT INTO osm (geometry, bbox_north, bbox_south, bbox_east, bbox_west, place_id, osm_type, osm_id, lat, lon, "class", "type", place_rank, importance, addresstype, name, display_name, locode)
    SELECT geometry, bbox_north, bbox_south, bbox_east, bbox_west, place_id, osm_type, osm_id, lat, lon, "class", "type", place_rank, importance, addresstype, name, display_name, locode
    FROM osm_staging
    ON CONFLICT (locode)
    DO UPDATE SET
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
    "class" = EXCLUDED."class",
    "type" = EXCLUDED."type",
    place_rank = EXCLUDED.place_rank,
    importance = EXCLUDED.importance,
    addresstype = EXCLUDED.addresstype,
    name = EXCLUDED.name,
    display_name = EXCLUDED.display_name;

    DROP TABLE osm_staging
    """

    with engine.connect() as connection:
        try:
            result = connection.execute(text(upsert_query))
            connection.commit() 
            print("Query completed successfully.")
        except Exception as e:
            print("Error updating osm table:", e) 