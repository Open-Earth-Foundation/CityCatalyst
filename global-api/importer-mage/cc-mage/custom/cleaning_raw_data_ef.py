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
    # laod the df from the data loader
    ef_df = args[0]

    # mapping from IPCC to GPC
    ipcc_to_gpc = {
        '1.A.2 - Manufacturing Industries and Construction': 'I.3.1',
        '1.A.4.a - Commercial/Institutional': 'I.2.1',
        '1.A.4.b - Residential\n1.A.4.c.i - Stationary': 'I.1.1',
    }

    # mapping from gas name to gas formula
    gas_mapping = {
        'CARBON DIOXIDE':'CO2',
        'METHANE':'CH4',
        'NITROUS OXIDE': 'N2O'
    }

    # filter only for stationary energy
    ef_df = ef_df[(ef_df['Type of parameter'] == '2006 IPCC default')&(ef_df['Description'].str.contains('Emission Factor for Stationary Combustion'))]

    # define the list of fuel types to filter
    fuel_types = ['Wood/Wood Waste', 'Charcoal', 'Liquefied Petroleum Gases', 'Jet Kerosene']

    # filter the df based on the 'Fuel 2006' column
    ef_df = ef_df[ef_df['Fuel 2006'].isin(fuel_types)]

    # the values ​​don't change between sectors, so we can choose only one sector and this doesn't affect the subsequent calculations
    ef_df = ef_df[ef_df['IPCC 2006 Source/Sink Category']=='1.A.1 - Energy Industries']

    # gas mapping
    ef_df.loc[:, 'gas_name'] = ef_df['Gas'].apply(lambda x: gas_mapping[x] if x in gas_mapping else None)

    # delete unnecesary columns
    ef_df = ef_df.drop(
        columns=['EF ID', 'IPCC 1996 Source/Sink Category', 'IPCC 2006 Source/Sink Category', 'Fuel 1996', 'Technologies / Practices', 
                'Parameters / Conditions', 'Abatement / Control Technologies', 'Other properties', 'Equation', 'IPCC Worksheet', 
                'Technical Reference', 'Type of parameter', 'Region / Regional Conditions', 'Source of data', 'Data provider', 'Gas', 'Description', 'Unit']
    )

    # adding details
    ef_df = ef_df.rename(columns={'Value': 'emissionfactor_value', 'Fuel 2006': 'subcategory'})
    ef_df['unit_demoninator'] = 'TJ'
    ef_df['active_from'] = pd.to_datetime('2006-01-01')
    ef_df['active_to'] = pd.to_datetime('2030-12-31')
    ef_df['metadata'] = ''
    ef_df['datasource_name'] = "EFDB IPCC 2006"

    # Return the cleaned DataFrame
    return ef_df


@test
def test_output(output, *args) -> None:
    """
    Template code for testing the output of the block.
    """
    assert output is not None, 'The output is undefined'