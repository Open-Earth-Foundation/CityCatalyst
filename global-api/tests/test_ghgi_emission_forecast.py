import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


# --- Test successful emission forecast retrieval ---
def test_get_emission_forecast_success(monkeypatch):
    """Test successful retrieval of emission forecast data"""
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, *a, **k):
            class DummyResult:
                def mappings(self): return self
                def all(self):
                    return [
                        {
                            "actor_id": "CITY123",
                            "cluster_id": 3,
                            "cluster_name": "High Growth Cluster",
                            "cluster_description": "Cities with high emission growth rates",
                            "gpc_sector": "Stationary Energy",
                            "forecast_year": "2023",
                            "future_year": "2025",
                            "growth_rate": 0.05
                        },
                        {
                            "actor_id": "CITY123",
                            "cluster_id": 3,
                            "cluster_name": "High Growth Cluster",
                            "cluster_description": "Cities with high emission growth rates",
                            "gpc_sector": "Transportation",
                            "forecast_year": "2023",
                            "future_year": "2025",
                            "growth_rate": 0.03
                        },
                        {
                            "actor_id": "CITY123",
                            "cluster_id": 3,
                            "cluster_name": "High Growth Cluster",
                            "cluster_description": "Cities with high emission growth rates",
                            "gpc_sector": "Stationary Energy",
                            "forecast_year": "2023",
                            "future_year": "2030",
                            "growth_rate": 0.08
                        }
                    ]
            return DummyResult()
    
    monkeypatch.setattr("routes.ghgi_emission_forecast.SessionLocal", lambda: DummySession())
    
    response = client.get("/api/v0/ghgi/emissions_forecast/city/CITY123/2023")
    
    assert response.status_code == 200
    data = response.json()
    
    # Check cluster information
    assert "cluster" in data
    assert data["cluster"]["id"] == 3
    assert data["cluster"]["name"] == "High Growth Cluster"
    assert data["cluster"]["description"] == "Cities with high emission growth rates"
    
    # Check growth rates structure
    assert "growth_rates" in data
    assert "2025" in data["growth_rates"]
    assert "2030" in data["growth_rates"]
    
    # Check specific growth rates
    assert data["growth_rates"]["2025"]["Stationary Energy"] == 0.05
    assert data["growth_rates"]["2025"]["Transportation"] == 0.03
    assert data["growth_rates"]["2030"]["Stationary Energy"] == 0.08


def test_get_emission_forecast_single_record(monkeypatch):
    """Test emission forecast with single record"""
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, *a, **k):
            class DummyResult:
                def mappings(self): return self
                def all(self):
                    return [
                        {
                            "actor_id": "CITY456",
                            "cluster_id": 1,
                            "cluster_name": "Low Growth Cluster",
                            "cluster_description": "Cities with low emission growth rates",
                            "gpc_sector": "Waste",
                            "forecast_year": "2022",
                            "future_year": "2025",
                            "growth_rate": 0.01
                        }
                    ]
            return DummyResult()
    
    monkeypatch.setattr("routes.ghgi_emission_forecast.SessionLocal", lambda: DummySession())
    
    response = client.get("/api/v0/ghgi/emissions_forecast/city/CITY456/2022")
    
    assert response.status_code == 200
    data = response.json()
    
    assert data["cluster"]["id"] == 1
    assert data["cluster"]["name"] == "Low Growth Cluster"
    assert "2025" in data["growth_rates"]
    assert data["growth_rates"]["2025"]["Waste"] == 0.01


# --- Test error cases ---
def test_get_emission_forecast_no_data(monkeypatch):
    """Test emission forecast when no data is available"""
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, *a, **k):
            class DummyResult:
                def mappings(self): return self
                def all(self): return []
            return DummyResult()
    
    monkeypatch.setattr("routes.ghgi_emission_forecast.SessionLocal", lambda: DummySession())
    
    response = client.get("/api/v0/ghgi/emissions_forecast/city/NONEXISTENT/2023")
    
    assert response.status_code == 404
    assert response.json()["detail"] == "No data available"


