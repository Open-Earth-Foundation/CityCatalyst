import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

# --- emissionfactor_datasource_endpoint ---
def test_get_emissionfactor_datasources_success(monkeypatch):
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, *a, **k):
            class DummyResult:
                def mappings(self): return self
                def all(self):
                    return [{
                        "datasource_name": "Test Source",
                        "dataset_name": "Test Dataset",
                        "dataset_url": "http://example.com",
                        "publisher_id": 1,
                        "dataset_id": 1
                    }]
            return DummyResult()
    monkeypatch.setattr("routes.emissionfactor_datasource_endpoint.SessionLocal", lambda: DummySession())
    response = client.get("/api/v0/emissions_factor/datasource")
    assert response.status_code == 200
    assert "emissionfactor_datasource" in response.json()

def test_get_emissionfactor_datasources_not_found(monkeypatch):
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, *a, **k):
            class DummyResult:
                def mappings(self): return self
                def all(self): return []
            return DummyResult()
    monkeypatch.setattr("routes.emissionfactor_datasource_endpoint.SessionLocal", lambda: DummySession())
    response = client.get("/api/v0/emissions_factor/datasource")
    assert response.status_code == 404
    assert response.json()["detail"] == "No data available"

# --- emissionfactor_emissionfactor_datasource_endpoint ---
def test_get_emissionfactor_emissionfactor_datasource_success(monkeypatch):
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, *a, **k):
            class DummyResult:
                def mappings(self): return self
                def all(self):
                    return [{
                        "dataset_id": 1,
                        "emissionfactor_id": 2
                    }]
            return DummyResult()
    monkeypatch.setattr("routes.emissionfactor_emissionfactor_datasource_endpoint.SessionLocal", lambda: DummySession())
    response = client.get("/api/v0/emissions_factor/emissions_factor_datasource")
    assert response.status_code == 200
    data = response.json()
    assert "emissionfactor_datasource" in data
    assert data["emissionfactor_datasource"][0]["datasource_id"] == 1
    assert data["emissionfactor_datasource"][0]["emissions_factor_id"] == 2

def test_get_emissionfactor_emissionfactor_datasource_not_found(monkeypatch):
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, *a, **k):
            class DummyResult:
                def mappings(self): return self
                def all(self): return []
            return DummyResult()
    monkeypatch.setattr("routes.emissionfactor_emissionfactor_datasource_endpoint.SessionLocal", lambda: DummySession())
    response = client.get("/api/v0/emissions_factor/emissions_factor_datasource")
    assert response.status_code == 404
    assert response.json()["detail"] == "No data available"

# --- emissionfactor_emissionsfactor_endpoint ---
def test_get_emissionfactors_success(monkeypatch):
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, *a, **k):
            class DummyResult:
                def mappings(self): return self
                def all(self):
                    return [{
                        "gas_name": "CO2",
                        "region": None,
                        "unit_denominator": "kg",
                        "reference": None,
                        "emissionfactor_value": 1.23,
                        "gpc_reference_number": "REF1",
                        "methodology_name": "IPCC",
                        "activity_subcategory_type": {},
                        "actor_id": "CITY1",
                        "year": 2023,
                        "method_id": 1,
                        "emissionfactor_id": 1
                    }]
            return DummyResult()
    monkeypatch.setattr("routes.emissionfactor_emissionsfactor_endpoint.SessionLocal", lambda: DummySession())
    response = client.get("/api/v0/emissions_factor/emissions_factor")
    assert response.status_code == 200
    assert "emissions_factor" in response.json()

def test_get_emissionfactors_not_found(monkeypatch):
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, *a, **k):
            class DummyResult:
                def mappings(self): return self
                def all(self): return []
            return DummyResult()
    monkeypatch.setattr("routes.emissionfactor_emissionsfactor_endpoint.SessionLocal", lambda: DummySession())
    response = client.get("/api/v0/emissions_factor/emissions_factor")
    assert response.status_code == 404
    assert response.json()["detail"] == "No data available"

# --- emissionfactor_methodology_endpoint ---
def test_get_emissionfactor_methodologies_success(monkeypatch):
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, *a, **k):
            class DummyResult:
                def mappings(self): return self
                def all(self):
                    return [{
                        "method_id": 1,
                        "methodology_name": "IPCC Methodology",
                        "methodology_url": None,
                        "dataset_id": 1
                    }]
            return DummyResult()
    monkeypatch.setattr("routes.emissionfactor_methodology_endpoint.SessionLocal", lambda: DummySession())
    response = client.get("/api/v0/emissions_factor/methodology")
    assert response.status_code == 200
    assert "emissions_factor_methodologies" in response.json()

def test_get_emissionfactor_methodologies_not_found(monkeypatch):
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, *a, **k):
            class DummyResult:
                def mappings(self): return self
                def all(self): return []
            return DummyResult()
    monkeypatch.setattr("routes.emissionfactor_methodology_endpoint.SessionLocal", lambda: DummySession())
    response = client.get("/api/v0/emissions_factor/methodology")
    assert response.status_code == 404
    assert response.json()["detail"] == "No data available"

# --- emissionfactor_publisher_endpoint ---
def test_get_emissionfactor_publishers_success(monkeypatch):
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, *a, **k):
            class DummyResult:
                def mappings(self): return self
                def all(self):
                    return [{
                        "publisher_name": "IPCC",
                        "publisher_url": "http://ipcc.org",
                        "publisher_id": 1
                    }]
            return DummyResult()
    monkeypatch.setattr("routes.emissionfactor_publisher_endpoint.SessionLocal", lambda: DummySession())
    response = client.get("/api/v0/emissions_factor/publisher")
    assert response.status_code == 200
    data = response.json()
    assert "emissions_factor_publisher" in data
    assert data["emissions_factor_publisher"][0]["name"] == "IPCC"
    assert data["emissions_factor_publisher"][0]["URL"] == "http://ipcc.org"
    assert data["emissions_factor_publisher"][0]["publisher_id"] == 1

def test_get_emissionfactor_publishers_not_found(monkeypatch):
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, *a, **k):
            class DummyResult:
                def mappings(self): return self
                def all(self): return []
            return DummyResult()
    monkeypatch.setattr("routes.emissionfactor_publisher_endpoint.SessionLocal", lambda: DummySession())
    response = client.get("/api/v0/emissions_factor/publisher")
    assert response.status_code == 404
    assert response.json()["detail"] == "No data available" 