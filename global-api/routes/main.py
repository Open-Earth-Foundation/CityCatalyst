from fastapi import FastAPI
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

app = FastAPI()

# Define the database engine
engine = create_engine("postgresql://ccglobal@localhost/ccglobal")

# Define SessionLocal for database interactions
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@app.get("/")
def read_root():
    return {"message": "Welcome"}



