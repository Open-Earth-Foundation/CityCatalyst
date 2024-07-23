from mage_ai.settings.repo import get_repo_path
from mage_ai.io.config import ConfigFileLoader
from mage_ai.data_preparation.shared.secrets import get_secret_value
from mage_ai.io.s3 import S3
from mage_ai.io.duckdb import DuckDB
from os import path
import boto3
import duckdb
if 'data_loader' not in globals():
    from mage_ai.data_preparation.decorators import data_loader
if 'test' not in globals():
    from mage_ai.data_preparation.decorators import test


@data_loader
def load_from_s3_bucket(*args, **kwargs):
    """
    load excel document in s3
    """
    aws_access_key_id = get_secret_value('AWS_ACCESS_KEY_ID')
    aws_secret_access_key = get_secret_value('AWS_SECRET_ACCESS_KEY')
    aws_region = 'us-east-1'

    config_path = path.join(get_repo_path(), 'io_config.yaml')
    config_profile = 'default'

    session = boto3.Session(
        aws_access_key_id=aws_access_key_id,
        aws_secret_access_key=aws_secret_access_key,
        region_name=aws_region
    )

    s3_filename = 's3://global-api-raw-data/ipcc/EFDB_output.xlsx'

    conn = duckdb.connect()

    query = f"""
    install spatial;
    load spatial;

    SET s3_region='{aws_region}';
    SET s3_access_key_id='{aws_access_key_id}';
    SET s3_secret_access_key='{aws_secret_access_key}';

    CREATE OR REPLACE TABLE ipcc_emissionfactor as 
    SELECT * FROM st_read('{s3_filename}');
    """

    duckdb_loader = DuckDB.with_config(ConfigFileLoader(config_path, config_profile))
    results = duckdb_loader.execute(query)

    return 1



@test
def test_output(output, *args) -> None:
    """
    Template code for testing the output of the block.
    """
    assert output is not None, 'The output is undefined'
