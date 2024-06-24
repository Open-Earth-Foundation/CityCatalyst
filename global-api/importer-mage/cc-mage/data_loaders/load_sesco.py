import io
import pandas as pd
import requests
if 'data_loader' not in globals():
    from mage_ai.data_preparation.decorators import data_loader
if 'test' not in globals():
    from mage_ai.data_preparation.decorators import test


@data_loader
def load_data_from_api(*args, **kwargs):
    """
    Template for loading data from API
    """
    url = 'http://datos.energia.gob.ar/dataset/5bdc436c-60d4-4c86-98ab-59834d047700/resource/f0e4e10a-e4b8-44e6-bd16-763a43742107/download/ventas-excluye-ventas-a-empresas-del-sector-.csv'
    response = requests.get(url)

    return pd.read_csv(io.StringIO(response.text), sep=',')


@test
def test_output(output, *args) -> None:
    """
    Template code for testing the output of the block.
    """
    assert output is not None, 'The output is undefined'
