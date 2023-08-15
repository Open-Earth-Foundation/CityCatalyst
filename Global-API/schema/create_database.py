import argparse
from asset import Asset
from base import Base
from sqlalchemy import create_engine
import os

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--user', help='database user', default=os.environ.get("DB_USER"))
    parser.add_argument('--password', help='database password', default=os.environ.get("DB_PASSWORD"))
    parser.add_argument('--host', help='database host', default=os.environ.get("DB_HOST"))
    parser.add_argument('--port', help='database host', default=os.environ.get("DB_PORT"))
    parser.add_argument('--dbname', help='database name', default=os.environ.get("DB_NAME"))
    args = parser.parse_args()

    database_uri = f"postgresql://{args.user}:{args.password}@{args.host}:{args.port}/{args.dbname}"

    engine = create_engine(database_uri)
    Base.metadata.create_all(engine)