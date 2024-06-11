import osmnx as ox
import geopandas as gpd
import pandas as pd

if 'transformer' not in globals():
    from mage_ai.data_preparation.decorators import transformer
if 'test' not in globals():
    from mage_ai.data_preparation.decorators import test


@transformer
def transform(data, *args, **kwargs):
    """
    Args:
        data: The output from the upstream parent block
        args: The output from any additional upstream blocks (if applicable)

    Returns:
        dataframe
    """
    # Specify your transformation logic here
    osmid = data['osmid'].iloc[0]
    locode = data['locode'].iloc[0]
    gdf = ox.geocode_to_gdf(osmid, by_osmid=True)
    geometry_wkt = gdf.geometry.apply(lambda geom: geom.wkt)
    df_geometry = pd.DataFrame(geometry_wkt, columns=['geometry'])
    df_attributes = gdf.drop(columns='geometry')
    df_with_geometry = pd.concat([df_attributes, df_geometry], axis=1)
    df_with_geometry['locode'] = locode

    return df_with_geometry.head(1)


@test
def test_output(output, *args) -> None:
    """
    Template code for testing the output of the block.
    """
    assert output is not None, 'The output is undefined'
