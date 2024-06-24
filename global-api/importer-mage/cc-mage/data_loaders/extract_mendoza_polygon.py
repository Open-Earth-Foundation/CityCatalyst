import zipfile
import os
import geopandas as gpd

from mage_ai.io.file import FileIO
if 'data_loader' not in globals():
    from mage_ai.data_preparation.decorators import data_loader
if 'test' not in globals():
    from mage_ai.data_preparation.decorators import test


@data_loader
def load_data_from_file(*args, **kwargs):
    """
    unzip file to extracted folder
    """
    filepath = 'raw_data/custom_polygons/Limites Ciudad-001.zip'
    extract_dir = 'raw_data/custom_polygons/extracted/'

    with zipfile.ZipFile(filepath, 'r') as zip_ref:
        zip_ref.extractall(extract_dir)

    return 1


@test
def test_output(output, *args) -> None:
    """
    Template code for testing the output of the block.
    """
    assert output is not None, 'The output is undefined'