from main import app
from fastapi import FastAPI, HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from decouple import config

engine = create_engine(config("DATABASE_URL"))
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@app.get("/health")
def health_check():
    try:
        # Attempt to connect to the database
        with engine.connect():
            return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=503, detail="Service unavailable")
    finally:
        engine.dispose()
