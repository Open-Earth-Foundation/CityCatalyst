import pandas as pd

if 'custom' not in globals():
    from mage_ai.data_preparation.decorators import custom
if 'test' not in globals():
    from mage_ai.data_preparation.decorators import test


@custom
def transform_custom(*args, **kwargs):
    """
    args: The output from any upstream parent blocks (if applicable)

    Returns:
        Anything (e.g. data frame, dictionary, array, int, str, etc.)
    """
    ## Emission Factors 
    ef_df = args[0]

    # Filter df
    ef_df = ef_df[['source_id', 'actor_id', 'gas_name', 'emissionfactor_value', 'start_time', 'end_time']]  #Note: actor_id here is the country id

    # Rename columns according to the Global API schema
    ef_df.rename(columns={'start_time': 'active_from', 'end_time': 'active_to'}, inplace=True)

    # Add columns needed
    ef_df.loc[:, 'unit_denominator'] = 'bbl'   #bbl: Barrel
    ef_df.loc[:, 'datasource_name'] = 'Climate TRACE Fall_2023'
    ef_df.loc[:, 'metadata'] = ''

    return ef_df


@test
def test_output(output, *args) -> None:
    """
    Template code for testing the output of the block.
    """
    assert output is not None, 'The output is undefined'
