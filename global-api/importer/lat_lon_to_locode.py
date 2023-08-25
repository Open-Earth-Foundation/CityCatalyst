import re
from shapely.geometry import Point, shape
from shapely.wkt import loads
from sqlalchemy import text


def point_to_lat_lon(point):
    """extract lat lon from geoJSON point

    Parameters
    ----------
    point: str
        WKT representation

    Returns
    -------
    dic: dict
        dictionary with st_astext, lat, and lon
    """
    pattern = r"POINT\((?P<lon>[-\d.]+)\s+(?P<lat>[-\d.]+)\)"
    match = re.search(pattern, point)
    if match:
        lon = float(match.group("lon"))
        lat = float(match.group("lat"))
        return {"st_astext": point, "lon": lon, "lat": lat}
    else:
        print(f"ERROR: {point} does not conform to regular expresssion")


def lat_lon_inside_wkt(lat, lon, wkt):
    """test if lat lon is inside a WKT geometry

    Parameters
    ----------
    lat: float
        latitude value
    lon: float
        longitude value
    wkt: str
        geometry in well-known-text format

    Returns
    -------
    is_inside: bool
        boolean value indicating whether lat, lon is inside the WKT
    """
    point = Point(lon, lat)
    geometry = loads(wkt)
    return point.within(geometry)


def point_inside_wkt(point, wkt):
    """test if Point is inside a WKT geometry

    Parameters
    ----------
    point: str
        geojson point
    wkt: str
        geometry in well-known-text format

    Returns
    -------
    is_inside: bool
        boolean value indicating whether Point is inside the WKT
    """
    dic = point_to_lat_lon(point)
    lat, lon = dic["lat"], dic["lon"]
    return lat_lon_inside_wkt(lat, lon, wkt)


def lat_lon_to_locode(session, lat, lon):
    """converts a lat lon to a locode

    Parameters
    ----------
    lat: float
        latitude value
    lon: float
        longitude value
    session:
        sqlalchemy session

    Returns
    -------
    locode: str
        the locode value
    """
    query = text(
        """SELECT locode, geometry
                    FROM osm
                    WHERE :lat <= bbox_north
                    AND :lat >= bbox_south
                    AND :lon <= bbox_east
                    AND :lon >= bbox_west"""
    )
    result = session.execute(query, {"lat": lat, "lon": lon}).fetchall()
    for osm in result:
        if lat_lon_inside_wkt(lat, lon, osm["geometry"]):
            return osm["locode"]
    return None


def point_to_locode(session, point):
    """converts a Point to a locode

    Parameters
    ----------
    point: str
        geojson point
    session:
        sqlalchemy session

    Returns
    -------
    locode: str
        the locode value
    """
    coord_dic = point_to_lat_lon(point)
    lat, lon = coord_dic["lat"], coord_dic["lon"]
    return lat_lon_to_locode(session, lat, lon)
