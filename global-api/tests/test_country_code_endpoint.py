import pytest
from fastapi.testclient import TestClient
from main import app
from sqlalchemy import create_engine

# Create a test client for the FastAPI app
client = TestClient(app)

def test_no_data_available():
    response = client.get("/api/v0/source/epa/country/AR/2023/1.1.1")
    assert response.status_code == 404
    assert response.json() == {"detail": "No data available"}

