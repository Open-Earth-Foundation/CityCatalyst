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
    Load data from url in edgar base directory 
    https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/EDGAR/datasets/v80_FT2022_GHG/
    """

    edgar_gas = kwargs['edgar_gas']
    edgar_year = kwargs['edgar_year']
    edgar_industry = kwargs['edgar_industry']


    url = f'https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/EDGAR/datasets/v80_FT2022_GHG/{edgar_gas}/{edgar_industry}/emi_nc/v8.0_FT2022_GHG_{edgar_gas}_{edgar_year}_{edgar_industry}_emi_nc.zip'
    response = requests.get(url)
    extract_dir = f'raw_data/edgar/extracted/'

    with zipfile.ZipFile(io.BytesIO(response.content)) as zip_ref:
        zip_ref.extractall(extract_dir)

    extracted_files = zip_ref.namelist()
    extracted_not_readme_files = [file for file in extracted_files if '_readme.html' not in file]
    extracted_file_path = os.path.join(extract_dir, extracted_not_readme_files[0])

    return extracted_file_path

@test
def test_output(output, *args) -> None:
    assert output is not None, 'The file could not be downloaded'
