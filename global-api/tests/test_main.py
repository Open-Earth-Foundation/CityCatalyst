import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_read_root():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Welcome"}

def test_health_check(monkeypatch):
    class DummyConnection:
        def close(self): pass
        def __enter__(self): return self
        def __exit__(self, *a): pass

    # Patch engine.connect in the health route to return a dummy connection
    monkeypatch.setattr("routes.health.engine", type("DummyEngine", (), {"connect": lambda self=None: DummyConnection()})())

    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {'status': 'ok'}

def test_catalogue_no_data_available(monkeypatch):
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, *a, **k):
            class DummyResult:
                def mappings(self): return self
                def all(self): return []
            return DummyResult()
    monkeypatch.setattr("routes.catalogue_endpoint.SessionLocal", lambda: DummySession())
    response = client.get("/api/v0/catalogue")
    assert response.status_code == 404
    assert response.json() == {"detail": "No data available"}

def test_catalogue_with_data(monkeypatch):
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, *a, **k):
            class DummyResult:
                def mappings(self): return self
                def all(self): return [{
                    "datasource_id": 1,
                    "datasource_name": "Test Source"
                }]
            return DummyResult()
    monkeypatch.setattr("routes.catalogue_endpoint.SessionLocal", lambda: DummySession())
    response = client.get("/api/v0/catalogue")
    assert response.status_code == 200
    assert "datasources" in response.json()
    assert response.json()["datasources"][0]["datasource_id"] == 1

def test_catalogue_last_update_no_data(monkeypatch):
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, *a, **k):
            class DummyResult:
                def fetchall(self): return [(None,)]
            return DummyResult()
    monkeypatch.setattr("routes.catalogue_last_update_endpoint.SessionLocal", lambda: DummySession())
    response = client.get("/api/v0/catalogue/last-update")
    assert response.status_code == 404
    assert response.json() == {"detail": "No data available"}

def test_catalogue_last_update_with_data(monkeypatch):
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, *a, **k):
            class DummyResult:
                def fetchall(self): return [(1710000000,)]
            return DummyResult()
    monkeypatch.setattr("routes.catalogue_last_update_endpoint.SessionLocal", lambda: DummySession())
    response = client.get("/api/v0/catalogue/last-update")
    assert response.status_code == 200
    assert "last_update" in response.json()

def test_catalogue_i18n_no_data(monkeypatch):
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, *a, **k):
            class DummyResult:
                def mappings(self): return self
                def all(self): return []
            return DummyResult()
    monkeypatch.setattr("routes.catalogue_endpoint.SessionLocal", lambda: DummySession())
    response = client.get("/api/v0/catalogue/i18n")
    assert response.status_code == 404
    assert response.json() == {"detail": "No data available"}

def test_catalogue_i18n_with_data(monkeypatch):
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, *a, **k):
            class DummyResult:
                def mappings(self): return self
                def all(self): return [{
                    "datasource_id": 2,
                    "datasource_name": "International Source"
                }]
            return DummyResult()
    monkeypatch.setattr("routes.catalogue_endpoint.SessionLocal", lambda: DummySession())
    response = client.get("/api/v0/catalogue/i18n")
    assert response.status_code == 200
    assert "datasources" in response.json()
    assert response.json()["datasources"][0]["datasource_id"] == 2

def test_catalogue_i18n_csv(monkeypatch):
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, *a, **k):
            class DummyResult:
                def mappings(self): return self
                def all(self): return [{
                    "datasource_id": 3,
                    "datasource_name": "CSV Source"
                }]
            return DummyResult()
    monkeypatch.setattr("routes.catalogue_endpoint.SessionLocal", lambda: DummySession())
    response = client.get("/api/v0/catalogue/i18n?format=csv")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "datasource_id" in response.text and "CSV Source" in response.text
