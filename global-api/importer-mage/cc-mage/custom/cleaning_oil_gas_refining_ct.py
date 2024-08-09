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
    df = args[0]

    # Filter df
    df = df[['source_id', 'source_name', 'source_type', 'iso3_country', 'subsector', 'lat', 'lon', 'gas', 'emissions_quantity', 'emissions_factor', 'emissions_factor_units', 'start_time', 'end_time']]

    # Rename columns
    df.rename(columns={'iso3_country': 'actor_id', 'subsector': 'activity_name', 'emissions_quantity': 'emissions_value', 'gas': 'gas_name', 'emissions_factor': 'emissionfactor_value'}, inplace=True)
    
    # Convert to datetime
    df['start_time'] = pd.to_datetime(df['start_time'])

    # Extract year
    df['emissions_year'] = df['start_time'].dt.year

    # Convert tonnes to kg
    df['emissions_value'] *= 1000

    # Add GPC refno
    df['gpc_refno'] = "I.8.1"

    # Add emissions units
    df['emissions_units'] = "kg"

    # Replace values
    df['gas_name'] = df['gas_name'].replace({'ch4': 'CH4', 'co2': 'CO2'})

    # Filter by gas_name
    df = df[df['gas_name'].isin(['CH4', 'CO2', 'N2O'])]

    return df

@test
def test_output(output, *args) -> None:
    """
    Template code for testing the output of the block.
    """
    assert output is not None, 'The output is undefined'