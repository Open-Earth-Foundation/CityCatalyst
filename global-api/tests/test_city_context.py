import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


# --- Test successful city context retrieval ---
def test_get_city_context_success(monkeypatch):
    """Test successful retrieval of city context data"""
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, query, params):
            class DummyResult:
                def mappings(self): return self
                def all(self):
                    return [{
                        "locode": "USNYC",
                        "city_name": "New York City",
                        "region_code": "US",
                        "region_name": "United States",
                        "population": 8336817,
                        "population_density": 10833.0,
                        "area_km2": 778.2,
                        "elevation": 10.0,
                        "biome": "Temperate Broadleaf Forest",
                        "low_income": "High",
                        "inadequate_water_access": 0.05,
                        "inadequate_sanitation": 0.02
                    }]
            return DummyResult()
    
    monkeypatch.setattr("routes.city_context.SessionLocal", lambda: DummySession())
    
    response = client.get("/api/v0/city_context/city/USNYC")
    
    assert response.status_code == 200
    data = response.json()
    
    # Check basic city information
    assert data["locode"] == "USNYC"
    assert data["name"] == "New York City"
    assert data["region"] == "US"
    assert data["regionName"] == "United States"
    
    # Check demographic data
    assert data["populationSize"] == 8336817
    assert data["populationDensity"] == 10833.0
    assert data["area"] == 778.2
    assert data["elevation"] == 10.0
    assert data["biome"] == "Temperate Broadleaf Forest"
    
    # Check socio-economic factors
    assert data["socioEconomicFactors"]["lowIncome"] == "High"
    
    # Check access to public services
    assert data["accessToPublicServices"]["inadequateWaterAccess"] == 0.05
    assert data["accessToPublicServices"]["inadequateSanitation"] == 0.02


def test_get_city_context_minimal_data(monkeypatch):
    """Test city context retrieval with minimal data (some fields null)"""
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, query, params):
            class DummyResult:
                def mappings(self): return self
                def all(self):
                    return [{
                        "locode": "GBLON",
                        "city_name": "London",
                        "region_code": "GB",
                        "region_name": "United Kingdom",
                        "population": 8982000,
                        "population_density": 5678.0,
                        "area_km2": 1572.0,
                        "elevation": None,
                        "biome": None,
                        "low_income": None,
                        "inadequate_water_access": None,
                        "inadequate_sanitation": None
                    }]
            return DummyResult()
    
    monkeypatch.setattr("routes.city_context.SessionLocal", lambda: DummySession())
    
    response = client.get("/api/v0/city_context/city/GBLON")
    
    assert response.status_code == 200
    data = response.json()
    
    # Check basic city information
    assert data["locode"] == "GBLON"
    assert data["name"] == "London"
    assert data["region"] == "GB"
    assert data["regionName"] == "United Kingdom"
    
    # Check demographic data
    assert data["populationSize"] == 8982000
    assert data["populationDensity"] == 5678.0
    assert data["area"] == 1572.0
    assert data["elevation"] is None
    assert data["biome"] is None
    
    # Check socio-economic factors
    assert data["socioEconomicFactors"]["lowIncome"] is None
    
    # Check access to public services
    assert data["accessToPublicServices"]["inadequateWaterAccess"] is None
    assert data["accessToPublicServices"]["inadequateSanitation"] is None


def test_get_city_context_zero_values(monkeypatch):
    """Test city context retrieval with zero values"""
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, query, params):
            class DummyResult:
                def mappings(self): return self
                def all(self):
                    return [{
                        "locode": "FRPAR",
                        "city_name": "Paris",
                        "region_code": "FR",
                        "region_name": "France",
                        "population": 0,
                        "population_density": 0.0,
                        "area_km2": 0.0,
                        "elevation": 0.0,
                        "biome": "Temperate",
                        "low_income": "Low",
                        "inadequate_water_access": 0.0,
                        "inadequate_sanitation": 0.0
                    }]
            return DummyResult()
    
    monkeypatch.setattr("routes.city_context.SessionLocal", lambda: DummySession())
    
    response = client.get("/api/v0/city_context/city/FRPAR")
    
    assert response.status_code == 200
    data = response.json()
    
    # Check zero values are handled correctly
    assert data["populationSize"] == 0
    assert data["populationDensity"] == 0.0
    assert data["area"] == 0.0
    assert data["elevation"] == 0.0
    assert data["accessToPublicServices"]["inadequateWaterAccess"] == 0.0
    assert data["accessToPublicServices"]["inadequateSanitation"] == 0.0


