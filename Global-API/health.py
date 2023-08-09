from fastapi import FastAPI
from sqlalchemy import create_engine, exc
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base

app = FastAPI()

DATABASE_URL = "TBD"

# Create a SQLAlchemy engine for database connection
engine = create_engine(DATABASE_URL)

# Create a session maker for SQLAlchemy
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Define a base class for SQLAlchemy models
Base = declarative_base()

@app.get("/health")
def health_check():
    try:
        engine.connnect()
        engine.close()
        return {'status': 'ok'}
    except:
        return {'status': 'fail'}
