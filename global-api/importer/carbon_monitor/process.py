import concurrent.futures
import os
import uuid

import pandas as pd
import openclimate

client = openclimate.Client()

def get_parts_of_iso(client, iso):
    df_parts = client.parts(actor_id=iso, part_type="adm1").get("actor_id")
    return list(df_parts) + [iso]


def get_cities_from_part(client, part):
    try:
        df_tmp = client.parts(actor_id=part, part_type="city").loc[:, ["actor_id", "name"]]
        df_tmp["is_part_of"] = part
        return df_tmp
    except:
        pass

def uuid_generate_v3(name, namespace=uuid.NAMESPACE_OID):
    """generate a version 3 UUID from namespace and name"""
    assert isinstance(name, str), "name needs to be a string"
    assert isinstance(namespace, uuid.UUID), "namespace needs to be a uuid.UUID"
    return str(uuid.uuid3(namespace, name))


if __name__ == "__main__":
    INPUT_FILE = './raw/carbon-monitor-cities-all-cities-FUA-v0325.csv'
    INPUT_FILE = os.path.abspath(INPUT_FILE)

    OUTPUT_FILE = './processed/carbon-monitor-cities-all-cities-FUA-v0325_processed.csv'
    OUTPUT_FILE = os.path.abspath(OUTPUT_FILE)

    KT_TO_KG = 1_000_000

    COUNTRY_REPLACE_DICT = {
        "country": {
            "United States": "United States of America",
            "United Kingdom": "United Kingdom of Great Britain and Northern Ireland",
            "Vietnam": "Viet Nam",
            "Korea": "Korea, the Republic of",
            "Turkey": "Türkiye",
            "Russia": "Russian Federation",
        }
    }

    df = (
        pd.read_csv(INPUT_FILE, parse_dates=["date"])
        # 0. filter out rows with 0 emissions
        .loc[lambda x: x['value (KtCO2 per day)']>0]
        # 1. create a year column
        .assign(year = lambda x: x["date"].dt.year)
        # 2. filter only necessary columns
        .loc[:, ["city", "country", "sector", "year", "value (KtCO2 per day)"]]
        # 3. sum over the year for each city and sector
        .groupby(["city", "country", "year", "sector"])
        .sum(numeric_only=True)
        .reset_index()
        # 4. convert from ktCO2 to kg CO2
        .assign(emissions_quantity = lambda x: x["value (KtCO2 per day)"] * KT_TO_KG)
        .assign(units = 'kg')
        .assign(gas = 'co2')
        .loc[:, ["city", "country", "year", "sector", "emissions_quantity", 'units', 'gas']]
        # 5. replace some country names with those used by OpenClimate
        .replace(COUNTRY_REPLACE_DICT)
    )

    # list of countries in dataset
    country_list = df["country"].drop_duplicates().tolist()

    # countries in OpenClimate
    df_country = openclimate.Client().country_codes()

    # merge ISO codes into df_out
    data = [
        (name, list(df_country.loc[df_country["name"] == name, "actor_id"])[0])
        for name in country_list
    ]
    df_iso = pd.DataFrame(data, columns=["country", "iso"])
    df = df.merge(df_iso, on="country")

    # list of ISO codes
    iso_codes = df["iso"].drop_duplicates().tolist()

    df_list = []
    for iso in iso_codes:
        parts = get_parts_of_iso(client, iso)

        with concurrent.futures.ThreadPoolExecutor() as executor:
            results = [executor.submit(get_cities_from_part, client, part) for part in parts]
            data = [f.result() for f in concurrent.futures.as_completed(results)]

        # merge name with locode
        df_city = pd.concat(data)
        cities_frame = (
            df.loc[df["iso"] == iso, "city"].drop_duplicates().to_frame()
        )
        df_ = cities_frame.merge(df_city, left_on="city", right_on="name")

        # filter the DataFrame to only include rows with city counts of 1
        counts = df_["city"].value_counts()
        df_filtered = df_[df_["city"].isin(counts[counts == 1].index)]
        df_filtered = df_filtered.assign(iso=iso)

        # merge actor_id into df, this is a tmp dataframe
        df_tmp = df.loc[df["iso"] == iso].merge(df_filtered, on=["city", "iso"])
        df_tmp = df_tmp.loc[
            :, ["actor_id", "year", "sector", 'units', 'gas', "emissions_quantity"]
        ]
        df_list.append(df_tmp)

    df_concat = pd.concat(df_list)

    ASTYPE_DICT = {
        'id': str,
        'actor_id': str,
        'year': int,
        'sector': str,
        'units': str,
        'gas': str,
        'emissions_quantity': int
    }

    SECTOR_TO_GPC = {
        'Aviation': "II.4.1", # domestic flights only
        'Ground Transport': "II.1.1",
        'Industry': 'IV.1', # not sure if this is correct
        'Power': 'I.4.1',   # sounds like these are emissions from power plants
        'Residential': "I.1.1",
    }

    df_out = df_concat.assign(
        id = lambda x: x.apply(
            lambda row: uuid_generate_v3(name=f"{row['actor_id']}{row['year']}{row['sector']}{row['gas']}"),
            axis=1
        )
    )


    df_fin = (
        df_out.assign(gpc_refno=df_out['sector'].map(SECTOR_TO_GPC))
        .astype(ASTYPE_DICT)
        .loc[:, ['id', 'actor_id', 'year', 'sector', 'gpc_refno', 'gas', 'emissions_quantity', 'units']]
        .sort_values(by=["actor_id", "year", "gpc_refno"])
    )

    df_fin.to_csv(OUTPUT_FILE, index=False)