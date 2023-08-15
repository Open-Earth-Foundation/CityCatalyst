from base import Base
from sqlalchemy import create_engine
import os

# database params are GitHub Secrets
user = os.environ.get("DB_USER")
pwd = os.environ.get("DB_PASSWORD")
host = os.environ.get("DB_HOST")
port = os.environ.get("DB_PORT")
dbname = os.environ.get("DB_NAME")

database_uri = f"postgresql://{user}:{pwd}@{host}:{port}/{dbname}"

engine = create_engine(database_uri)
Base.metadata.create_all(engine)