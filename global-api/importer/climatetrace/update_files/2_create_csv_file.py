import argparse
import csv
import os
from pathlib import Path

import pandas as pd
from sqlalchemy import create_engine, MetaData, text
from sqlalchemy.orm import sessionmaker


def db_query(session):
    query = text(
        """
    SELECT
    DISTINCT id, lat, lon, reference_number
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
    parser.add_argument("--dir", help="directory with csv files")
    args = parser.parse_args()

    engine = create_engine(args.database_uri)
    metadata_obj = MetaData()
    Session = sessionmaker(bind=engine)

    with Session() as session:
        records = db_query(session)

    df = pd.DataFrame(records).dropna()

    data_dir = Path(args.dir)

    df_merged = pd.concat(
        [pd.read_csv(file) for file in data_dir.glob("*.csv")], ignore_index=True
    )

    df_new_locodes = df_merged.loc[df_merged["locode"].notnull()]

    df_out = pd.merge(df, df_new_locodes[["lat", "lon", "locode"]], on=["lat", "lon"])

    df_out[["id", "locode"]].dropna().to_csv(
        "./climatetrace_update_locodes.csv",
        index=False,
        quotechar='"',
        quoting=csv.QUOTE_ALL,
    )
