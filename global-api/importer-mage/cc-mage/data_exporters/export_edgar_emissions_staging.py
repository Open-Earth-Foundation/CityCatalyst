import xarray as xr

from mage_ai.settings.repo import get_repo_path
from mage_ai.io.config import ConfigFileLoader
from mage_ai.io.postgres import Postgres
from pandas import DataFrame
from os import path

if 'data_exporter' not in globals():
    from mage_ai.data_preparation.decorators import data_exporter


@data_exporter
def export_data_to_postgres(data, **kwargs) -> None:
    """
    Read in the file and load into the database
    """
    schema_name = 'raw_data'  # Specify the name of the schema to export data to
    table_name = 'edgar_emissions_staging'  # Specify the name of the table to export data to
    config_path = path.join(get_repo_path(), 'io_config.yaml')
    config_profile = 'default'

    filepath = data
    ds = xr.open_dataset(filepath)
    df_emissions = ds['emissions'].to_dataframe().reset_index()

    with Postgres.with_config(ConfigFileLoader(config_path, config_profile)) as loader:
        loader.export(
            df_emissions,
            schema_name,
            table_name,
            index=False,
            if_exists='replace', 
        )

    return df_emissions
