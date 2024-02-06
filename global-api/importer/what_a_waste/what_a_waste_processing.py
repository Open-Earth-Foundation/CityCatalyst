import csv
import concurrent.futures
import json
import requests
from requests.exceptions import InvalidURL

from openclimate import Client
import pandas as pd

from utils import (
    doc,
    management_level_to_mcf,
    management_level_to_oxidation_factor,
    methane_generation_potential,
    methane_commitment,
)

client = Client()


def get_locode(iso3, city):
    try:
        iso2 = client.search(identifier=iso3, namespace="ISO-3166-1 alpha-3")[
            "actor_id"
        ].item()
        parts = client.parts(actor_id=iso2, part_type="city")
        locode = parts.loc[parts["name"] == city, "actor_id"].item()
        # return {'iso3': iso3, 'iso2': iso2, 'city': city, 'locode':locode}
        return (iso3, city, locode)
    except:
        return (iso3, city, None)


def write_csv(output_dir, name, rows):
    if isinstance(rows, dict):
        rows = [rows]

    with open(f"{output_dir}/{name}.csv", mode="w") as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)


if __name__ == "__main__":
    # api request for what a waste activity data
    url = f"https://datacatalogapi.worldbank.org/ddhxext/ResourceFileData"

    api_params = {
        "resource_unique_id": "DR0049200",
        "rowLimit": 500,
        "version": "2023-01-30",
    }

    try:
        response = requests.get(url, api_params)
    except InvalidURL as e:
        raise e

    if response.status_code == 200:
        content = response.content
        content_json = json.loads(content.decode("utf-8"))
        df_ad = pd.DataFrame(content_json["Details"])
    else:
        print(f"Failed to retrieve content. Status code: {response.status_code}")

    # api request for what a waste years corresponding to activty data
    api_params = {
        "resource_unique_id": "DR0049202",
        "rowLimit": 1000,
        "version": "2023-01-30",
    }

    try:
        response = requests.get(url, api_params)
    except InvalidURL as e:
        raise e

    if response.status_code == 200:
        content = response.content
        content_json = json.loads(content.decode("utf-8"))
        df_tmp = pd.DataFrame(content_json["Details"])
    else:
        print(f"Failed to retrieve content. Status code: {response.status_code}")

    # only get years for MSW data
    filt = df_tmp["measurement"] == "total_msw_total_msw_generated_tons_year"
    df_year = df_tmp.loc[filt, ["iso3c", "country_name", "city_name", "year"]]

    # combine the data
    df = df_ad.merge(df_year, on=["iso3c", "country_name", "city_name"])

    # get the locodes
    with concurrent.futures.ThreadPoolExecutor() as executor:
        results = [
            executor.submit(get_locode, row["iso3c"], row["city_name"])
            for _, row in df[["iso3c", "city_name"]].iterrows()
        ]
        data = [f.result() for f in concurrent.futures.as_completed(results)]

    df_locode = pd.DataFrame(data, columns=["iso3c", "city_name", "locode"])
    df_out = pd.merge(df, df_locode, on=["iso3c", "city_name"])

    # drop rows where could not find locode
    df_out = df_out.dropna(subset=["locode"])

    # Convert these columns to numeric and fill with 0 if null
    cols = [
        "composition_food_organic_waste_percent",
        "composition_yard_garden_green_waste_percent",
        "composition_paper_cardboard_percent",
        "composition_wood_percent",
        "waste_treatment_sanitary_landfill_landfill_gas_system_percent",
        "total_msw_total_msw_generated_tons_year",
    ]

    df_out[cols] = df_out[cols].apply(
        lambda x: x.str.replace(",", "").fillna(0).astype(float)
    )

    # calculate CH4 emissions us methane commitment method and save to csv
    data_list = []

    TONNES_TO_KG = 1000

    for _, row in df_out.iterrows():
        params = dict(
            management_level="managed",
            msw=row["total_msw_total_msw_generated_tons_year"],
            frec=row["waste_treatment_sanitary_landfill_landfill_gas_system_percent"]
            / 100,
            A=row["composition_food_organic_waste_percent"] / 100,
            B=row["composition_yard_garden_green_waste_percent"] / 100,
            C=row["composition_paper_cardboard_percent"] / 100,
            D=row["composition_wood_percent"] / 100,
        )

        year = row["year"]

        # methane commitment (MC) method
        doc_value = doc(**params)
        mcf = management_level_to_mcf(**params)
        lo = methane_generation_potential(mcf, doc_value)
        ox = management_level_to_oxidation_factor(**params)
        emissions_tonnes = methane_commitment(lo=lo, ox=ox, **params)

        emissions_kg = int(emissions_tonnes * TONNES_TO_KG)

        data = {
            "ch4_emissions_kg": emissions_kg,
            "year": year,
            "actor_id": row["locode"],
        }

        if emissions_kg > 0:
            data_list.append(data)

    write_csv(
        output_dir=".", name=f'what_a_waste_{api_params["version"]}', rows=data_list
    )
