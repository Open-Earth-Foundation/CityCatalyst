import geopandas as gpd
from shapely.geometry import Point, shape
from sqlalchemy import text

def is_inside(lat, lon, geojson):

    # Load GeoJSON file
    gdf = gpd.read_string(geojson)

    # Create a Point with the lat-lon
    point = Point(lon, lat)

    # Check if the point is within the polygon
    return any(point.within(shape(geom)) for geom in gdf['geometry'])

def lat_lon_to_locode(session, lat, lon):
    query = text("""SELECT locode
                    FROM osm
                    WHERE :lat <= bbox_north
                    AND :lat => bbox_south
                    AND :lon <= bbox_east
                    AND :lon => bbox_west""")
    result = session.execute(query, {"lat": lat, "lon": lon}).fetchall()
    for osm in result:
        if is_inside(lat, lon, osm['geojson']):
            return osm['locode']
    return None