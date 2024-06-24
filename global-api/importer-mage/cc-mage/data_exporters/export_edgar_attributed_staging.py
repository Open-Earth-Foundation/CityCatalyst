import xarray as xr
import pandas as pd

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
    Load all the variable attribute details into the database
    """
    schema_name = 'raw_data'  
    table_name = 'edgar_attributes_staging'
    config_path = path.join(get_repo_path(), 'io_config.yaml')
    config_profile = 'default'

    attr_df = pd.DataFrame()
    filepath = data
    ds = xr.open_dataset(filepath)

    for var_name, var in ds.variables.items():
        attributes = {f'{var_name}_{attr_name}': attr_value for attr_name, attr_value in var.attrs.items()}
        df_attributes = pd.DataFrame.from_dict(attributes, orient='index').T
        attr_df = pd.concat([attr_df, df_attributes], axis=1)

    edgar_industry = kwargs['edgar_industry']
    attr_df['edgar_sector'] = edgar_industry

    with Postgres.with_config(ConfigFileLoader(config_path, config_profile)) as loader:
        loader.export(
            attr_df,
            schema_name,
            table_name,
            index=False,  
            if_exists='replace',
        )
    return attr_df