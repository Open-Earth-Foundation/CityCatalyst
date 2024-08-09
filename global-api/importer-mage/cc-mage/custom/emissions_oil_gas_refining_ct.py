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
    ## Emissions
    df = args[0]
    # Create a GeoDataFrame
    gdf = gpd.GeoDataFrame(df, geometry=gpd.points_from_xy(df.lon, df.lat))
    
    # Filter df
    gdf = gdf[['gas_name', 'emissions_value', 'emissions_year', 'emissions_units', 'gpc_refno', 'geometry']]

    # Add columns
    gdf.loc[:, 'source_name'] = 'Climate TRACE Fall_2023'
    gdf.loc[:, 'activity_value'] = ''               #empty rows, this data isn't available from the source
    gdf.loc[:, 'geometry_type'] = 'point'   

    # Convert geometries to WKT format to avoid circular references
    gdf['geometry'] = gdf['geometry'].apply(lambda geom: geom.wkt)

    # Rename column
    gdf.rename(columns={'geometry': 'geometry_value'}, inplace=True)

    return gdf


@test
def test_output(output, *args) -> None:
    """
    Template code for testing the output of the block.
    """
    assert output is not None, 'The output is undefined'
