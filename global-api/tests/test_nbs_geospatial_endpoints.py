"""
Tests for NBS geospatial endpoints.

The route file `routes/nbs_geospatial_endpoint.py` was deprecated and moved to
`routes/deprecated/nbs_geospatial_endpoint.py`. It is no longer registered in
main.py, so all /api/v1/nbs/ endpoints return 404.

The backing tables (modelled.nbs_geospatial_catalog and modelled.nbs_layer_publication)
were also dropped in migration 971397f30dd9.
"""
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

DEPRECATED_ENDPOINTS = [
    "/api/v1/nbs/geospatial-catalog/layers",
    "/api/v1/nbs/geospatial-catalog/layers?include=full",
    "/api/v1/nbs/geospatial-catalog/layers/some-layer-id",
    "/api/v1/nbs/geospatial-publications/cities/USA%200US-CA-SF/layers",
    "/api/v1/nbs/geospatial-publications/cities/USA%200US-CA-SF/layers/layer-1/assets",
    "/api/v1/nbs/geospatial-publications/layers/layer-1/publications",
    "/api/v1/nbs/geospatial-publications/publications/pub-1",
]


@pytest.mark.parametrize("url", DEPRECATED_ENDPOINTS)
def test_deprecated_nbs_endpoints_return_404(url):
    """All NBS endpoints must return 404 — the route is no longer registered."""
    response = client.get(url)
    assert response.status_code == 404, (
        f"Expected 404 for deprecated endpoint {url}, got {response.status_code}. "
        "Has nbs_geospatial_endpoint been re-added to main.py?"
    )
