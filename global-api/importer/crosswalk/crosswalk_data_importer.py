#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# import Crosswalk Labs data into database
# >> python crosswalk_data_importer.py --database_uri DB_URI

import argparse
from datetime import datetime
import os
import pandas as pd
from sqlalchemy import create_engine, MetaData, Table
from sqlalchemy.orm import sessionmaker
from utils import (
    tds_catalog,
    tds_generator,
    get_dataset_url,
    insert_record,
    uuid_generate_v3,
    get_crosswalk_entire_grid,
)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--database_uri",
        help="database URI (e.g. postgresql://ccglobal:@localhost/ccglobal)",
        default=os.environ.get("DB_URI"),
    )
    args = parser.parse_args()

    engine = create_engine(args.database_uri)
    metadata_obj = MetaData()
    Session = sessionmaker(bind=engine)
    session = Session()

    table = Table("crosswalk_GridCellEmissions", metadata_obj, autoload_with=engine)

    results = get_crosswalk_entire_grid(session)
    df_grid = (
        pd.DataFrame(results).rename(columns={"id": "cell_id"}).astype({"cell_id": str})
    )

    get_gpc_refno = {
        "airport": "II.4.1",
        "cement": "IV.1",
        "cmv": "II.3.1",
        "commercial": "I.2.1",
        "elec_prod": "I.4.4",
        "industrial": "I.3.1",
        "nonroad": "II.5.1",
        "onroad": "II.1.1",
        "rail": "II.2.1",
        "residential": "I.1.1",
    }

    sectors = get_gpc_refno.keys()
    domains = ["US", "AK"]

    # TDS catalog
    url = "https://thredds.daac.ornl.gov/thredds/catalog/ornldaac/1741/catalog.xml"
    catalog = tds_catalog(url)

    # lists all the datasets in the catalog
    gen = tds_generator(catalog)
    datasets = [fl for fl in gen]

    for domain in domains:
        for sector in sectors:
            gpc_refno = get_gpc_refno.get(sector)

            # filter the datasets by keywords
            keywords = [domain, sector]
            datasets_filtered = [
                dataset
                for dataset in datasets
                if dataset.endswith("_hi.nc4")
                and all(keyword in dataset for keyword in keywords)
            ]

            # read dataset_url
            dataset_url = get_dataset_url(catalog, datasets_filtered[0])

            # read the file
            ds = xr.open_dataset(dataset_url)

            EMISSIONS_VAR = "carbon_emissions"

            gas = ds[EMISSIONS_VAR].attrs.get("long_name")
            gas_shortname = {gas: "CO"}

            units = ds[EMISSIONS_VAR].attrs.get("units")
            assert (
                units == "Mg km-2 year-1"
            ), f"check units: ({units}) != Mg km-2 year-1"

            df_tmp = ds.to_dataframe()
            filt = df_tmp[EMISSIONS_VAR] > 0
            df_filt = (
                df_tmp.loc[filt]
                .reset_index()
                .rename(columns={"lat": "lat_center", "lon": "lon_center"})
            )
            df_filt["year"] = [df_filt.time[x].year for x in range(len(df_filt))]

            df_merged = df_filt.merge(df_grid, on=["lon_center", "lat_center"])

            df_final = (
                df_merged.assign(
                    emissions_quantity=lambda row: row[EMISSIONS_VAR]
                    * (44 / 12)  # CO to CO2
                    * 1000  # Mg to kg
                )
                .assign(emissions_quantity_units="kg m-2 yr-1")
                .assign(reference_number=gpc_refno)
                .assign(gas="CO2")
                .assign(
                    id=lambda x: x.apply(
                        lambda row: uuid_generate_v3(
                            f"crosswalk{row['grid_id']}{row['year']}{row['gas']}{row['reference_number']}"
                        ),
                        axis=1,
                    )
                )
                .assign(created_date=str(datetime.now()))
                .drop(
                    columns=[
                        "time",
                        "nv",
                        "x",
                        "y",
                        "time_bnds",
                        "lat_center",
                        "lon_center",
                        "crs",
                        f"{EMISSIONS_VAR}",
                    ]
                )
            )

            record_generator = (record for record in df_final.to_dict(orient="records"))

            for record in record_generator:
                insert_record(engine, table, "id", record)

    session.close()
