import sys
import os
from datetime import datetime
current_dir = os.path.dirname(os.path.abspath(__file__))
project_dir = os.path.dirname(current_dir)
sys.path.append(project_dir)

import argparse
from schema.asset import Asset
import csv
import logging
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

def record_generator(fl):
    """returns a generator for the csv file"""
    with open(fl, "r") as file:
        csv_reader = csv.DictReader(file)
        for row in csv_reader:
            yield row


def number_records_in_file(fl):
    """returns number of records in csv file"""
    with open(fl, 'r', newline='') as file:
        next(file)
        row_count = sum(1 for _ in file)
    return row_count


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Processing and seeding climate TRACE emissions data to database")
    parser.add_argument('--user', help='database user', type=str, default=os.environ.get("DB_USER"))
    parser.add_argument('--password', help='database password', type=str, default=os.environ.get("DB_PASSWORD"))
    parser.add_argument('--host', help='database host', type=str, default=os.environ.get("DB_HOST"))
    parser.add_argument('--port', help='database port', type=int, default=os.environ.get("DB_PORT"))
    parser.add_argument('--dbname', help='database name', type=str, default=os.environ.get("DB_NAME"))
    parser.add_argument('--file', help='path to file to import', required=True)
    parser.add_argument('--refno', help='GPC reference number')
    args = parser.parse_args()

    start = datetime.now()

    database_uri = f"postgresql://{args.user}:{args.password}@{args.host}:{args.port}/{args.dbname}"

    engine = create_engine(database_uri)
    Session = sessionmaker(bind=engine)
    session = Session()

    fields = [col.name for col in Asset.__table__.columns]

    refno = args.refno

    fl = os.path.abspath(args.file)
    path = Path(fl)
    n_records = number_records_in_file(fl)
    generator = record_generator(path)

    logging.basicConfig(filename=f'progress_{path.stem}.log', level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

    record_counter = 0
    for record in generator:
        record_counter = record_counter + 1
        if record_counter % 10000 == 0:
            logging.info(f"Processing record {record_counter}/{n_records}")
        if record.get('emissions_quantity') != '0':
            # remove keys with empty values
            record = {key: value for key, value in record.items() if value != ''}

            # add keys filename and reno to record
            record['filename'] = path.stem
            record['reference_number'] = refno

            # only keep keys if they are fields in the database
            asset_data = {key: record.get(key) for key in record.keys() if key in fields}

            # create asset object and add/commit it to db
            asset = Asset(**asset_data)
            session.add(asset)
            session.commit()

    session.close
    
    end = datetime.now()
    logging.info(f"\nExecution Start Timestamp: {start.isoformat()}")
    logging.info(f"Execution End Timestamp: {end.isoformat()}")
    logging.info(f"Execution Duration: {(end-start).seconds} seconds")
    logging.info(f"Total Records Processed: {n_records}")
    logging.info(f"Records Processed Successfully: {record_counter}")
    logging.info("Processing completed.")