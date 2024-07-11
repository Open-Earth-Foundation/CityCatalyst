from mage_ai.settings.repo import get_repo_path
from mage_ai.io.config import ConfigFileLoader
from mage_ai.io.s3 import S3
from os import path
import pandas as pd
from io import BytesIO
import re

if 'data_loader' not in globals():
    from mage_ai.data_preparation.decorators import data_loader
if 'test' not in globals():
    from mage_ai.data_preparation.decorators import test

@data_loader
def load_from_s3_bucket(*args, **kwargs):
    """
    Template for loading data from an S3 bucket.
    Specify your configuration settings in 'io_config.yaml'.

    Docs: https://docs.mage.ai/design/data-loading#s3
    """
    config_path = path.join(get_repo_path(), 'io_config.yaml')
    config_profile = 'default'

    bucket_name = 'global-api-raw-data'
    object_keys = [
        'local/argentina/BEN/2022_raw_energy_balances_AR.xlsx',
        'local/argentina/BEN/2021_raw_energy_balances_AR.xlsx',
        'local/argentina/BEN/2020_raw_energy_balances_AR.xlsx',
        'local/argentina/BEN/2019_raw_energy_balances_AR.xlsx',
        'local/argentina/BEN/2018_raw_energy_balances_AR.xlsx'
    ]

    s3 = S3.with_config(ConfigFileLoader(config_path, config_profile))
    data_frames = []

    for object_key in object_keys:
        file_obj = s3.client.get_object(Bucket=bucket_name, Key=object_key)['Body'].read()
        data = pd.read_excel(BytesIO(file_obj))
        
        # Extract the year from the file name
        year = re.search(r'\d{4}', object_key).group()
        #print(year)
        
        # Clean the data and add the year column
        cleaned_data = clean_raw_data(data, year)
        data_frames.append(cleaned_data)

    # Concatenate all cleaned DataFrames into one
    combined_data = pd.concat(data_frames, ignore_index=True)

    return combined_data

def clean_raw_data(df, year):
    """
    Function to clean the raw data from each file and add the year column
    """
    # Delete extra and empty columns
    df = df.drop(
        columns=[
            'Unnamed: 0', 'Unnamed: 1', 'Unnamed: 2', 'Unnamed: 4', 'Unnamed: 5', 'Unnamed: 6', 'Unnamed: 7', 'Unnamed: 8', 'Unnamed: 9',
            'Unnamed: 10', 'Unnamed: 11', 'Unnamed: 12', 'Unnamed: 13', 'Unnamed: 14', 'Unnamed: 15', 'Unnamed: 16', 'Unnamed: 17',
            'Unnamed: 18', 'Unnamed: 19', 'Unnamed: 20', 'Unnamed: 21', 'Unnamed: 22', 'Unnamed: 25'
        ]
    )

    # Select rows with fuel consumption information
    df = df[17:49]
    
    # Delete total values
    df = df.drop([29, 30])

    # Assign new column names
    column_names = [
        'subcategory', # contains the fuel type
        'residential',
        'commercial',
        'agriculture',
        'industrial'
    ]
    df.columns = column_names

    # Restructure the data
    df = pd.melt(df, id_vars='subcategory', var_name='user_type', value_name='activity_value')

    # Add the year column
    df['year'] = int(year)

    return df