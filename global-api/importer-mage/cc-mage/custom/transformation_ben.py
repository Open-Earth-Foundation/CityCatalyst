import pandas as pd

if 'custom' not in globals():
    from mage_ai.data_preparation.decorators import custom
if 'test' not in globals():
    from mage_ai.data_preparation.decorators import test

@custom
def merge_and_calculate_emissions(data, data_2):
    """
    data → cleaning_raw_data_ef # this is ef_df
    data_2 → cleaning_raw_data_ben # this is df

    Returns:
        Anything (e.g. data frame, dictionary, array, int, str, etc.)
    """
    # Ensure that both inputs are DataFrames
    if not isinstance(data, pd.DataFrame):
        raise TypeError(f"Expected data to be a DataFrame, but got {type(data)}")
    if not isinstance(data_2, pd.DataFrame):
        raise TypeError(f"Expected data_2 to be a DataFrame, but got {type(data_2)}")

    # mapping from BEN to IPCC
    fuel_mapping = {
        'Leña ': 'Wood/Wood Waste', 
        'Gas Licuado ': 'Liquefied Petroleum Gases', 
        'Kerosene y Aerokerosene': 'Jet Kerosene', 
        'Carbón de Leña ': 'Charcoal',
    }
    # Load the dataframes from the upstream blocks
    ef_df = data
    df = data_2

    # Preparing BEN raw data to be transformed (:
    
    # map BEN fuel names with IPCC fuel names
    df.loc[:, 'subcategory'] = df['subcategory'].replace(fuel_mapping)

    # applying a filter to select only the interested fuels
    df = df[df['subcategory'].isin(['Wood/Wood Waste', 'Charcoal', 'Liquefied Petroleum Gases', 'Jet Kerosene'])]
    df.reset_index(drop=True, inplace=True)

    # from IEA: 1 tep = 41.868 GJ = 39.68 MBtu = 11.63 MWh
    # raw data: TEP 
    # Units conversion
    TEP_to_TJ = 41.868 * 1e-3
    df.loc[:, 'activity_value'] *= TEP_to_TJ

    # Merge df with EF dataframe
    df = pd.merge(df, ef_df[['subcategory', 'emissionfactor_value', 'gas_name']], on=['subcategory'])

    # Convert 'emissionfactor_value' column to numeric type
    df['emissionfactor_value'] = pd.to_numeric(df['emissionfactor_value'])

    # Calculate emission values
    df['emissions_value'] = df['activity_value'] * df['emissionfactor_value']

    # Drop extra columns
    df = df.drop(columns=['user_type', 'subcategory', 'activity_units', 'emissionfactor_value', 'activity_units'])

    # Add columns and values
    df.loc[:, 'emissions_units'] = 'kg'
    df.loc[:, 'source_name'] = 'BEN'
    df.loc[:, 'actor_name'] = 'Argentina'
    df.loc[:, 'actor_id'] = 'AR'

    # Return the final DataFrame
    return df

@test
def test_output(output, *args) -> None:
    """
    Template code for testing the output of the block.
    """
    assert output is not None, 'The output is undefined'
    assert isinstance(output, pd.DataFrame), 'The output is not a DataFrame'