def test_get_emission_forecast_invalid_spatial_granularity(monkeypatch):
    """Test emission forecast with invalid spatial granularity"""
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, *a, **k):
            class DummyResult:
                def mappings(self): return self
                def all(self): return []
            return DummyResult()
    
    monkeypatch.setattr("routes.ghgi_emission_forecast.SessionLocal", lambda: DummySession())
    
    response = client.get("/api/v0/ghgi/emissions_forecast/invalid/CITY123/2023")
    
    assert response.status_code == 404
    assert response.json()["detail"] == "No data available"


def test_get_emission_forecast_future_year_no_data(monkeypatch):
    """Test emission forecast for future year with no data"""
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, *a, **k):
            class DummyResult:
                def mappings(self): return self
                def all(self): return []
            return DummyResult()
    
    monkeypatch.setattr("routes.ghgi_emission_forecast.SessionLocal", lambda: DummySession())
    
    response = client.get("/api/v0/ghgi/emissions_forecast/city/CITY123/2050")
    
    assert response.status_code == 404
    assert response.json()["detail"] == "No data available"


# --- Test different spatial granularities ---
def test_get_emission_forecast_country_granularity(monkeypatch):
    """Test emission forecast with country spatial granularity"""
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, *a, **k):
            class DummyResult:
                def mappings(self): return self
                def all(self):
                    return [
                        {
                            "actor_id": "COUNTRY123",
                            "cluster_id": 2,
                            "cluster_name": "Medium Growth Cluster",
                            "cluster_description": "Countries with medium emission growth rates",
                            "gpc_sector": "Industrial Processes",
                            "forecast_year": "2023",
                            "future_year": "2025",
                            "growth_rate": 0.04
                        }
                    ]
            return DummyResult()
    
    monkeypatch.setattr("routes.ghgi_emission_forecast.SessionLocal", lambda: DummySession())
    
    response = client.get("/api/v0/ghgi/emissions_forecast/country/COUNTRY123/2023")
    
    assert response.status_code == 200
    data = response.json()
    assert data["cluster"]["id"] == 2
    assert data["growth_rates"]["2025"]["Industrial Processes"] == 0.04


def test_get_emission_forecast_region_granularity(monkeypatch):
    """Test emission forecast with region spatial granularity"""
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, *a, **k):
            class DummyResult:
                def mappings(self): return self
                def all(self):
                    return [
                        {
                            "actor_id": "REGION123",
                            "cluster_id": 4,
                            "cluster_name": "Declining Cluster",
                            "cluster_description": "Regions with declining emission rates",
                            "gpc_sector": "Agriculture",
                            "forecast_year": "2023",
                            "future_year": "2025",
                            "growth_rate": -0.02
                        }
                    ]
            return DummyResult()
    
    monkeypatch.setattr("routes.ghgi_emission_forecast.SessionLocal", lambda: DummySession())
    
    response = client.get("/api/v0/ghgi/emissions_forecast/region/REGION123/2023")
    
    assert response.status_code == 200
    data = response.json()
    assert data["cluster"]["id"] == 4
    assert data["growth_rates"]["2025"]["Agriculture"] == -0.02


