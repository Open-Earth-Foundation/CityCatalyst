"""Integration tests for the `/v1/reports/output-plan` endpoint."""

from __future__ import annotations

from dataclasses import dataclass

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.modules.prioritizer.api import (
    get_action_financial_feasibility_scores_data_api_client,
    get_action_mitigation_feasibility_scores_data_api_client,
    get_action_pathways_data_api_client,
    get_action_policy_scores_data_api_client,
    get_city_data_api_client,
    get_legal_data_api_client,
)
from app.modules.prioritizer.internal_models import (
    Action,
    ActionFinancialFeasibilityScoresFetchResult,
    ActionMitigationFeasibilityScoresFetchResult,
    ActionPathwaysFetchResult,
    ActionPolicyScoresFetchResult,
    CityData,
)


@dataclass
class MockCityDataApiClient:
    """In-memory city client for output-plan endpoint tests."""

    city: CityData

    def get_city(self, locode: str) -> CityData:
        """Return the configured city when locode matches."""
        if locode != self.city.locode:
            raise ValueError(f"Unknown locode: {locode}")
        return self.city


@dataclass
class MockActionPathwaysDataApiClient:
    """In-memory action catalog client for output-plan endpoint tests."""

    actions: list[Action]

    def list_actions(self) -> ActionPathwaysFetchResult:
        """Return configured action rows."""
        return ActionPathwaysFetchResult(actions=list(self.actions))


class MockLegalDataApiClient:
    """In-memory legal client for output-plan endpoint tests."""

    def get_action_legal_assessments(self, country_code: str) -> dict[str, object]:
        """Return no legal enrichment for sparse-but-valid source behavior."""
        del country_code
        return {}


class MockPolicyScoresDataApiClient:
    """In-memory policy client for output-plan endpoint tests."""

    def get_action_policy_scores(self, locode: str) -> ActionPolicyScoresFetchResult:
        """Return no policy enrichment for sparse-but-valid source behavior."""
        del locode
        return ActionPolicyScoresFetchResult(scores_by_action_id={})


class MockMitigationFeasibilityDataApiClient:
    """In-memory mitigation feasibility client for output-plan endpoint tests."""

    def get_action_mitigation_feasibility_scores(
        self, locode: str, country_code: str
    ) -> ActionMitigationFeasibilityScoresFetchResult:
        """Return no mitigation enrichment for sparse-but-valid source behavior."""
        del locode, country_code
        return ActionMitigationFeasibilityScoresFetchResult(scores_by_action_id={})


class MockFinancialFeasibilityDataApiClient:
    """In-memory financial feasibility client for output-plan endpoint tests."""

    def get_action_financial_feasibility_scores(
        self, locode: str, country_code: str
    ) -> ActionFinancialFeasibilityScoresFetchResult:
        """Return no financial enrichment for sparse-but-valid source behavior."""
        del locode, country_code
        return ActionFinancialFeasibilityScoresFetchResult(scores_by_action_id={})