# --- Test error cases ---
def test_get_city_context_no_data(monkeypatch):
    """Test city context retrieval when no data is available"""
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, query, params):
            class DummyResult:
                def mappings(self): return self
                def all(self): return []
            return DummyResult()
    
    monkeypatch.setattr("routes.city_context.SessionLocal", lambda: DummySession())
    
    response = client.get("/api/v0/city_context/city/NONEXISTENT")
    
    assert response.status_code == 404
    assert response.json()["detail"] == "No data available"


def test_get_city_context_invalid_locode(monkeypatch):
    """Test city context retrieval with invalid locode format"""
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, query, params):
            class DummyResult:
                def mappings(self): return self
                def all(self): return []
            return DummyResult()
    
    monkeypatch.setattr("routes.city_context.SessionLocal", lambda: DummySession())
    
    response = client.get("/api/v0/city_context/city/INVALID")
    
    assert response.status_code == 404
    assert response.json()["detail"] == "No data available"


# --- Test URL parameter validation ---
def test_get_city_context_missing_locode():
    """Test city context retrieval with missing locode parameter"""
    response = client.get("/api/v0/city_context/city/")
    assert response.status_code == 404


def test_get_city_context_invalid_url():
    """Test city context retrieval with invalid URL"""
    response = client.get("/api/v0/city_context/invalid/path")
    assert response.status_code == 404


# --- Test database query parameters ---
def test_database_query_parameters(monkeypatch):
    """Test that the correct parameters are passed to the database query"""
    captured_params = {}
    
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, query, params):
            nonlocal captured_params
            captured_params = params
            class DummyResult:
                def mappings(self): return self
                def all(self): return []
            return DummyResult()
    
    monkeypatch.setattr("routes.city_context.SessionLocal", lambda: DummySession())
    
    client.get("/api/v0/city_context/city/TESTCITY")
    
    # Verify the parameters passed to the database query
    assert captured_params["locode"] == "TESTCITY"


# --- Test different locode formats ---
def test_get_city_context_different_locodes(monkeypatch):
    """Test city context retrieval with different locode formats"""
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, query, params):
            class DummyResult:
                def mappings(self): return self
                def all(self):
                    return [{
                        "locode": params["locode"],
                        "city_name": f"City {params['locode']}",
                        "region_code": params["locode"][:2],
                        "region_name": f"Region {params['locode'][:2]}",
                        "population": 1000000,
                        "population_density": 5000.0,
                        "area_km2": 100.0,
                        "elevation": 100.0,
                        "biome": "Temperate",
                        "low_income": "Medium",
                        "inadequate_water_access": 0.1,
                        "inadequate_sanitation": 0.1
                    }]
            return DummyResult()
    
    monkeypatch.setattr("routes.city_context.SessionLocal", lambda: DummySession())
    
    # Test different locode formats
    locodes = ["USNYC", "GBLON", "FRPAR", "DEBER", "ITROM", "ESMAD"]
    
    for locode in locodes:
        response = client.get(f"/api/v0/city_context/city/{locode}")
        assert response.status_code == 200
        data = response.json()
        assert data["locode"] == locode
        assert data["name"] == f"City {locode}"


# --- Test edge cases ---
def test_get_city_context_special_characters(monkeypatch):
    """Test city context retrieval with special characters in city name"""
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, query, params):
            class DummyResult:
                def mappings(self): return self
                def all(self):
                    return [{
                        "locode": "MXMEX",
                        "city_name": "México City",
                        "region_code": "MX",
                        "region_name": "México",
                        "population": 9209944,
                        "population_density": 6163.0,
                        "area_km2": 1485.0,
                        "elevation": 2240.0,
                        "biome": "Desert",
                        "low_income": "Medium",
                        "inadequate_water_access": 0.15,
                        "inadequate_sanitation": 0.12
                    }]
            return DummyResult()
    
    monkeypatch.setattr("routes.city_context.SessionLocal", lambda: DummySession())
    
    response = client.get("/api/v0/city_context/city/MXMEX")
    
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "México City"
    assert data["regionName"] == "México"


def test_get_city_context_large_numbers(monkeypatch):
    """Test city context retrieval with large population numbers"""
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, query, params):
            class DummyResult:
                def mappings(self): return self
                def all(self):
                    return [{
                        "locode": "CNBEI",
                        "city_name": "Beijing",
                        "region_code": "CN",
                        "region_name": "China",
                        "population": 21540000,
                        "population_density": 1324.0,
                        "area_km2": 16410.0,
                        "elevation": 43.5,
                        "biome": "Temperate",
                        "low_income": "Low",
                        "inadequate_water_access": 0.08,
                        "inadequate_sanitation": 0.05
                    }]
            return DummyResult()
    
    monkeypatch.setattr("routes.city_context.SessionLocal", lambda: DummySession())
    
    response = client.get("/api/v0/city_context/city/CNBEI")
    
    assert response.status_code == 200
    data = response.json()
    assert data["populationSize"] == 21540000
    assert data["area"] == 16410.0


