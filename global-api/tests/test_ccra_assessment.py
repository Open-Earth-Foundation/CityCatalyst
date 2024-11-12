import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import declarative_base
from main import app
from routes.ccra_assessment import db_risk_assessment, db_impactchain_indicator, db_ccra_cities

client = TestClient(app)

# Mock data for database functions
mock_risk_assessment_data = [
    {
        'keyimpact_name': 'Test Impact',
        'hazard_name': 'Test Hazard',
        'latest_year': 2023,
        'scenario_name': 'current',
        'actor_id': 'CITY1',
        'risk_score': 0.75,
        'normalised_risk_score': 0.8,
        'hazard_score': 0.6,
        'exposure_score': 0.7,
        'vulnerability_score': 0.5,
        'adaptive_capacity_score': 0.4,
        'sensitivity_score': 0.3,
        'risk_lower_limit': 0.2,
        'risk_upper_limit': 0.9
    }
]

mock_impactchain_indicator_data = [
    {
        'keyimpact_name': 'Test Impact',
        'hazard_name': 'Test Hazard',
        'scenario_name': 'current',
        'actor_id': 'CITY1',
        'category': 'Test Category',
        'subcategory': 'Test Subcategory',
        'indicator_name': 'Test Indicator',
        'indicator_score': 0.7,
        'indicator_units': 'units',
        'indicator_normalized_score': 0.75,
        'indicator_weight': 0.5,
        'relationship': 'positive',
        'indicator_year': 2023,
        'datasource': 'Test Source'
    }
]

mock_ccra_cities_data = [
    {
        'city_name': 'Test City',
        'region_code': 'TEST',
        'actor_id': 'CITY1',
        'osm_id': 'R12345'
    }
]

# Mock the database functions
@pytest.fixture(autouse=True)
def mock_db_functions(monkeypatch):
    monkeypatch.setattr("routes.ccra_assessment.db_risk_assessment", lambda actor_id, scenario_name: mock_risk_assessment_data)
    monkeypatch.setattr("routes.ccra_assessment.db_impactchain_indicator", lambda actor_id, scenario_name: mock_impactchain_indicator_data)
    monkeypatch.setattr("routes.ccra_assessment.db_ccra_cities", lambda country_code: mock_ccra_cities_data)

# Test the /ccra/city/{country_code} endpoint
def test_get_ccra_cities():
    response = client.get("/api/v0/ccra/city/TEST")
    assert response.status_code == 200
    assert response.json() == [
        {
            "cityName": "Test City",
            "region": "TEST",
            "actor_id": "CITY1",
            "osm_id": "R12345"
        }
    ]

# Test the /ccra/risk_assessment/city/{actor_id}/{scenario_name} endpoint
def test_get_city_risk_assessment():
    response = client.get("/api/v0/ccra/risk_assessment/city/CITY1/current")
    assert response.status_code == 200
    assert response.json() == [
        {
            'keyimpact': 'Test Impact',
            'hazard': 'Test Hazard',
            'latest_year': 2023,
            'scenario': 'current',
            'actor_id': 'CITY1',
            'risk_score': 0.75,
            'normalised_risk_score': 0.8,
            'hazard_score': 0.6,
            'exposure_score': 0.7,
            'vulnerability_score': 0.5,
            'adaptive_capacity_score': 0.4,
            'sensitivity_score': 0.3,
            'risk_lower_limit': 0.2,
            'risk_upper_limit': 0.9
        }
    ]