@pytest.mark.integration
def test_output_plan_endpoint_returns_debug_chapters_without_llm() -> None:
    """Output-plan endpoint should return one isolated report for one action."""
    app.dependency_overrides[get_city_data_api_client] = lambda: MockCityDataApiClient(
        city=CityData(
            city_name="Santiago",
            locode="CL-SCL",
            country_code="CL",
            region_name="Metropolitana",
            region_code="RM",
        )
    )
    app.dependency_overrides[get_action_pathways_data_api_client] = (
        lambda: MockActionPathwaysDataApiClient(
            actions=[
                Action(
                    action_id="A_1",
                    action_name="Bus electrification",
                    name_i18n={
                        "en": "Bus electrification",
                        "es": "Electrificación de autobuses",
                    },
                )
            ]
        )
    )
    app.dependency_overrides[get_legal_data_api_client] = lambda: MockLegalDataApiClient()
    app.dependency_overrides[get_action_policy_scores_data_api_client] = (
        lambda: MockPolicyScoresDataApiClient()
    )
    app.dependency_overrides[get_action_mitigation_feasibility_scores_data_api_client] = (
        lambda: MockMitigationFeasibilityDataApiClient()
    )
    app.dependency_overrides[get_action_financial_feasibility_scores_data_api_client] = (
        lambda: MockFinancialFeasibilityDataApiClient()
    )

    try:
        with TestClient(app) as test_client:
            response = test_client.post(
                "/v1/reports/output-plan",
                json=_report_request_payload(),
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["locode"] == "CL-SCL"
    assert body["action_id"] == "A_1"
    assert body["language"] == ["en", "es"]
    assert body["format"] == "json_chapters_markdown_i18n"
    assert len(body["chapters"]) == 8
    assert body["chapters"][0]["title"] == {"en": "Snapshot", "es": "Resumen"}
    for chapter in body["chapters"]:
        assert set(chapter["title"]) == {"en", "es"}
        assert set(chapter["markdown"]) == {"en", "es"}
        assert set(chapter["limitations"]) == {"en", "es"}
    assert body["metadata"]["source_context"]["ranking_basis"] == (
        "frontend_prioritization_snapshot"
    )


@pytest.mark.integration
def test_output_plan_endpoint_rejects_action_not_in_snapshot() -> None:
    """Output-plan endpoint should reject actions outside the supplied ranking."""
    with TestClient(app) as test_client:
        response = test_client.post(
            "/v1/reports/output-plan",
            json=_report_request_payload(action_id="A_missing"),
        )

    assert response.status_code == 422
    assert "actionId" in response.json()["detail"]["error"]


@pytest.mark.integration
def test_output_plan_endpoint_rejects_scalar_language() -> None:
    """The breaking multilingual contract should reject a scalar language value."""
    payload = _report_request_payload()
    payload["requestData"]["language"] = "en"  # type: ignore[index]

    with TestClient(app) as test_client:
        response = test_client.post("/v1/reports/output-plan", json=payload)

    assert response.status_code == 422


def _report_request_payload(*, action_id: str = "A_1") -> dict[str, object]:
    """Build one valid output-plan request payload for integration tests."""
    return {
        "meta": {
            "requestId": "report-req-1",
            "generatedAtUtc": "2026-07-14T00:00:00Z",
            "backendConsumer": "hiap-meed",
            "upstreamProvider": "test",
            "apiContext": {"endpoint": "POST /v1/reports/output-plan"},
            "totalRecords": 1,
        },
        "requestData": {
            "locode": "CL-SCL",
            "actionId": action_id,
            "language": ["en", "es"],
            "debugContextOnly": True,
            "prioritizationSnapshot": {
                "request": {
                    "meta": {
                        "requestId": "prioritize-req-1",
                        "generatedAtUtc": "2026-07-14T00:00:00Z",
                        "backendConsumer": "hiap-meed",
                        "upstreamProvider": "test",
                        "apiContext": {
                            "endpoint": "POST /v1/prioritize",
                            "locodes": ["CL-SCL"],
                        },
                        "totalRecords": 1,
                    },
                    "requestData": {
                        "requestedLanguages": ["en"],
                        "topN": 1,
                        "createExplanations": True,
                        "cityDataList": [
                            {
                                "locode": "CL-SCL",
                                "countryCode": "CL",
                                "cityEmissionsData": {"gpcData": {}},
                            }
                        ],
                    },
                },
                "response": {
                    "results": [
                        {
                            "locode": "CL-SCL",
                            "ranked_action_ids": ["A_1"],
                            "ranked_actions": [_ranked_action_payload("A_1")],
                            "removed_actions": [],
                            "metadata": {
                                "locode": "CL-SCL",
                                "internal_request_id": "internal-1",
                                "frontend_request_id": "prioritize-req-1",
                                "counts": {
                                    "total_actions": 1,
                                    "valid_actions": 1,
                                    "discarded_excluded": 0,
                                    "discarded_legal": 0,
                                    "ranked_actions": 1,
                                },
                                "weights": {
                                    "impact": 0.34,
                                    "alignment": 0.33,
                                    "feasibility": 0.33,
                                },
                                "timings": {},
                                "explanations": {
                                    "requested": True,
                                    "generated": 1,
                                    "requested_languages": ["en"],
                                    "canonical_language": "en",
                                    "generated_languages": ["en"],
                                    "translation_warnings": [],
                                },
                                "hard_filter_evidence_by_action_id": {},
                            },
                            "warnings": [],
                        }
                    ]
                },
            },
        },
    }


def _ranked_action_payload(action_id: str) -> dict[str, object]:
    """Build one ranked action snapshot for integration tests."""
    return {
        "action_id": action_id,
        "rank": 1,
        "final_score": 0.8,
        "impact_score": 0.9,
        "alignment_score": 0.7,
        "feasibility_score": 0.6,
        "evidence_summary": {
            "impact": {
                "impact_block_score": 0.9,
                "matched_city_subsector_keys_count": 1,
                "emissions_reduction_component_score": 0.8,
                "timeline_component_score": 0.6,
            },
            "alignment": {
                "alignment_score": 0.7,
                "policy_component_score": 0.8,
                "sector_component_score": 0.6,
                "co_benefit_component_score": 0.5,
                "timeframe_component_score": 0.4,
            },
            "feasibility": {
                "feasibility_score": 0.6,
                "legal": {
                    "assessment_present": True,
                    "assessment_missing": False,
                    "verdict_category": "conditional",
                    "component_score": 0.7,
                },
                "mitigation_feasibility": {
                    "component_score": 0.6,
                    "score_present": True,
                    "score_missing": False,
                },
                "financial_feasibility": {
                    "component_score": 0.5,
                    "score_present": True,
                    "score_missing": False,
                    "route": "grant",
                    "reason": "Eligible for external funding.",
                },
            },
        },
        "explanations": {"en": "Strong local fit."},
    }
