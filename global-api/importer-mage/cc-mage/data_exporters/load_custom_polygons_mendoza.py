import geopandas as gpd
from shapely.geometry import Polygon
from shapely import wkt
import pandas as pd

from mage_ai.settings.repo import get_repo_path
from mage_ai.io.config import ConfigFileLoader
from mage_ai.io.postgres import Postgres
from pandas import DataFrame
from os import path

if 'data_exporter' not in globals():
    from mage_ai.data_preparation.decorators import data_exporter

@data_exporter
def export_data_to_postgres(df: DataFrame, **kwargs) -> None:

    # read in the file and load into database
    gdf = gpd.read_file('raw_data/custom_polygons/extracted/Limites Ciudad/Limites Ciudad.shp')
    gdf.crs = "EPSG:22192"
    gdf = gdf.to_crs("EPSG:4326")
    linestring = gdf['geometry'].iloc[0]
    polygon = Polygon(linestring)
    polygon_wkt = wkt.dumps(polygon)
    bbox = linestring.bounds
    bbox_north, bbox_south, bbox_east, bbox_west = bbox
    center_point = linestring.centroid

    # Create DataFrame
    data = {
        'locode': ['AR MDZ'],
        'bbox_north': [bbox_north],
        'bbox_south': [bbox_south],
        'bbox_east': [bbox_east],
        'bbox_west': [bbox_west],
        'center_lat': [center_point.y],
        'center_lon': [center_point.x],
        'polygon_wkt': [polygon_wkt]
    }

    df = pd.DataFrame(data)


    schema_name = 'raw_data'  # Specify the name of the schema to export data to
    table_name = 'custom_polygon_staging'  # Specify the name of the table to export data to
    config_path = path.join(get_repo_path(), 'io_config.yaml')
    config_profile = 'default'

    with Postgres.with_config(ConfigFileLoader(config_path, config_profile)) as loader:
        loader.export(
            df,
            schema_name,
            table_name,
            index=False,  # Specifies whether to include index in exported table
            if_exists='replace',  # Specify resolution policy if table name already exists
        )
