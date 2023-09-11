from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from settings import Settings

settings = Settings()

DATABASE_URL = f"postgresql://{settings.DB_USER}:{settings.DB_PASSWORD}@{settings.DB_HOST}:{settings.DB_PORT}/{settings.DB_NAME}"

engine = create_engine(DATABASE_URL, echo=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def create_db_and_tables():
    Base.metadata.create_all(bind=engine)
