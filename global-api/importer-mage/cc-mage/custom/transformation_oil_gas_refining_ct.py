import pandas as pd
import geopandas as gpd
from shapely.geometry import Point

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

    ##---------------------------------------------------------------------------------
    ## Activity_Subcategory 
    ##---------------------------------------------------------------------------------
    # Make a df copy
    act = df.copy()
    # Drop duplicate rows
    act = act.drop_duplicates(subset=['source_id', 'source_type'], ignore_index=True)

    # Create a json column with the extra information
    act.loc[:, 'activity_subcategory_type'] = act.apply(lambda row: f"facility_type:{row['source_type']}, facility_name:{row['source_name']}", axis=1)

    # Note: this info isn't in the data, it's from the methodology
    # Assign activity units
    act.loc[:, 'activity_units'] = 'bpd'   # units: barrels per day

    # Select the columns of interest
    act = act[['activity_name', 'activity_units', 'activity_subcategory_type']]

    ##---------------------------------------------------------------------------------
    ## Emission Factors 
    ##---------------------------------------------------------------------------------
    # Make a copy
    ef_df = df.copy()

    # Filter df
    ef_df = ef_df[['source_id', 'actor_id', 'gas_name', 'emissionfactor_value', 'start_time', 'end_time']]  #Note: actor_id here is the country id

    # Rename columns according to the Global API schema
    ef_df.rename(columns={'start_time': 'active_from', 'end_time': 'active_to'}, inplace=True)

    # Add columns needed
    ef_df.loc[:, 'unit_denominator'] = 'bbl'   #bbl: Barrel
    ef_df.loc[:, 'datasource_name'] = 'Climate TRACE'

    ##---------------------------------------------------------------------------------
    ## Emissions
    ##---------------------------------------------------------------------------------
    # Create a GeoDataFrame
    gdf = gpd.GeoDataFrame(df, geometry=gpd.points_from_xy(df.lon, df.lat))
    
    # Filter df
    gdf = gdf[['source_id', 'gas_name', 'emissions_value', 'year', 'emissions_units', 'gpc_refno', 'geometry']]

    # Add columns
    gdf.loc[:, 'source_name'] = 'Climate TRACE'
    gdf.loc[:, 'activity_value'] = ''               #empty rows, this data isn't available from the source
    gdf.loc[:, 'geometry_type'] = 'point'   

    # Convert geometries to WKT format to avoid circular references
    gdf['geometry'] = gdf['geometry'].apply(lambda geom: geom.wkt)

    return {
        'activity_subcategory': act,
        'emission_factors': ef_df,
        'emissions': gdf
    }

@test
def test_output(output, *args) -> None:
    """
    Template code for testing the output of the block.
    """
    assert output is not None, 'The output is undefined'