# --- Test edge cases ---
def test_get_emission_forecast_multiple_sectors_same_year(monkeypatch):
    """Test emission forecast with multiple sectors for the same year"""
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, *a, **k):
            class DummyResult:
                def mappings(self): return self
                def all(self):
                    return [
                        {
                            "actor_id": "CITY789",
                            "cluster_id": 1,
                            "cluster_name": "Test Cluster",
                            "cluster_description": "Test description",
                            "gpc_sector": "Stationary Energy",
                            "forecast_year": "2023",
                            "future_year": "2025",
                            "growth_rate": 0.06
                        },
                        {
                            "actor_id": "CITY789",
                            "cluster_id": 1,
                            "cluster_name": "Test Cluster",
                            "cluster_description": "Test description",
                            "gpc_sector": "Transportation",
                            "forecast_year": "2023",
                            "future_year": "2025",
                            "growth_rate": 0.04
                        },
                        {
                            "actor_id": "CITY789",
                            "cluster_id": 1,
                            "cluster_name": "Test Cluster",
                            "cluster_description": "Test description",
                            "gpc_sector": "Waste",
                            "forecast_year": "2023",
                            "future_year": "2025",
                            "growth_rate": 0.02
                        }
                    ]
            return DummyResult()
    
    monkeypatch.setattr("routes.ghgi_emission_forecast.SessionLocal", lambda: DummySession())
    
    response = client.get("/api/v0/ghgi/emissions_forecast/city/CITY789/2023")
    
    assert response.status_code == 200
    data = response.json()
    
    # Check that all sectors are present for 2025
    assert "2025" in data["growth_rates"]
    assert "Stationary Energy" in data["growth_rates"]["2025"]
    assert "Transportation" in data["growth_rates"]["2025"]
    assert "Waste" in data["growth_rates"]["2025"]
    
    assert data["growth_rates"]["2025"]["Stationary Energy"] == 0.06
    assert data["growth_rates"]["2025"]["Transportation"] == 0.04
    assert data["growth_rates"]["2025"]["Waste"] == 0.02


def test_get_emission_forecast_zero_growth_rate(monkeypatch):
    """Test emission forecast with zero growth rate"""
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, *a, **k):
            class DummyResult:
                def mappings(self): return self
                def all(self):
                    return [
                        {
                            "actor_id": "CITY999",
                            "cluster_id": 5,
                            "cluster_name": "Zero Growth Cluster",
                            "cluster_description": "Cities with zero emission growth",
                            "gpc_sector": "Stationary Energy",
                            "forecast_year": "2023",
                            "future_year": "2025",
                            "growth_rate": 0.0
                        }
                    ]
            return DummyResult()
    
    monkeypatch.setattr("routes.ghgi_emission_forecast.SessionLocal", lambda: DummySession())
    
    response = client.get("/api/v0/ghgi/emissions_forecast/city/CITY999/2023")
    
    assert response.status_code == 200
    data = response.json()
    assert data["growth_rates"]["2025"]["Stationary Energy"] == 0.0


def test_get_emission_forecast_negative_growth_rate(monkeypatch):
    """Test emission forecast with negative growth rate"""
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, *a, **k):
            class DummyResult:
                def mappings(self): return self
                def all(self):
                    return [
                        {
                            "actor_id": "CITY888",
                            "cluster_id": 6,
                            "cluster_name": "Declining Cluster",
                            "cluster_description": "Cities with declining emissions",
                            "gpc_sector": "Industrial Processes",
                            "forecast_year": "2023",
                            "future_year": "2025",
                            "growth_rate": -0.03
                        }
                    ]
            return DummyResult()
    
    monkeypatch.setattr("routes.ghgi_emission_forecast.SessionLocal", lambda: DummySession())
    
    response = client.get("/api/v0/ghgi/emissions_forecast/city/CITY888/2023")
    
    assert response.status_code == 200
    data = response.json()
    assert data["growth_rates"]["2025"]["Industrial Processes"] == -0.03


# --- Test URL parameter validation ---
def test_get_emission_forecast_missing_parameters():
    """Test emission forecast with missing URL parameters"""
    # Test missing actor_id
    response = client.get("/api/v0/ghgi/emissions_forecast/city//2023")
    assert response.status_code == 404  # FastAPI will return 404 for missing path parameters
    
    # Test missing forecast_year
    response = client.get("/api/v0/ghgi/emissions_forecast/city/CITY123/")
    assert response.status_code == 404


def test_get_emission_forecast_invalid_url():
    """Test emission forecast with invalid URL"""
    response = client.get("/api/v0/ghgi/emissions_forecast/invalid/path")
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
    
    monkeypatch.setattr("routes.ghgi_emission_forecast.SessionLocal", lambda: DummySession())
    
    client.get("/api/v0/ghgi/emissions_forecast/city/TESTCITY/2023")
    
    # Verify the parameters passed to the database query
    assert captured_params["actor_id"] == "TESTCITY"
    assert captured_params["forecast_year"] == "2023"
    assert captured_params["spatial_granularity"] == "city" 