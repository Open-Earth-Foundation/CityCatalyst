from mage_ai.settings.repo import get_repo_path
from mage_ai.io.config import ConfigFileLoader
from mage_ai.io.s3 import S3
from os import path
import pandas as pd
from io import BytesIO

if 'data_loader' not in globals():
    from mage_ai.data_preparation.decorators import data_loader
if 'test' not in globals():
    from mage_ai.data_preparation.decorators import test


@data_loader
def load_from_s3_bucket(*args, **kwargs):
    """
    Template for loading data from a S3 bucket.
    Specify your configuration settings in 'io_config.yaml'.

    Docs: https://docs.mage.ai/design/data-loading#s3
    """
    config_path = path.join(get_repo_path(), 'io_config.yaml')
    config_profile = 'default'

    bucket_name = 'global-api-raw-data'
    object_key = 'local/argentina/IPCC_EF_2006/energy_EF_Argentina.xlsx'

    # Load the file as a binary stream
    s3 = S3.with_config(ConfigFileLoader(config_path, config_profile))
    file_obj = s3.client.get_object(Bucket=bucket_name, Key=object_key)['Body'].read()
    
    # Use pandas to read the Excel file
    data = pd.read_excel(BytesIO(file_obj))

    return data

@test
def test_output(output, *args) -> None:
    """
    Template code for testing the output of the block.
    """
    assert output is not None, 'The output is undefined'
    assert isinstance(output, pd.DataFrame), 'The output is not a DataFrame'