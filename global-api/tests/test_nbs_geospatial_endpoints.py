from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_get_catalog_layers_thin_default(monkeypatch):
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
                            "layer_input_id": "layer-1",
                            "name": "Mangrove extent",
                            "layer_type": "ecosystem_type",
                            "category": "coastal",
                            "dataset_id": "dataset-1",
                            "release_id": "release-1",
                            "spatial_resolution": "30m",
                            "crs": "EPSG:4326",
                            "license": "ODbL",
                        }
                    ]

            return DummyResult()

    monkeypatch.setattr("routes.nbs_geospatial_endpoint.SessionLocal", lambda: DummySession())

    response = client.get("/api/v1/nbs/geospatial-catalog/layers")
    assert response.status_code == 200
    payload = response.json()
    assert "layers" in payload
    assert payload["layers"][0]["name"] == "Mangrove extent"


def test_get_catalog_layers_full_projection(monkeypatch):
    class DummySession:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def execute(self, query, params):
            assert "c.*" in str(query)

            class DummyResult:
                def mappings(self):
                    return self

                def all(self):
                    return [{"name": "Flood depth", "layer_input_id": "layer-2"}]

            return DummyResult()

    monkeypatch.setattr("routes.nbs_geospatial_endpoint.SessionLocal", lambda: DummySession())

    response = client.get("/api/v1/nbs/geospatial-catalog/layers?include=full")
    assert response.status_code == 200
    assert response.json()["layers"][0]["name"] == "Flood depth"


def test_get_city_layers_latest_success(monkeypatch):
    class DummySession:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def execute(self, query, params):
            assert "ROW_NUMBER()" in str(query)

            class DummyResult:
                def mappings(self):
                    return self

                def all(self):
                    return [
                        {
                            "publication_id": "pub-1",
                            "layer_input_id": "layer-1",
                            "city_id": "USA 0US-CA-SF",
                            "version_label": "v1",
                            "release_id": "release-1",
                            "data_type": "raster",
                            "assets": {"cog_url": "https://example.com/layer.tif"},
                            "name": "Heat hazard",
                        }
                    ]

            return DummyResult()

    monkeypatch.setattr("routes.nbs_geospatial_endpoint.SessionLocal", lambda: DummySession())

    response = client.get("/api/v1/nbs/geospatial-publications/cities/USA%200US-CA-SF/layers")
    assert response.status_code == 200
    assert len(response.json()["publications"]) == 1


def test_get_city_layer_assets_selector_validation():
    response = client.get(
        "/api/v1/nbs/geospatial-publications/cities/USA%200US-CA-SF/layers/layer-1/assets?latest=true&version_label=v1"
    )
    assert response.status_code == 400
    assert "latest=true" in response.json()["detail"]


def test_get_city_layer_assets_not_found(monkeypatch):
    class DummySession:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def execute(self, query, params):
            class DummyResult:
                def mappings(self):
                    return self

                def first(self):
                    return None

            return DummyResult()

    monkeypatch.setattr("routes.nbs_geospatial_endpoint.SessionLocal", lambda: DummySession())

    response = client.get("/api/v1/nbs/geospatial-publications/cities/USA%200US-CA-SF/layers/layer-1/assets")
    assert response.status_code == 404
    assert "No publication exists" in response.json()["detail"]


def test_get_city_layer_assets_invalid_assets_contract(monkeypatch):
    class DummySession:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def execute(self, query, params):
            class DummyResult:
                def mappings(self):
                    return self

                def first(self):
                    return {
                        "publication_id": "pub-2",
                        "layer_input_id": "layer-1",
                        "city_id": "USA 0US-CA-SF",
                        "version_label": "v2",
                        "data_type": "raster",
                        "assets": {"tiles_visual_base": "https://example.com/tiles"},
                    }

            return DummyResult()

    monkeypatch.setattr("routes.nbs_geospatial_endpoint.SessionLocal", lambda: DummySession())

    response = client.get("/api/v1/nbs/geospatial-publications/cities/USA%200US-CA-SF/layers/layer-1/assets")
    assert response.status_code == 500
    assert "raster publication" in response.json()["detail"]


def test_get_catalog_layer_by_id_success(monkeypatch):
    class DummySession:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def execute(self, query, params):
            class DummyResult:
                def mappings(self):
                    return self

                def first(self):
                    return {
                        "layer_input_id": "layer-1",
                        "name": "Mangrove extent",
                        "layer_type": "ecosystem_type",
                    }

            return DummyResult()

    monkeypatch.setattr("routes.nbs_geospatial_endpoint.SessionLocal", lambda: DummySession())

    response = client.get("/api/v1/nbs/geospatial-catalog/layers/layer-1")
    assert response.status_code == 200
    assert response.json()["name"] == "Mangrove extent"


def test_get_catalog_layer_by_id_not_found(monkeypatch):
    class DummySession:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def execute(self, query, params):
            class DummyResult:
                def mappings(self):
                    return self

                def first(self):
                    return None

            return DummyResult()

    monkeypatch.setattr("routes.nbs_geospatial_endpoint.SessionLocal", lambda: DummySession())

    response = client.get("/api/v1/nbs/geospatial-catalog/layers/layer-missing")
    assert response.status_code == 404
    assert response.json()["detail"] == "Catalog layer not found"


def test_list_publications_for_layer_success(monkeypatch):
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
                            "publication_id": "pub-1",
                            "layer_input_id": "layer-1",
                            "city_id": "USA 0US-CA-SF",
                            "data_type": "raster",
                            "assets": {"cog_url": "https://example.com/layer.tif"},
                            "name": "Heat hazard",
                        }
                    ]

            return DummyResult()

    monkeypatch.setattr("routes.nbs_geospatial_endpoint.SessionLocal", lambda: DummySession())

    response = client.get("/api/v1/nbs/geospatial-publications/layers/layer-1/publications")
    assert response.status_code == 200
    payload = response.json()
    assert "publications" in payload
    assert len(payload["publications"]) == 1


def test_list_publications_for_layer_empty(monkeypatch):
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

    monkeypatch.setattr("routes.nbs_geospatial_endpoint.SessionLocal", lambda: DummySession())

    response = client.get("/api/v1/nbs/geospatial-publications/layers/layer-1/publications")
    assert response.status_code == 200
    assert response.json() == {"publications": []}


def test_get_publication_by_id_success(monkeypatch):
    class DummySession:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def execute(self, query, params):
            class DummyResult:
                def mappings(self):
                    return self

                def first(self):
                    return {
                        "publication_id": "pub-1",
                        "layer_input_id": "layer-1",
                        "city_id": "USA 0US-CA-SF",
                        "data_type": "raster",
                        "assets": {"cog_url": "https://example.com/layer.tif"},
                        "name": "Heat hazard",
                    }

            return DummyResult()

    monkeypatch.setattr("routes.nbs_geospatial_endpoint.SessionLocal", lambda: DummySession())

    response = client.get("/api/v1/nbs/geospatial-publications/publications/pub-1")
    assert response.status_code == 200
    assert response.json()["publication_id"] == "pub-1"


def test_get_publication_by_id_not_found(monkeypatch):
    class DummySession:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def execute(self, query, params):
            class DummyResult:
                def mappings(self):
                    return self

                def first(self):
                    return None

            return DummyResult()

    monkeypatch.setattr("routes.nbs_geospatial_endpoint.SessionLocal", lambda: DummySession())

    response = client.get("/api/v1/nbs/geospatial-publications/publications/pub-missing")
    assert response.status_code == 404
    assert response.json()["detail"] == "Publication not found"
