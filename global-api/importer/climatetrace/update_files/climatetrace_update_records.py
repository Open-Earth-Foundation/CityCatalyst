import argparse
import csv
import logging
import os
from pathlib import Path
from sqlalchemy import create_engine, MetaData, Table
from sqlalchemy.orm import sessionmaker

def upsert_record(engine, table, pkey, record):
    """Update or insert a record in the table based on the primary key (pkey)."""
    fields = [col.name for col in table.columns]
    table_data = {key: record[key] for key in record.keys() if key in fields}

    pkey_value = table_data.get(pkey)

    with engine.begin() as conn:
        existing_record = conn.execute(table.select().where(table.columns[pkey] == pkey_value)).fetchone()

        if existing_record:
            conn.execute(table.update().where(table.columns[pkey] == pkey_value).values(**table_data))
        else:
            conn.execute(table.insert().values(**table_data))


def csv_to_dict_generator(file_path):
    with open(file_path, 'r') as file:
        csv_reader = csv.DictReader(file)
        for row in csv_reader:
            yield row

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--database_uri",
        help="database URI (e.g. postgresql://ccglobal:@localhost/ccglobal)",
        default=os.environ.get("DB_URI"),
    )
    parser.add_argument("--file", help="path to csv file")
    parser.add_argument(
        "--log_file", help="path to log file", default="./climatetrace_updater.log"
    )
    args = parser.parse_args()

    logging.basicConfig(
        filename=args.log_file,
        level=logging.INFO,
        format="%(asctime)s - %(levelname)s - %(message)s",
    )

    file = Path(os.path.abspath(args.file))
    logging.info(f"File: {file}")

    engine = create_engine(args.database_uri)
    metadata_obj = MetaData()
    Session = sessionmaker(bind=engine)
    session = Session()

    asset = Table("asset", metadata_obj, autoload_with=engine)
    fields = [col.name for col in asset.columns]

    record_generator = csv_to_dict_generator(file)

    for record in record_generator:
        table_data = {
            key: record.get(key) for key in record.keys() if key in fields
        }

        upsert_record(engine, asset, "id", table_data)

    logging.info("Done!")
    session.close()