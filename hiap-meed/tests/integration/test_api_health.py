"""
Integration tests for API health and basic endpoints.
"""

import pytest


@pytest.mark.integration
class TestAPIHealth:
    """Test cases for API health and basic functionality."""

    def test_health_endpoint(self, client):
        """Test the dedicated health endpoint."""
        response = client.get("/health")

        assert response.status_code == 200
        assert response.json() == {"status": "healthy"}

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
        assert data["info"]["title"] == "HIAP-MEED"
        ranked_action_schema = data["components"]["schemas"]["RankedActionResult"]
        evidence_summary_property = ranked_action_schema["properties"]["evidence_summary"]
        assert evidence_summary_property["$ref"].endswith(
            "/RankedActionEvidenceSummary"
        )

        feasibility_schema = data["components"]["schemas"][
            "RankedActionFeasibilityEvidenceSummary"
        ]
        feasibility_properties = feasibility_schema["properties"]
        assert feasibility_properties["legal"]["$ref"].endswith(
            "/RankedActionFeasibilityLegalEvidence"
        )
        assert feasibility_properties["mitigation_feasibility"]["$ref"].endswith(
            "/RankedActionFeasibilityMitigationEvidence"
        )
        assert feasibility_properties["financial_feasibility"]["$ref"].endswith(
            "/RankedActionFeasibilityFinancialEvidence"
        )

