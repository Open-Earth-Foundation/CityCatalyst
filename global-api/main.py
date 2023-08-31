from fastapi import FastAPI
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# FastAPI app instance
app = FastAPI()

# Read the DATABASE_URL from the .env file
DATABASE_URL = config("DATABASE_URL")

# Create a SQLAlchemy engine for database connection
engine = create_engine(DATABASE_URL)

# Create a session maker for SQLAlchemy
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

import health
import city_locode_endpoint


@app.get("/")
def read_root():
    return {"message": "Welcome"}


# The entry point to the FastAPI app
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
