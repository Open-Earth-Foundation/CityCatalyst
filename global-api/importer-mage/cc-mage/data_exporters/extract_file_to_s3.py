import requests
from mage_ai.settings.repo import get_repo_path
from mage_ai.io.config import ConfigFileLoader
from mage_ai.io.s3 import S3
from pandas import DataFrame
from os import path

if 'data_exporter' not in globals():
    from mage_ai.data_preparation.decorators import data_exporter


@data_exporter
def export_data_to_s3(**kwargs) -> None:
    """
    Template for exporting data to a S3 bucket.
    Specify your configuration settings in 'io_config.yaml'.

    Docs: https://docs.mage.ai/design/data-loading#s3
    """

    """
    Load data from a URL and upload it to an S3 bucket.
    """
    url = kwargs['url']
    response = requests.get(url)
    response.raise_for_status()
    file_name = kwargs['file_name']

    with open(f'{file_name}', 'wb') as f:
        f.write(response.content)

    config_path = path.join(get_repo_path(), 'io_config.yaml')
    config_profile = 'default'

    bucket_name = 'global-api-raw-data'
    object_key = kwargs['object_key']

    S3.with_config(ConfigFileLoader(config_path, config_profile)).export(
        file_name,
        bucket_name,
        object_key,
    )
