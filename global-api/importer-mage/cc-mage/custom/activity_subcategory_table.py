if 'custom' not in globals():
    from mage_ai.data_preparation.decorators import custom
if 'test' not in globals():
    from mage_ai.data_preparation.decorators import test

@custom
def create_activity_df(*args, **kwargs):
    """
    args: The output from any upstream parent blocks (if applicable)

    Returns:
        Anything (e.g. data frame, dictionary, array, int, str, etc.)
    """
    # Load the ef_df from the upstream block
    ef_df = args[0]

    # Extract columns from ef_df
    activity = ef_df[['subcategory', 'unit_demoninator']]

    # Rename columns based on the Global-API schema 
    activity.rename(columns={'unit_demoninator': 'activity_units'}, inplace=True)

    # Add activity name
    activity['activity_name'] = 'fuel consumption'

    # Add activity_subcategory_type in this case: fuel type
    activity['activity_subcategory_type'] = activity['subcategory'].apply(lambda x: f'fuel_type:{x}')

    # Drop fuel_type column
    activity = activity.drop(columns='subcategory')

    # Return the new DataFrame
    return activity

@test
def test_output(output, *args) -> None:
    """
    Template code for testing the output of the block.
    """
    assert output is not None, 'The output is undefined'