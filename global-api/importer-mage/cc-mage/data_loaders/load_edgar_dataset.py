import xarray as xr

from mage_ai.io.file import FileIO
if 'data_loader' not in globals():
    from mage_ai.data_preparation.decorators import data_loader
if 'test' not in globals():
    from mage_ai.data_preparation.decorators import test


@data_loader
def load_data_from_file(data, *args, **kwargs):
    """
    Read in the file path from previous extract
    to process for raw_data table
    """
    filepath = data
    ds = xr.open_dataset(filepath)
    df_emissions = ds['emissions'].to_dataframe().reset_index()

    return df_emissions


@test
def test_output(output, *args) -> None:
    assert output is not None, 'The output is undefined'
