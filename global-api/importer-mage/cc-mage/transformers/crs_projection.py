import geopandas as gpd
from shapely.geometry import Polygon
from shapely import wkt
import pandas as pd

if 'transformer' not in globals():
    from mage_ai.data_preparation.decorators import transformer
if 'test' not in globals():
    from mage_ai.data_preparation.decorators import test


@transformer
def transform(data, *args, **kwargs):
    """
    Transforms custom polygon to standardised formate and projecion

    Returns:
         geomtry of custom polygon in a standardised projection
    """
    # Specify your transformation logic here
    gdf = gpd.read_file('raw_data/custom_polygons/extracted/Limites Ciudad/Limites Ciudad.shp')
    gdf.crs = "EPSG:22192"
    gdf = gdf.to_crs("EPSG:4326")
    linestring = gdf['geometry'].iloc[0]
    polygon = Polygon(linestring)
    polygon_wkt = wkt.dumps(polygon)
    bbox = linestring.bounds
    bbox_north, bbox_south, bbox_east, bbox_west = bbox
    center_point = linestring.centroid

    # Create DataFrame
    data = {
        'locode': ['AR MDZ'],
        'bbox_north': [bbox_north],
        'bbox_south': [bbox_south],
        'bbox_east': [bbox_east],
        'bbox_west': [bbox_west],
        'center_lat': [center_point.y],
        'center_lon': [center_point.x],
        'polygon_wkt': [polygon_wkt]
    }

    df = pd.DataFrame(data)

    return df


@test
def test_output(output, *args) -> None:
    """
    Template code for testing the output of the block.
    """
    assert output is not None, 'The output is undefined'
