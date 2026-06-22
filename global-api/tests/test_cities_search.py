from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


class DummySession:
    """Minimal SessionLocal replacement for city search tests."""

    def __init__(self, rows):
        self.rows = rows

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def execute(self, query, params):
        class DummyResult:
            def __init__(self, rows):
                self.rows = rows

            def mappings(self):
                return self

            def all(self):
                return self.rows

        return DummyResult(self.rows)


def test_search_cities_ranks_fuzzy_match(monkeypatch):
    rows = [
        {
            "city_id": "san-antonio",
            "city_name": "San Antonio",
            "city_type": "municipality",
            "country_code": "CL",
            "region_code": "CL05",
            "locode": "CL SAI",
            "lat": -33.593,
            "lon": -71.621,
            "bbox_north": -33.0,
            "bbox_south": -34.0,
            "bbox_east": -71.0,
            "bbox_west": -72.0,
        },
        {
            "city_id": "santiago",
            "city_name": "Santiago",
            "city_type": "municipality",
            "country_code": "CL",
            "region_code": "CL13",
            "locode": "CL SCL",
            "lat": -33.448,
            "lon": -70.669,
            "bbox_north": -33.0,
            "bbox_south": -34.0,
            "bbox_east": -70.0,
            "bbox_west": -71.0,
        },
    ]
    monkeypatch.setattr("routes.cities_search.SessionLocal", lambda: DummySession(rows))

    response = client.get("/api/v1/cities/search?q=santigo&country_code=CL")

    assert response.status_code == 200
    payload = response.json()
    assert payload["data"][0]["locode"] == "CL SCL"
    assert payload["data"][0]["city_name"] == "Santiago"
    assert payload["data"][0]["score"] > payload["data"][1]["score"]


def test_search_cities_normalizes_accents(monkeypatch):
    rows = [
        {
            "city_id": "nunoa",
            "city_name": "Ñuñoa",
            "city_type": "municipality",
            "country_code": "CL",
            "region_code": "CL13",
            "locode": "CL NUN",
            "lat": -33.456,
            "lon": -70.593,
            "bbox_north": -33.0,
            "bbox_south": -34.0,
            "bbox_east": -70.0,
            "bbox_west": -71.0,
        }
    ]
    monkeypatch.setattr("routes.cities_search.SessionLocal", lambda: DummySession(rows))

    response = client.get("/api/v1/cities/search?q=nunoa&country_code=CL")

    assert response.status_code == 200
    assert response.json()["data"][0]["city_name"] == "Ñuñoa"


def test_search_cities_no_matches(monkeypatch):
    monkeypatch.setattr("routes.cities_search.SessionLocal", lambda: DummySession([]))

    response = client.get("/api/v1/cities/search?q=zzzz&country_code=CL")

    assert response.status_code == 200
    assert response.json()["data"] == []
