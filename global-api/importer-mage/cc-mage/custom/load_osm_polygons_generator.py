import osmnx as ox
import pandas as pd
import geopandas as gpd
import time

from mage_ai.io.postgres import Postgres
from mage_ai.io.config import ConfigFileLoader
from mage_ai.data_preparation.decorators import data_exporter
import pandas as pd
from os import path
from mage_ai.settings.repo import get_repo_path

def process_record(record):
    osmid = record['osmid']
    locode = record['locode']
    try:
        gdf = ox.geocode_to_gdf(osmid, by_osmid=True)
        gdf['geometry'] = gdf['geometry'].apply(lambda geom: geom.wkt)
        gdf_dict = gdf.astype(str).to_dict('records')
        df = pd.DataFrame(gdf_dict)
        df['locode'] = locode
        df['osmid'] = osmid

        time.sleep(1)

    except Exception as e:
        # If an error occurs, create a DataFrame with only the 'locode' column
        df = pd.DataFrame({'locode': [locode], 'osmid': [osmid]})
        print(f"Error processing record with osmid {osmid}: {e}")
    return df

def csv_generator(url, country_code=None):
    df = pd.read_csv(url)
    if country_code:
        #df = df[df['locode']=='US PVK']
        df = df[df['locode'].str[:2] == country_code]
    for index, row in df.iterrows():
        yield process_record(row.to_dict())

# Define an exporter function to write data to PostgreSQL
@custom
def export_data_to_postgres(*args, **kwargs)-> None:
    country = kwargs['country']
    url = 'https://github.com/Open-Earth-Foundation/locode-to-osmid/blob/main/locode_to_osmid.csv?raw=true'
    data_generator = csv_generator(url, country)
    
    config_path = path.join(get_repo_path(), 'io_config.yaml')
    config_profile = 'default'
    
    # Setup PostgreSQL loader with configuration
    with Postgres.with_config(ConfigFileLoader(config_path, config_profile)) as loader:
        for record in data_generator:
            schema_name = 'raw_data'
            table_name = 'osm_polygon_staging'
            # Export each DataFrame to PostgreSQL
            loader.export(
                record,
                schema_name,
                table_name,
                if_exists='append',  # Append each record to the table
                index=False,
            )
            loader.commit()  # Commit after each export