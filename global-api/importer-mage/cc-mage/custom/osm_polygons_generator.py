def get_polygon_osmid(osmid, locode):
    gdf = ox.geocode_to_gdf(osmid, by_osmid=True)
    geometry_wkt = gdf.geometry.apply(lambda geom: geom.wkt)
    df_geometry = pd.DataFrame(geometry_wkt, columns=['geometry'])
    df_attributes = gdf.drop(columns='geometry')
    df_with_geometry = pd.concat([df_attributes, df_geometry], axis=1)
    df_with_geometry['locode'] = locode
    return df_with_geometry

def generator_function(data):
    for row in data:
        yield row


@custom
def run_generator_function(data, *args, **kwargs):
    row_record = generator_function(data)
    print(row_record)
    return 1