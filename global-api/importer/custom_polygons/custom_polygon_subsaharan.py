import zipfile
import pandas as pd
import geopandas as gpd
from shapely.geometry import LineString
from shapely import wkt
import argparse
import requests
from io import BytesIO
import io
import os
from sqlalchemy import create_engine
import osmnx as ox
from sqlalchemy.sql import text
from shapely.geometry import Polygon
from shapely.ops import unary_union

def unzip_file(url, extract_to_path):
    response = requests.get(url)
    if response.status_code == 200:
        with zipfile.ZipFile(BytesIO(response.content), 'r') as zip_ref:
            zip_ref.extractall(extract_to_path)
        print("Extraction successful.")
    else:
        print("Failed to download the zip file.")

def multi_to_single(multi_polygon):
    return multi_polygon.convex_hull

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--database_uri",
        help="database URI (e.g. postgresql://ccglobal:@localhost/ccglobal)",
        default=os.environ.get("DB_URI"),
    )
    args = parser.parse_args()

    # # Part1: RW KGL
    gdf_rw = ox.geocode_to_gdf('R1708283', by_osmid=True)
    gdf_rw['geometry'] = gdf_rw['geometry'].apply(lambda x: x.wkt)
    gdf_rw['locode'] = 'RW KGL'
    df_rw = pd.DataFrame(gdf_rw)

    engine = create_engine(args.database_uri)
    df_rw.to_sql('osm_staging', engine, if_exists='replace', index=False)

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

    # Part2: NG ABV and NG LOS 
    url = "https://datacatalogfiles.worldbank.org/ddh-published/0039368/DR0048906/ngaadmbndaadm2osgof20170222.geojson?versionId=2023-01-19T03:44:38.1621981Z"
    gdf_ng = gpd.read_file(url)
    gdf_ng = gdf_ng.to_crs("EPSG:4326")
    names_to_filter = ['Abuja Municipal', 'Lagos Island']
    gdf_ng = gdf_ng[gdf_ng['admin2Name'].isin(names_to_filter)]
    locode_mapping = {'Abuja Municipal': 'NG ABV', 'Lagos Island': 'NG LOS'}
    gdf_ng['locode'] = gdf_ng['admin2Name'].map(locode_mapping)
    gdf_ng = gdf_ng.explode()
    gdf_ng = gdf_ng[['locode', 'geometry']]
    gdf_ng[['bbox_west', 'bbox_south', 'bbox_east', 'bbox_north']] = gdf_ng.geometry.bounds
    gdf_ng['lat'] = gdf_ng.geometry.centroid.y
    gdf_ng['lon'] = gdf_ng.geometry.centroid.x
    gdf_ng['area'] = gdf_ng.geometry.area
    gdf_ng['type'] = 'custom'
    gdf_ng['geometry'] = gdf_ng['geometry'].apply(lambda x: x.wkt)
    df_ng = pd.DataFrame(gdf_ng)

    engine = create_engine(args.database_uri)
    df_ng.to_sql('osm_staging', engine, if_exists='replace', index=False)

    # Define the UPSERT query using text() construct
    upsert_query = """
    INSERT INTO osm (geometry, bbox_north, bbox_south, bbox_east, bbox_west, lat, lon, locode, type)
    SELECT geometry, bbox_north, bbox_south, bbox_east, bbox_west, lat, lon, locode, type
    FROM osm_staging
    ON CONFLICT (locode)
    DO UPDATE SET
    geometry = EXCLUDED.geometry,
    bbox_north = EXCLUDED.bbox_north,
    bbox_south = EXCLUDED.bbox_south,
    bbox_east = EXCLUDED.bbox_east,
    bbox_west = EXCLUDED.bbox_west,
    lat = EXCLUDED.lat,
    lon = EXCLUDED.lon,
    type = EXCLUDED.type;

    DROP TABLE osm_staging
    """
    with engine.connect() as connection:
        try:
            result = connection.execute(text(upsert_query))
            connection.commit() 
            print("Query completed successfully.")
        except Exception as e:
            print("Error updating osm table:", e)
    
    # Part3: SL FNA 
    url = 'https://data.humdata.org/dataset/a4816317-a913-4619-b1e9-d89e21c056b4/resource/b6225ff4-80e2-428f-be5e-db5d2f43a3d6/download/sle_adm_gov_ocha_20231215_ab_shp.zip'
    unzip_file(url, extract_to_path='./extracted/')

    gdf_sl = gpd.read_file('./extracted/sle_admbnda_adm3_gov_ocha_20231215.shp')
    gdf_sl = gdf_sl.to_crs("EPSG:4326")
    gdf_sl = gdf_sl[gdf_sl['ADM2_EN'].str.contains('Western Area Urban')]
    gdf_sl = gdf_sl[~gdf_sl['ADM3_EN'].str.contains('Tasso Island')]
    gdf_sl['geometry'] = gdf_sl['geometry'].apply(multi_to_single)
    outer_polygon = unary_union(gdf_sl['geometry'])
    outer_gdf = gpd.GeoDataFrame(geometry=[outer_polygon], crs="EPSG:4326")
    outer_gdf['locode'] = 'SL FNA'
    outer_gdf[['bbox_west', 'bbox_south', 'bbox_east', 'bbox_north']] = outer_gdf.geometry.bounds
    outer_gdf['lat'] = outer_gdf.geometry.centroid.y
    outer_gdf['lon'] = outer_gdf.geometry.centroid.x
    outer_gdf['area'] = outer_gdf.geometry.area
    outer_gdf['type'] = 'custom'
    outer_gdf['geometry'] = outer_gdf['geometry'].apply(lambda x: x.wkt)
    df_sl = pd.DataFrame(outer_gdf)

    engine = create_engine(args.database_uri)
    df_sl.to_sql('osm_staging', engine, if_exists='replace', index=False)

    # Define the UPSERT query using text() construct
    upsert_query = """
    INSERT INTO osm (geometry, bbox_north, bbox_south, bbox_east, bbox_west, lat, lon, locode, type)
    SELECT geometry, bbox_north, bbox_south, bbox_east, bbox_west, lat, lon, locode, type
    FROM osm_staging
    ON CONFLICT (locode)
    DO UPDATE SET
    geometry = EXCLUDED.geometry,
    bbox_north = EXCLUDED.bbox_north,
    bbox_south = EXCLUDED.bbox_south,
    bbox_east = EXCLUDED.bbox_east,
    bbox_west = EXCLUDED.bbox_west,
    lat = EXCLUDED.lat,
    lon = EXCLUDED.lon,
    type = EXCLUDED.type;

    DROP TABLE osm_staging
    """
    with engine.connect() as connection:
        try:
            result = connection.execute(text(upsert_query))
            connection.commit() 
            print("Query completed successfully.")
        except Exception as e:
            print("Error updating osm table:", e)
