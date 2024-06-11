import pandas as pd
import osmnx as ox

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
    Template for exporting data to a PostgreSQL database.
    Specify your configuration settings in 'io_config.yaml'.

    Docs: https://docs.mage.ai/design/data-loading#postgresql
    """
    schema_name = 'raw_data'  # Specify the name of the schema to export data to
    table_name = 'osm_polygons_generator'  # Specify the name of the table to export data to
    config_path = path.join(get_repo_path(), 'io_config.yaml')
    config_profile = 'default'

    with Postgres.with_config(ConfigFileLoader(config_path, config_profile)) as loader:
        loader.export(
            df,
            schema_name,
            table_name,
            index=False,  # Specifies whether to include index in exported table
            if_exists='append',  # Specify resolution policy if table name already exists
        )

def process_record(record):
    osmid = record['osmid']
    locode = record['locode']
    gdf = ox.geocode_to_gdf(osmid, by_osmid=True)
    gdf['geometry'] = gdf['geometry'].apply(lambda geom: geom.wkt)
    gdf_dict = gdf.to_dict('records')
    df = pd.DataFrame(gdf_dict)
    df['locode'] = locode
    return df

def csv_generator(url):
    df = pd.read_csv(url).head(3)
    for index, row in df.iterrows():
        yield process_record(row.to_dict())

url = 'https://github.com/Open-Earth-Foundation/locode-to-osmid/blob/main/locode_to_osmid.csv?raw=true'
data_generator = csv_generator(url)

# Iterate over the generator and export each record to PostgreSQL
for record in data_generator:
    export_data_to_postgres(record)