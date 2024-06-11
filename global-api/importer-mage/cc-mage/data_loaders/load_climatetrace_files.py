import zipfile
import os
import io
import requests

if 'data_loader' not in globals():
    from mage_ai.data_preparation.decorators import data_loader
if 'test' not in globals():
    from mage_ai.data_preparation.decorators import test


@data_loader
def load_data_from_api(*args, **kwargs):
    """
    Load data from url in climatetrace directory 
    """
    climatetrace_sector = kwargs['climatetrace_sector']

    url = f'https://downloads.climatetrace.org/v02/sector_packages/{climatetrace_sector}.zip'
    response = requests.get(url)
    extract_dir = f'raw_data/climatetrace/extracted/{climatetrace_sector}/'

    with zipfile.ZipFile(io.BytesIO(response.content)) as zip_ref:
        zip_ref.extractall(extract_dir)

    extracted_files = zip_ref.namelist()
    
    return extracted_files

@test
def test_output(output, *args) -> None:
    assert output is not None, 'The file could not be downloaded'
