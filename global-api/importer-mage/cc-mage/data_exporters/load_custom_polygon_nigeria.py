import pandas as pd
import geopandas as gpd
from shapely import wkt

from mage_ai.settings.repo import get_repo_path
from mage_ai.io.config import ConfigFileLoader
from mage_ai.io.postgres import Postgres
from pandas import DataFrame
from os import path

if 'data_exporter' not in globals():
    from mage_ai.data_preparation.decorators import data_exporter


@data_exporter
def export_data_to_postgres(df: DataFrame, **kwargs) -> None:
    """
    Load locode for Nigeria
    """
    schema_name = 'raw_data'  # Specify the name of the schema to export data to
    table_name = 'custom_polygon_staging'  # Specify the name of the table to export data to
    config_path = path.join(get_repo_path(), 'io_config.yaml')
    config_profile = 'default'

    url = "https://datacatalogfiles.worldbank.org/ddh-published/0039368/DR0048906/ngaadmbndaadm2osgof20170222.geojson?versionId=2023-01-19T03:44:38.1621981Z"
    gdf_ng = gpd.read_file(url)
    gdf_ng = gdf_ng.to_crs("EPSG:4326")

    locode_mapping = {'Abuja Municipal': 'NG ABV', 'Lagos Island': 'NG LOS'}
    gdf_ng['locode'] = gdf_ng['admin2Name'].map(locode_mapping)
    #gdf_ng = gdf_ng.explode()
    #gdf_ng = gdf_ng[['locode', 'geometry']]
    #gdf_ng[['bbox_west', 'bbox_south', 'bbox_east', 'bbox_north']] = gdf_ng.geometry.bounds
    #gdf_ng['lat'] = gdf_ng.geometry.centroid.y
    #gdf_ng['lon'] = gdf_ng.geometry.centroid.x
    #gdf_ng['area'] = gdf_ng.geometry.area
    #gdf_ng['type'] = 'custom'
    #gdf_ng['polygon_wkt'] = gdf_ng['geometry'].apply(lambda x: x.wkt)
    #df_ng = pd.DataFrame(gdf_ng)

    # with Postgres.with_config(ConfigFileLoader(config_path, config_profile)) as loader:
    #     loader.export(
    #         df,
    #         schema_name,
    #         table_name,
    #         index=False,  # Specifies whether to include index in exported table
    #         if_exists='replace',  # Specify resolution policy if table name already exists
    #     )
    return gdf_ng
