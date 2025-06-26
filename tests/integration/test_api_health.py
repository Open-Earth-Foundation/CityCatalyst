"""
Integration tests for API health and basic endpoints.
"""

import pytest
import sys
from pathlib import Path

# Add the app directory to the Python path
app_dir = Path(__file__).parent.parent.parent / "app"
sys.path.insert(0, str(app_dir))


@pytest.mark.integration
class TestAPIHealth:
    """Test cases for API health and basic functionality."""

    def test_root_endpoint(self, client):
        """Test the root health check endpoint."""
        response = client.get("/")

        assert response.status_code == 200
        data = response.json()

        assert "message" in data
        assert "docs_url" in data
        assert "status" in data
        assert data["status"] == "healthy"
        assert data["message"] == "High Impact Actions Prioritizer API"

    def test_docs_endpoint_accessible(self, client):
        """Test that the documentation endpoint is accessible."""
        response = client.get("/docs")

        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]

    def test_openapi_schema_accessible(self, client):
        """Test that the OpenAPI schema is accessible."""
        response = client.get("/openapi.json")

        assert response.status_code == 200
        data = response.json()

        assert "openapi" in data
        assert "info" in data
        assert data["info"]["title"] == "High Impact Actions Prioritizer"
