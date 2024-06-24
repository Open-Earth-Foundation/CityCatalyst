from mage_ai.settings.repo import get_repo_path
from mage_ai.io.config import ConfigFileLoader
from mage_ai.io.postgres import Postgres
from pandas import DataFrame
import os
from os import path
import pandas as pd
import numpy as np  # Import numpy for NaN values

if 'data_exporter' not in globals():
    from mage_ai.data_preparation.decorators import data_exporter


@data_exporter
def export_data_to_postgres(df: DataFrame, **kwargs) -> None:
    """
    Parameterised pipeline to ingest climate trace into the raw data schema
    """
    table_name = 'climatetrace_source_staging'
    schema_name = 'raw_data' 
    config_path = path.join(get_repo_path(), 'io_config.yaml')
    config_profile = 'default'

    climatetrace_sector = kwargs['climatetrace_sector']
    directory = f'raw_data/climatetrace/extracted/{climatetrace_sector}/DATA/'

    for filename in os.listdir(directory):
        if filename.endswith("emissions_sources.csv"):
            filepath = os.path.join(directory, filename)
            chunk_size = 1000
            reader = pd.read_csv(filepath, chunksize=chunk_size)

            required_columns = [
                'source_id', 'source_name', 'source_type', 'iso3_country', 'original_inventory_sector',
                'start_time', 'end_time', 'lat', 'lon', 'geometry_ref', 'gas', 'emissions_quantity',
                'temporal_granularity', 'activity', 'activity_units', 'emissions_factor', 
                'emissions_factor_units', 'capacity', 'capacity_units', 'capacity_factor'
            ]
            dtype_map = {'source_type': 'VARCHAR', 'capacity': 'integer'}

            with Postgres.with_config(ConfigFileLoader(config_path, config_profile)) as loader:
                for chunk in reader:
                    missing_columns = set(required_columns) - set(chunk.columns)
                    for col in missing_columns:
                        chunk[col] = np.nan

                    chunk = chunk[required_columns]
                    chunk['source_type'] = chunk['source_type'].astype(str)

                    loader.export(
                        chunk,
                        schema_name,
                        table_name,
                        index=False,
                        if_exists='append', 
                        dtype=dtype_map 
                    )
