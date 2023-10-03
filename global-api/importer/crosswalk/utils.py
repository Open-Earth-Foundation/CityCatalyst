#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Created on Fri Sep 29 16:36:08 2023

@author: maureenfonseca
"""

import csv
import calendar
from decimal import Decimal, getcontext
import fsspec
import geopandas as gpd
import geopy.distance
import json
from numpy import deg2rad, cos, meshgrid, gradient
import numpy as np
from pathlib import Path
import pyproj
from pyproj import Geod
from shapely import wkt
import shapely.wkt
from shapely.wkt import loads
from shapely.geometry import mapping
from shapely.geometry import Polygon
import shapely.geometry as geom
from sqlalchemy import text
import uuid
import xarray as xr
from xarray import DataArray


def write_dic_to_csv(output_dir, name, dic) -> None:
    """writes dictionary to a csv

    Parameters
    -----------
    output_dir: str
        path where csv will be created

    name: str
        the name of the CSV file without the .csv extension

    dic: List[Dict] or Dict
        data to store in CSV

    Returns
    --------
    None:
        a csv is created at {output_dir}/{name}.csv

    Example
    ---------
    write_dic_to_csv('./', 'test', {'id': 1, 'value': 2})
    """
    if isinstance(dic, dict):
        dic = [dic]

    with open(f"{output_dir}/{name}.csv", mode="w") as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=dic[0].keys())
        writer.writeheader()
        writer.writerows(dic)


def make_dir(path: str) -> None:
    """Create a new directory at this given path if one does not exist already

    Parameters
    ----------
    path: str
        the path to the directory you want to create

    Returns
    ---------
    None:

    Example
    --------
    make_dir('/path/to/new/directory')
    """
    assert isinstance(
        path, str
    ), f"ERROR: the path must be a string; you passed a {type(path)}"

    # settings mimic "mkdir -p <path>"
    Path(path).mkdir(parents=True, exist_ok=True)


def uuid_generate_v3(name, namespace=uuid.NAMESPACE_OID):
    """generate a version 3 UUID from namespace and name"""
    assert isinstance(name, str), "name needs to be a string"
    assert isinstance(namespace, uuid.UUID), "namespace needs to be a uuid.UUID"
    return str(uuid.uuid3(namespace, name))

def load_wkt(text):
    """load wkt as shapely polygon"""
    return wkt.loads(text)

def bounding_coords(lat_center, lon_center, distance_m=500):
    """calculate the boundaing coordinates from centroid and distance

    parameters
    ----------
    lat: float
        latitude of grid cell centroid in degrees

    lon: float
        longitude of grid cell centroid in degrees

    distance_m: float
        distance from the center

    returns
    --------
    dic: 
        dictionary with the bounding coordinates to be used later to defining the grid cell
        starting from lower left and moving counter clockwise
        each dictionary is the coordinates like this {'lat_min','lon_min','lat_max','lon_max'}
    """
    distance = geopy.distance.distance(meters=distance_m)
    geopy.distance.ELLIPSOID = 'WGS-84'

    lat_max = (
        distance
        .destination(point=(lat_center, lon_center), bearing=0)
        .latitude
    )
    
    lat_min = (
        distance
        .destination(point=(lat_center, lon_center), bearing=180)
        .latitude
    )
    
    lon_max = (
        distance
        .destination(point=(lat_center, lon_center), bearing=90)
        .longitude
    )
    
    lon_min = (
        distance
        .destination(point=(lat_center, lon_center), bearing=270)
        .longitude
    )
    
    return {'lat_min': lat_min, 'lon_min': lon_min, 'lat_max': lat_max, 'lon_max': lon_max}

def polygon_from_coords(lat_min, lon_min, lat_max, lon_max, *args, **kwargs):    
    coords = [
        (lon_min, lat_min),
        (lon_max, lat_min),
        (lon_max, lat_max),
        (lon_min, lat_max)
    ]
    return Polygon(coords)


def area_of_polygon(polygon):
    """area of polygon in square meters
    using ellipsoid defined by WGS84

    parameters
    ----------
    polygon: shapely.geometry.polygon.Polygon
        shapely polygon

    returns
    --------
    area: float
        area of the polygon in square meters

    example
    --------
    from shapely.geometry import Polygon
    coords = [(-20.70, 47.90),(-20.60, 47.90),(-20.60, 48.00),(-20.70, 48.00)]
    polygon = Polygon(coords)
    area = area_of_polygon(polygon)
    """
    geod = Geod(ellps="WGS84")
    area, _ = geod.geometry_area_perimeter(polygon)
    return abs(area)


def _reproject_polygon(polygon, proj_string):
    """transpose from latlon to llc

    ** NEEDS IMPROVEMENT **

    parameters
    ----------
    polygon: shapely.geometry.polygon.Polygon
        shapely polygon in lat/lon coordinates

    proj_string: str
        proj string to reproject with

    returns
    --------
    polygon_llc: shapely.geometry.polygon.Polygon
        shapely polygon transposed to LLC

    example
    ---------
    from shapely.wkt import loads
    wkt = 'POLYGON ((-80 -90, -79.9 -90, -79.9 -89.9, -80 -89.9, -80 -90))'
    old_polygon = loads(wkt)
    proj_string = " ".join(
        (
        "+proj=lcc",
        "+lat_1=33",
        "+lat_2=45",
        "+lat_0=40",
        "+lon_0=-97",
        "+x_0=0",
        "+y_0=0",
        "+ellps=WGS84",
        "+units=m",
        "+no_defs"
        )
    )
    new_polygon = _reproject_polygon(old_polygon, proj_string)
    """
    latlon_proj = pyproj.Proj("epsg:4326")
    llc_proj = pyproj.Proj(proj_string)
    transformer = pyproj.Transformer.from_proj(latlon_proj, llc_proj, always_xy=True)
    new_coords = list(transformer.itransform(polygon.exterior.coords))
    return geom.Polygon(new_coords)


def earth_radius(lat):
    """Earth radius assuming defined by WGS84

    parameters
    ---------
    lat: vector or latitudes in degrees

    returns
    ----------
    r: vector of radius in meters

    example
    -----------
    radius = earth_radius(lat=45)

    notes
    -----------
    WGS84: https://earth-info.nga.mil/GandG/publications/tr8350.2/tr8350.2-a/Chapter%203.pdf
    """
    # define WGS84 oblate spheroid
    a = 6378137
    b = 6356752.3142
    e2 = 1 - (b**2 / a**2)

    # geodecic to geocentric (equation 3-110 in WGS84)
    lat = deg2rad(lat)
    lat_gc = np.arctan((1 - e2) * np.tan(lat))

    # radius equation (equation 3-107 in WGS84)
    return (a * (1 - e2) ** 0.5) / (1 - (e2 * np.cos(lat_gc) ** 2)) ** 0.5


def create_area_grid(lats, lons):
    """
    Calculate the area of each grid cell
    Area is in square meters

    parameters
    -----------
    lats: vector of latitude in degrees
    lons: vector of longitude in degrees

    returns
    -----------
    area: grid-cell area in square-meters with dimensions, [lat,lon]

    Notes
    -----------
    Based on the function in
    https://github.com/chadagreene/CDT/blob/master/cdt/cdtarea.m
    """
    xlon, ylat = meshgrid(lons, lats)
    R = earth_radius(ylat)

    dlat = deg2rad(gradient(ylat, axis=0))
    dlon = deg2rad(gradient(xlon, axis=1))

    dy = dlat * R
    dx = dlon * R * cos(deg2rad(ylat))

    area = dy * dx

    xda = DataArray(
        area,
        dims=["lat", "lon"],
        coords={"lat": lats, "lon": lons},
        attrs={
            "long_name": "area_per_pixel",
            "description": "area per pixel",
            "units": "m^2",
        },
    )
    return xda


def locode_to_shapefile(session, locode):
    """get shapefile from locode"""
    query = text("""SELECT geometry FROM osm WHERE locode = :locode;""")
    return session.execute(query, {"locode": locode}).fetchall()


def shp_to_gpd(shp, crs="EPSG:4326"):
    """convert list of shapes to geopandas dataframe"""
    return gpd.GeoDataFrame(
        geometry=[shapely.wkt.loads(geom) for geom, in shp]
    ).set_crs(crs)


def shp_to_geojson(shp):
    """convert SHP to geoJSON and returns geometries"""
    geometry = loads(shp[0][0])
    geojson_dict = mapping(geometry)
    geojson_string = json.dumps(geojson_dict)
    return [geojson.loads(geojson_string)]


def bounds_from_gdf(gdf):
    """(west, south, east, north) bounds from geopandas dataframe"""
    return gdf.geometry.unary_union.bounds


def bounds_from_polygon(polygon):
    """(west, south, east, north) from shapely polygon"""
    return polygon.bounds


def xarray_to_gdf(ds):
    lats = ds["lat"].values
    lons = ds["lon"].values
    x_res, y_res = ds.rio.resolution()
    x_res_half = x_res / 2
    y_res_half = y_res / 2

    polygons = []

    for lon in lons:
        for lat in lats:
            left = lon - x_res_half
            right = lon + x_res_half
            top = lat + y_res_half
            bottom = lat - y_res_half

            polygon = Polygon(
                [(left, bottom), (right, bottom), (right, top), (left, top)]
            )
            polygons.append(polygon)

    return gpd.GeoDataFrame(geometry=polygons, crs="EPSG:4326")


def gdf_to_xarray(gdf):
    lons = gdf.to_crs(4326).centroid.x.round(2)
    lats = gdf.to_crs(4326).centroid.y.round(2)

    lats_unique = list(set(sorted(lats)))
    lons_unique = list(set(sorted(lons)))

    lon_coord = xr.DataArray(lons_unique, dims="lon", name="lon")
    lat_coord = xr.DataArray(lats_unique, dims="lat", name="lat")

    return xr.Dataset(
        {
            "lat": lat_coord,
            "lon": lon_coord,
        }
    ).sortby(["lon", "lat"])


def xarray_intersection(
    ds,
    geometries,
    all_touched=True,
    crs=4326,
    x_dim="lon",
    y_dim="lat",
    *args,
    **kwargs,
):
    """previously called get_intersection"""
    return ds.rio.set_spatial_dims(x_dim=x_dim, y_dim=y_dim).rio.clip(
        geometries, crs=crs, all_touched=all_touched
    )
    
def get_crosswalk(domain, sector, uncertainty):
    """retrieve crosswalk data"""
    BASE_URL = "https://thredds.daac.ornl.gov/thredds/fileServer/ornldaac/1741"
    DOMAIN = domain
    SECTOR = sector
    UNCERTAINTY = uncertainty
    url = f"{BASE_URL}/Vulcan_v3_{DOMAIN}_annual_1km_{SECTOR}_{UNCERTAINTY}.nc4"

    try:
        with fsspec.open(url, "rb") as file:
            ds = xr.open_dataset(file)

        # convert from 360 to 180 longitude
        ds = ds.assign_coords(lon=(((ds.lon + 180) % 360) - 180).round(2)).sortby("lon")
        return ds.rio.write_crs("EPSG:4326")
    except FileNotFoundError as e:
        print(f"FileNotFoundError: {e}")
        return None


def insert_record(engine, table, pkey, record):
    """insert record into table"""
    fields = [col.name for col in table.columns]

    table_data = {key: record.get(key) for key in record.keys() if key in fields}

    pkey_value = table_data.get(pkey)

    with engine.begin() as conn:
        pkey_exists = conn.execute(
            table.select().where(table.columns[pkey] == pkey_value)
        ).fetchone()

        if not pkey_exists:
            ins = table.insert().values(**table_data)
            conn.execute(ins)


def all_locodes_and_geometries(session):
    """get shapefile from locode"""
    query = text("""SELECT locode, geometry FROM osm;""")
    return session.execute(query).fetchall()


def all_locodes(session):
    """get shapefile from locode"""
    query = text("""SELECT locode FROM osm;""")
    results = session.execute(query).fetchall()
    return [row["locode"] for row in results]


def get_locode_boundary(session, locode):
    """get shapefile from locode"""
    query = text("""SELECT geometry FROM osm WHERE locode = :locode;""")
    result = session.execute(query, {"locode": locode}).fetchall()
    if result:
        return result[0]["geometry"]
    return None


def get_bbox_coords(session, locode):
    """get shapefile from locode"""
    query = text(
        """SELECT bbox_north, bbox_south, bbox_east, bbox_west FROM osm WHERE locode = :locode;"""
    )
    return session.execute(query, {"locode": locode}).fetchall()


def get_edgar_cells_in_bounds(session, bbox_north, bbox_south, bbox_east, bbox_west):
    """get geometry from edgar

    Parameters
    ----------
    bbox_north: float
        north latitude value
    bbox_south: float
        south latitude value
    bbox_east: float
        east longitude value
    bbox_west: float
        west longitude value
    session:
        sqlalchemy session

    Returns
    -------
    id_and_geometry:
        UUID and geometry of grid cells
    """
    query = text(
        """
        SELECT id, geometry
        FROM edgar_grid
        WHERE lon_center >= :bbox_west
        AND lon_center <= :bbox_east
        AND lat_center <= :bbox_north
        AND lat_center >= :bbox_south;"""
    )

    params = {
        "bbox_north": bbox_north,
        "bbox_south": bbox_south,
        "bbox_east": bbox_east,
        "bbox_west": bbox_west,
    }

    return session.execute(query, params).fetchall()


def to_wgs84(gdf):
    return gdf.to_crs("EPSG:4326")


def to_web_mercator(gdf):
    return gdf.to_crs("EPSG:3857")


def get_crosswalk_entire_grid(session):
    """gets the entire crosswalk grid"""
    query = text(
        """
        SELECT id, lat_center, lon_center
        FROM crosswalk_GridCell;"""
    )

    return session.execute(query).fetchall()


def get_crosswalk_grid_coords_and_wkt(session):
    """gets the entire crosswalk grid"""
    query = text(
        """
        SELECT id, lat_center, lon_center, geometry
        FROM crosswalk_GridCell;"""
    )

    return session.execute(query).fetchall()
