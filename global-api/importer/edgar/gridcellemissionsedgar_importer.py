# import EDGAR data into database
# >> python gridcellemissionsedgar_importer.py --database-uri DB_URI
# author: L. Gloege
# created: 2023-09-28

import argparse
from datetime import datetime
import os
import pandas as pd
from sqlalchemy import create_engine, MetaData, Table
from sqlalchemy.orm import sessionmaker
from utils import (
    get_edgar,
    insert_record,
    seconds_in_year,
    uuid_generate_v3,
    area_of_cell,
)

# EDGAR grid resolution
lon_res = 0.1  # degrees
lat_res = 0.1  # degrees

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

    table = Table("GridCellEmissionsEdgar", metadata_obj, autoload_with=engine)

    get_gpc_refno = {
        "IND": "I.3.1",
        "TRO_noRES": "II.1.1",
    }

    get_gases_in_sector = {
        "IND": ["CH4", "N2O", "CO2_excl_short-cycle_org_C"],
        "TRO_noRES": ["CH4", "N2O", "CO2_excl_short-cycle_org_C"],
    }

    gas_shortname = {"CO2_excl_short-cycle_org_C": "CO2", "CH4": "CH4", "N2O": "N2O"}

    sectors = get_gpc_refno.keys()
    years = [2021]

    for sector in sectors:
        gpc_refno = get_gpc_refno.get(sector)
        gases = get_gases_in_sector.get(sector)
        for gas in gases:
            for year in years:
                SECONDS_IN_YEAR = seconds_in_year(year)
                EMISSIONS_VAR = f"emi_{gas_shortname.get(gas).lower()}"

                ds = get_edgar(sector, gas, year)

                units = ds[EMISSIONS_VAR].attrs.get("units")
                assert units == "kg m-2 s-1", f"check units: ({units}) != kg m-2 s-1"

                df_tmp = ds.to_dataframe()
                filt = df_tmp[EMISSIONS_VAR] > 0
                df_filt = (
                    df_tmp.loc[filt]
                    .reset_index()
                    .rename(columns={"lat": "lat_center", "lon": "lon_center"})
                )

                df_filt['area'] = df_filt.apply(lambda row: area_of_cell(row['lat_center'], row['lon_center'], lat_res, lon_res), axis=1)

                df_final = (
                    df_filt
                    .assign(
                        emissions_quantity=lambda row: row[EMISSIONS_VAR]
                        * SECONDS_IN_YEAR
                        * row["area"]
                    )
                    .assign(emissions_quantity_units="kg yr-1")
                    .assign(reference_number=gpc_refno)
                    .assign(year=year)
                    .assign(gas=gas_shortname.get(gas))
                    .assign(cell_lat=lambda row: round(row["lat_center"] * 10))
                    .assign(cell_lon=lambda row: round(row["lon_center"] * 10))
                    .assign(
                        id=lambda x: x.apply(
                            lambda row: uuid_generate_v3(
                                f"edgar{str(row['cell_lat'])}{str(row['cell_lon'])}{row['year']}{row['gas']}{row['reference_number']}"
                            ),
                            axis=1,
                        )
                    )
                    .assign(created_date=str(datetime.now()))
                    .drop(
                        columns=[
                            "area",
                            "spatial_ref",
                            "lat_center",
                            "lon_center",
                            f"{EMISSIONS_VAR}",
                        ]
                    )
                )

                record_generator = (
                    record for record in df_final.to_dict(orient="records")
                )

                for record in record_generator:
                    insert_record(engine, table, "id", record)

    session.close()
