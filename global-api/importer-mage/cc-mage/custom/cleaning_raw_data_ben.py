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
    # Retrieve the DataFrame from the upstream block
    df = args[0]

    #print(df['year'].unique())

    # Convert 'activity_value' column to numeric type
    df['activity_value'] = pd.to_numeric(df['activity_value'], errors='coerce')

    # Delete rows with '0' in the 'activity_value' column
    df = df[df['activity_value'] != 0]

    # Reset index
    df.reset_index(drop=True, inplace=True)

    # Assign activity name and GPC_refno based on the user type
    subsector_dic = {
        'residential': 'I.1.1',
        'commercial': 'I.2.1',
        'agriculture': 'I.5.1',
        'industrial': 'I.3.1'
    }
    df.loc[:, 'GPC_refno'] = df['user_type'].apply(lambda x: subsector_dic[x] if x in subsector_dic else None)

    # Convert miles of TEP into TEP
    df.loc[:, 'activity_value'] *= 1000
    df.loc[:, 'activity_units'] = 'TEP'

    # Return the cleaned DataFrame
    return df

@test
def test_output(output, *args) -> None:
    """
    Template code for testing the output of the block.
    """
    assert output is not None, 'The output is undefined'
    assert isinstance(output, pd.DataFrame), 'The output is not a DataFrame'