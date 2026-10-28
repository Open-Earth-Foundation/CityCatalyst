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


def _city(city_name, country_code, locode):
    return {
        "city_id": locode,
        "city_name": city_name,
        "city_type": "municipality",
        "country_code": country_code,
        "region_code": None,
        "locode": locode,
        "lat": None,
        "lon": None,
        "bbox_north": None,
        "bbox_south": None,
        "bbox_east": None,
        "bbox_west": None,
    }


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
    monkeypatch.setattr("routes.legacy.cities_search.SessionLocal", lambda: DummySession(rows))

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
    monkeypatch.setattr("routes.legacy.cities_search.SessionLocal", lambda: DummySession(rows))

    response = client.get("/api/v1/cities/search?q=nunoa&country_code=CL")

    assert response.status_code == 200
    assert response.json()["data"][0]["city_name"] == "Ñuñoa"


def test_search_cities_no_matches(monkeypatch):
    monkeypatch.setattr("routes.legacy.cities_search.SessionLocal", lambda: DummySession([]))

    response = client.get("/api/v1/cities/search?q=zzzz&country_code=CL")

    assert response.status_code == 200
    assert response.json()["data"] == []


def test_search_cities_preserves_non_latin_characters(monkeypatch):
    rows = [_city("Климовск", "RU", "RU KS2")]
    monkeypatch.setattr("routes.legacy.cities_search.SessionLocal", lambda: DummySession(rows))

    response = client.get("/api/v1/cities/search", params={"q": "Климовск"})

    assert response.status_code == 200
    assert response.json()["data"][0]["city_name"] == "Климовск"


def test_search_cities_ranks_locode(monkeypatch):
    rows = [
        _city("Santiago", "CL", "CL SCL"),
        _city("La Serena", "CL", "CL LSC"),
    ]
    monkeypatch.setattr("routes.legacy.cities_search.SessionLocal", lambda: DummySession(rows))

    response = client.get("/api/v1/cities/search", params={"q": "CL SCL"})

    assert response.status_code == 200
    assert response.json()["data"][0]["locode"] == "CL SCL"


def test_search_cities_orders_tied_names_deterministically(monkeypatch):
    rows = [
        _city("Santiago", "PA", "PA SYP"),
        _city("Santiago", "CL", "CL SCL"),
        _city("Santiago", "BR", "BR STG"),
    ]
    monkeypatch.setattr("routes.legacy.cities_search.SessionLocal", lambda: DummySession(rows))

    response = client.get("/api/v1/cities/search", params={"q": "Santiago"})

    assert response.status_code == 200
    assert [city["country_code"] for city in response.json()["data"]] == ["BR", "CL", "PA"]


def test_search_cities_rejects_query_without_letters_or_numbers(monkeypatch):
    def fail_if_database_is_opened():
        raise AssertionError("invalid queries must be rejected before opening the database")

    monkeypatch.setattr(
        "routes.legacy.cities_search.SessionLocal", fail_if_database_is_opened
    )

    response = client.get("/api/v1/cities/search", params={"q": "--"})

    assert response.status_code == 422
    assert response.json()["detail"] == (
        "Search text must contain at least two letters or numbers."
    )


def test_search_cities_validates_query_and_country_lengths():
    too_long_query = "a" * 101

    assert client.get("/api/v1/cities/search", params={"q": too_long_query}).status_code == 422
    assert client.get(
        "/api/v1/cities/search", params={"q": "Paris", "country_code": "F1"}
    ).status_code == 422
