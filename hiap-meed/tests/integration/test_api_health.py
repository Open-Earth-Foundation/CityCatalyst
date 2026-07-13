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
        city_result_schema = data["components"]["schemas"]["PrioritizerApiCityResult"]
        assert city_result_schema["properties"]["removed_actions"]["items"][
            "$ref"
        ].endswith("/RemovedActionSummary")
        removed_action_schema = data["components"]["schemas"]["RemovedActionSummary"]
        removed_action_properties = removed_action_schema["properties"]
        assert removed_action_properties["legal"]["anyOf"][0]["$ref"].endswith(
            "/RemovedActionLegalEvidence"
        )
        removed_action_legal_schema = data["components"]["schemas"][
            "RemovedActionLegalEvidence"
        ]
        removed_action_legal_properties = removed_action_legal_schema["properties"]
        assert {
            "verdict_category",
            "verdict_score",
            "ownership_description",
            "ownership_description_es",
            "restrictions_description",
            "restrictions_description_es",
            "legal_justification",
            "legal_justification_en",
            "legal_references",
        }.issubset(removed_action_legal_properties.keys())

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
        legal_schema = data["components"]["schemas"][
            "RankedActionFeasibilityLegalEvidence"
        ]
        legal_properties = legal_schema["properties"]
        assert {
            "ownership_category",
            "ownership_score",
            "ownership_description",
            "ownership_description_es",
            "restrictions_category",
            "restrictions_score",
            "restrictions_description",
            "restrictions_description_es",
            "legal_justification",
            "legal_justification_en",
            "legal_references",
        }.issubset(legal_properties.keys())
        hard_filter_schema = data["components"]["schemas"][
            "HardFilterEvidenceSummary"
        ]
        assert hard_filter_schema["properties"]["legal_assessment_summary"][
            "anyOf"
        ][0]["$ref"].endswith("/HardFilterLegalAssessmentSummary")
        hard_filter_legal_schema = data["components"]["schemas"][
            "HardFilterLegalAssessmentSummary"
        ]
        hard_filter_legal_properties = hard_filter_legal_schema["properties"]
        assert {
            "ownership_description",
            "ownership_description_es",
            "restrictions_description",
            "restrictions_description_es",
            "legal_justification",
            "legal_justification_en",
            "legal_references",
        }.issubset(hard_filter_legal_properties.keys())
