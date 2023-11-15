import pandas as pd
import requests

def nominatim_reverse(
    point=None,
    lat=None,
    lon=None,
    _format="json",
    language="en",
    zoom=10,
    email=None,
    debug=None,
    *args,
    **kwargs
):
    """reverse geocode a lat lon location
    Parameters
    ----------
    point: str (default: None)
        geojson point in WKT format
        for example: 'POINT(-53.559279 -31.513208)'
        note: if a point is provided it will override lat, lon
    lat: float (default: None)
        latitude point
    lon: float (default: None)
        longitude point
    _format: str (default: "json")
        output format [xml|json|jsonv2|geojson|geocodejson]
    language: str (default: "en")
        language
    zoom: int (default: 14)
        defines the address detail
        see [documentation](https://nominatim.org/release-docs/develop/api/Reverse/)
        for zoom level details
    email: str (default: None)
        if you are making a large number of requests
        please include an appropriate email address to identify your requests.
        See [Nominatim's Usage Policy](https://operations.osmfoundation.org/policies/nominatim/)

    Returns
    -------
    response : dict
        output response as dictionary

    Example
    -------
    response = nominatim_reverse(point='POINT(-53.559279 -31.513208)')
    """
    ENDPOINT = "https://nominatim.openstreetmap.org/reverse"

    if point is not None:
        point_dict = point_to_latlon(point)
        lat = point_dict['lat']
        lon = point_dict['lon']

    params = {
        'lat': lat,
        'lon': lon,
        'format': _format,
        'accept-language': language,
        'zoom': zoom,
        'email': email
    }

    response = requests.get(ENDPOINT, params=params)
    return response.json()


def response_to_df(response):
    """convert response from json to dataframe
    Parameters
    ----------
    response: dict
        response dictionary from nominatim_reverse

    Returns
    -------
    df : pd.DataFrame
        response dictionary as a dictionary

    Example
    -------
    response = nominatim_reverse(point='POINT(-53.559279 -31.513208)')
    df = response_to_df(response)
    """
    df_address = pd.DataFrame([response['address']])
    response.pop('address')
    df_minus_address = pd.DataFrame([response])
    return pd.concat([df_minus_address, df_address], axis=1)


def name_to_locode(city=None, is_part_of=None, *args, **kwargs):
    """search for city locode in OpenClimate
    Parameters
    ----------
    city: str
        city name
    is_part_of: str
        iso3166-2 code the city is part of

    Returns
    -------
    dic : dict
        dictionary with city, ISO3166-2, and locode

    Example
    -------
    params = {'city': 'Duluth', 'is_part_of': 'US-MN'}
    dic = name_to_locode(**params)
    """
    ENDPOINT = f"https://openclimate.network/api/v1/search/actor"
    params = {'q': city}
    headers = {'Accept': 'application/vnd.api+json'}
    response = requests.get(ENDPOINT, params=params, headers=headers, timeout=3)
    data_list = dict(response.json())['data']
    actor_id = float('NaN')
    if data_list:
        for data in data_list:
            actor_id = data.get('actor_id')

            if (data.get('type') == 'city') and (data.get('is_part_of') == is_part_of):
                return {'city': city, 'ISO3166-2': is_part_of, 'locode':actor_id}

            if (data.get('type') == 'city') and (data.get('is_part_of') == is_part_of[-2:]):
                return {'city': city, 'ISO3166-2': is_part_of, 'locode':actor_id}

        return {'city': city, 'ISO3166-2': is_part_of, 'locode':'NaN'}

    return {'city': city, 'ISO3166-2': is_part_of, 'locode':actor_id}
