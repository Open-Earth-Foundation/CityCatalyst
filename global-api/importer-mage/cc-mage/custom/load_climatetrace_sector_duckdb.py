import duckdb 

if 'custom' not in globals():
    from mage_ai.data_preparation.decorators import custom
if 'test' not in globals():
    from mage_ai.data_preparation.decorators import test


@custom
def transform_custom(*args, **kwargs):
    """
    Climate Trace has alot of data and is too memory intensive for pandas
    """
    query = f''' SELECT * FROM raw_data/climatetrace/extracted/{climatetrace_sector}/DATA/*._emissions_sources.csv
            '''
    

    return {}


@test
def test_output(output, *args) -> None:
    """
    Template code for testing the output of the block.
    """
    assert output is not None, 'The output is undefined'
