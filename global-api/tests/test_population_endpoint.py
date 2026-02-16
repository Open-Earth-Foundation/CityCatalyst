from decimal import Decimal

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_get_population_by_actor_success(monkeypatch):
    class DummySession:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def execute(self, query, params):
            class DummyResult:
                def mappings(self):
                    return self

                def all(self):
                    return [
                        {
                            "actor_id": "USA 0US-CA-SF",
                            "year": 2020,
                            "population_value": Decimal("873965"),
                            "population_source": "national census",
                            "datasource_name": "US Census Bureau",
                            "dataset_name": "Annual Population Estimates",
                            "dataset_url": "https://example.com/dataset",
                            "publisher_name": "US Census Bureau",
                        },
                        {
                            "actor_id": "USA 0US-CA-SF",
                            "year": 2019,
                            "population_value": Decimal("881549"),
                            "population_source": "estimation",
                            "datasource_name": "US Census Bureau",
                            "dataset_name": "Annual Population Estimates",
                            "dataset_url": "https://example.com/dataset",
                            "publisher_name": "US Census Bureau",
                        },
                    ]

            return DummyResult()

    monkeypatch.setattr("routes.population_endpoint.SessionLocal", lambda: DummySession())

    response = client.get("/api/v1/population/USA%200US-CA-SF")

    assert response.status_code == 200
    payload = response.json()
    assert payload["actor_id"] == "USA 0US-CA-SF"
    assert len(payload["population"]) == 2
    assert payload["population"][0]["year"] == 2020
    assert payload["population"][0]["population"] == 873965
    assert payload["population"][0]["datasource"]["publisher_name"] == "US Census Bureau"
    assert payload["population"][0]["datasource"]["datasource_name"] == "US Census Bureau"
    assert payload["population"][0]["datasource"]["dataset"] == "Annual Population Estimates"
    assert payload["population"][0]["datasource"]["url"] == "https://example.com/dataset"
    assert payload["population"][0]["source_type"] == "national census"


def test_get_population_by_actor_no_data(monkeypatch):
    class DummySession:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def execute(self, query, params):
            class DummyResult:
                def mappings(self):
                    return self

                def all(self):
                    return []

            return DummyResult()

    monkeypatch.setattr("routes.population_endpoint.SessionLocal", lambda: DummySession())

    response = client.get("/api/v1/population/NONEXISTENT")

    assert response.status_code == 404
    assert response.json()["detail"] == "No data available"
