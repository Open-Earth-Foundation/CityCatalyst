import pytest
from fastapi.testclient import TestClient
from main import app

# Create a TestClient instance with your FastAPI app
client = TestClient(app)

# Test the root endpoint
def test_read_root():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Welcome"}

# Test Health Check Endpoint
def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {'status': 'ok'}

# Test the data catalogue end point has no data
def test_catalgue_no_data_available():
    response = client.get("/api/v0/catalogue")
    assert response.status_code == 404
    assert response.json() == {"detail": "No data available"}