def test_get_city_context_decimal_precision(monkeypatch):
    """Test city context retrieval with decimal precision in numeric fields"""
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, query, params):
            class DummyResult:
                def mappings(self): return self
                def all(self):
                    return [{
                        "locode": "JPTYO",
                        "city_name": "Tokyo",
                        "region_code": "JP",
                        "region_name": "Japan",
                        "population": 13929286,
                        "population_density": 6326.4,
                        "area_km2": 2194.0,
                        "elevation": 40.0,
                        "biome": "Temperate",
                        "low_income": "Low",
                        "inadequate_water_access": 0.023,
                        "inadequate_sanitation": 0.015
                    }]
            return DummyResult()
    
    monkeypatch.setattr("routes.city_context.SessionLocal", lambda: DummySession())
    
    response = client.get("/api/v0/city_context/city/JPTYO")
    
    assert response.status_code == 200
    data = response.json()
    assert data["populationDensity"] == 6326.4
    assert data["accessToPublicServices"]["inadequateWaterAccess"] == 0.023
    assert data["accessToPublicServices"]["inadequateSanitation"] == 0.015


# --- Test response structure validation ---
def test_city_context_response_structure(monkeypatch):
    """Test that the response structure is correct"""
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, query, params):
            class DummyResult:
                def mappings(self): return self
                def all(self):
                    return [{
                        "locode": "AUSYD",
                        "city_name": "Sydney",
                        "region_code": "AU",
                        "region_name": "Australia",
                        "population": 5312163,
                        "population_density": 415.0,
                        "area_km2": 12367.7,
                        "elevation": 6.0,
                        "biome": "Mediterranean",
                        "low_income": "Low",
                        "inadequate_water_access": 0.01,
                        "inadequate_sanitation": 0.01
                    }]
            return DummyResult()
    
    monkeypatch.setattr("routes.city_context.SessionLocal", lambda: DummySession())
    
    response = client.get("/api/v0/city_context/city/AUSYD")
    
    assert response.status_code == 200
    data = response.json()
    
    # Check that all expected fields are present
    expected_fields = [
        "locode", "name", "region", "regionName", "populationSize",
        "populationDensity", "area", "elevation", "biome",
        "socioEconomicFactors", "accessToPublicServices"
    ]
    
    for field in expected_fields:
        assert field in data
    
    # Check nested structure
    assert "lowIncome" in data["socioEconomicFactors"]
    assert "inadequateWaterAccess" in data["accessToPublicServices"]
    assert "inadequateSanitation" in data["accessToPublicServices"]


# --- Test data type validation ---
def test_city_context_data_types(monkeypatch):
    """Test that data types are correctly handled"""
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, query, params):
            class DummyResult:
                def mappings(self): return self
                def all(self):
                    return [{
                        "locode": "BRSAO",
                        "city_name": "São Paulo",
                        "region_code": "BR",
                        "region_name": "Brazil",
                        "population": 12325232,
                        "population_density": 7921.0,
                        "area_km2": 1521.0,
                        "elevation": 760.0,
                        "biome": "Tropical",
                        "low_income": "Medium",
                        "inadequate_water_access": 0.12,
                        "inadequate_sanitation": 0.18
                    }]
            return DummyResult()
    
    monkeypatch.setattr("routes.city_context.SessionLocal", lambda: DummySession())
    
    response = client.get("/api/v0/city_context/city/BRSAO")
    
    assert response.status_code == 200
    data = response.json()
    
    # Check data types
    assert isinstance(data["locode"], str)
    assert isinstance(data["name"], str)
    assert isinstance(data["region"], str)
    assert isinstance(data["regionName"], str)
    assert isinstance(data["populationSize"], int)
    assert isinstance(data["populationDensity"], float)
    assert isinstance(data["area"], float)
    assert isinstance(data["elevation"], float)
    assert isinstance(data["biome"], str)
    assert isinstance(data["socioEconomicFactors"]["lowIncome"], str)
    assert isinstance(data["accessToPublicServices"]["inadequateWaterAccess"], float)
    assert isinstance(data["accessToPublicServices"]["inadequateSanitation"], float) 