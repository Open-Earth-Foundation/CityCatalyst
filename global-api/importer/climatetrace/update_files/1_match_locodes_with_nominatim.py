import argparse
from pathlib import Path
import os

import pandas as pd
from sqlalchemy import create_engine, MetaData, text
from sqlalchemy.orm import sessionmaker

from utils import response_to_df, nominatim_reverse, name_to_locode


def db_query(session):
    query = text(
        """
    SELECT
    DISTINCT lat, lon, iso3_country, reference_number
    FROM asset
    WHERE (reference_number LIKE 'I.%'
    OR reference_number LIKE 'II.%'
    OR reference_number LIKE 'III.%')
    AND locode IS NULL;
    """
    )

    result = session.execute(query).fetchall()
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--database_uri",
        help="database URI (e.g. postgresql://ccglobal:@localhost/ccglobal)",
        default=os.environ.get("DB_URI"),
    )
    parser.add_argument("--dir", help="directory to store csv files")
    args = parser.parse_args()

    engine = create_engine(args.database_uri)
    metadata_obj = MetaData()
    Session = sessionmaker(bind=engine)

    with Session() as session:
        records = db_query(session)

    df = pd.DataFrame(records).dropna()

    from pathlib import Path

    tmp_dir = Path(args.dir)
    tmp_dir.mkdir(parents=True, exist_ok=True)

    for _, row in df[["lat", "lon"]].drop_duplicates().iterrows():
        filename = tmp_dir / f"lat_lon_{row.lat}_{row.lon}.csv"

        if not filename.exists():
            resp = nominatim_reverse(
                lat=row.lat, lon=row.lon, email="luke@openearth.org"
            )

            if not resp.get("error"):
                df_resp = response_to_df(resp)

                is_part_of = "NaN"
                city = "NaN"

                if "ISO3166-2-lvl4" in df_resp.columns:
                    is_part_of = df_resp["ISO3166-2-lvl4"].item()

                if "ISO3166-2-lvl6" in df_resp.columns:
                    is_part_of = df_resp["ISO3166-2-lvl6"].item()

                if "town" in df_resp.columns:
                    city = df_resp["town"].item()

                if "city" in df_resp.columns:
                    city = df_resp["city"].item()

                data_dic = name_to_locode(city, is_part_of)
                data_dic["lat"] = row.lat
                data_dic["lon"] = row.lon
                df_out = pd.DataFrame([data_dic])

                df_out.to_csv(filename, index=False)
