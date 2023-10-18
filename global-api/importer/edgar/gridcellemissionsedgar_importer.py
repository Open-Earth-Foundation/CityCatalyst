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
    get_edgar_entire_grid,
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

    table = Table("GridCellEmissionsEdgar", metadata_obj, autoload_with=engine)

    results = get_edgar_entire_grid(session)
    df_grid = (
        pd.DataFrame(results).rename(columns={"id": "cell_id"}).astype({"cell_id": str})
    )

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

                df_merged = df_filt.merge(df_grid, on=["lon_center", "lat_center"])

                df_final = (
                    df_merged.assign(
                        emissions_quantity=lambda row: row[EMISSIONS_VAR]
                        * SECONDS_IN_YEAR
                    )
                    .assign(emissions_quantity_units="kg m-2 yr-1")
                    .assign(reference_number=gpc_refno)
                    .assign(year=year)
                    .assign(gas=gas_shortname.get(gas))
                    .assign(
                        id=lambda x: x.apply(
                            lambda row: uuid_generate_v3(
                                f"edgar{row['cell_id']}{row['year']}{row['gas']}{row['reference_number']}"
                            ),
                            axis=1,
                        )
                    )
                    .assign(created_date=str(datetime.now()))
                    .drop(
                        columns=[
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
