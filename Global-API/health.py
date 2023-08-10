from fastapi import FastAPI, HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from decouple import config

app = FastAPI()

# Read the DATABASE_URL from the .env file
DATABASE_URL = config("DATABASE_URL")

# Create a SQLAlchemy engine for database connection
engine = create_engine(DATABASE_URL)

# Create a session maker for SQLAlchemy
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Define a base class for SQLAlchemy models
Base = declarative_base()

@app.get("/health")
def health_check():
    try:
        engine.connect()
        engine.close()
        return {'status': 'ok'}
    except Exception as e:
        # If an exception occurs, return a 503 status code
        raise HTTPException(status_code=503, detail="Service unavailable")

@app.get("/health")
def health_check():
    try:
        # Attempt to connect to the database
        with engine.connect():
            return {'status': 'ok'}
    except Exception as e:
        raise HTTPException(status_code=503, detail="Service unavailable")
    finally:
        engine.dispose()
