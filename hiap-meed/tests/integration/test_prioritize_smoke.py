"""
Integration smoke tests for the `/v1/prioritize` endpoint.
"""

from dataclasses import dataclass
import json
from pathlib import Path
import time

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
import app.modules.prioritizer.orchestrator as prioritizer_orchestrator
from app.modules.prioritizer.api import (
    get_action_financial_feasibility_scores_data_api_client,
    get_action_pathways_data_api_client,
    get_city_data_api_client,
    get_legal_data_api_client,
    get_action_policy_scores_data_api_client,
    get_action_mitigation_feasibility_scores_data_api_client,
)
from app.modules.prioritizer.internal_models import (
    Action,
    ActionFinancialFeasibilityScoresFetchResult,
    ActionPathwaysFetchResult,
    ActionMitigationFeasibilityScoresFetchResult,
    ActionPolicyScoresFetchResult,
    CityData,
    LegalAssessmentRecord,
)
from app.services.city_attributes_api import DEFAULT_CITY_ATTRIBUTES_BASE_URL
from app.services.http_client import UpstreamApiError
from app.services.data_clients import ApiCityDataApiClient


@dataclass
class MockCityDataApiClient:
    """In-memory city client for prioritization endpoint tests."""

    city: CityData

    def get_city(self, locode: str) -> CityData:
        if locode != self.city.locode:
            raise ValueError(f"Unknown locode: {locode}")
        return self.city


@dataclass
class MockActionPathwaysDataApiClient:
    """In-memory action client for prioritization endpoint tests."""

    actions: list[Action]

    def list_actions(self) -> ActionPathwaysFetchResult:
        return ActionPathwaysFetchResult(actions=list(self.actions))


@dataclass
class MockLegalDataApiClient:
    """In-memory legal client for hard filter integration tests."""

    assessments_by_action_id: dict[str, LegalAssessmentRecord]

    def get_action_legal_assessments(
        self, country_code: str
    ) -> dict[str, LegalAssessmentRecord]:
        """Return legal assessments for the requested country test case."""
        del country_code
        return dict(self.assessments_by_action_id)


@dataclass
class MockActionPolicyScoresDataApiClient:
    """In-memory action policy score client for alignment integration tests."""

    action_policy_scores_by_action_id: dict[str, object]

    def get_action_policy_scores(self, locode: str) -> ActionPolicyScoresFetchResult:
        """Return action policy scores for the requested city test case."""
        del locode
        return ActionPolicyScoresFetchResult(
            scores_by_action_id=dict(self.action_policy_scores_by_action_id)
        )


@dataclass
class MockActionMitigationFeasibilityScoresDataApiClient:
    """In-memory mitigation feasibility score client for endpoint tests."""

    scores_by_action_id: dict[str, object]

    def get_action_mitigation_feasibility_scores(
        self, locode: str, country_code: str
    ) -> ActionMitigationFeasibilityScoresFetchResult:
        """Return mitigation feasibility scores for the requested city test case."""
        del locode, country_code
        return ActionMitigationFeasibilityScoresFetchResult(
            scores_by_action_id=dict(self.scores_by_action_id)
        )


@dataclass
class MockActionFinancialFeasibilityScoresDataApiClient:
    """In-memory financial feasibility score client for endpoint tests."""

    scores_by_action_id: dict[str, object]

    def get_action_financial_feasibility_scores(
        self, locode: str, country_code: str
    ) -> ActionFinancialFeasibilityScoresFetchResult:
        """Return financial feasibility scores for the requested city test case."""
        del locode, country_code
        return ActionFinancialFeasibilityScoresFetchResult(
            scores_by_action_id=dict(self.scores_by_action_id)
        )


@pytest.fixture(autouse=True)
def _default_feasibility_overrides() -> None:
    """Keep prioritization tests off live feasibility APIs by default."""
    app.dependency_overrides[
        get_action_mitigation_feasibility_scores_data_api_client
    ] = lambda: MockActionMitigationFeasibilityScoresDataApiClient(
        scores_by_action_id={}
    )
    app.dependency_overrides[
        get_action_financial_feasibility_scores_data_api_client
    ] = lambda: MockActionFinancialFeasibilityScoresDataApiClient(
        scores_by_action_id={}
    )
    yield
    app.dependency_overrides.pop(
        get_action_mitigation_feasibility_scores_data_api_client,
        None,
    )
    app.dependency_overrides.pop(
        get_action_financial_feasibility_scores_data_api_client,
        None,
    )


@dataclass
class FailingCityDataApiClient:
    """City client double that raises a structured upstream API error."""

    error: UpstreamApiError

    def get_city(self, locode: str) -> CityData:
        """Raise the configured upstream API error for the requested locode."""
        del locode
        raise self.error


@dataclass
class MockExplanationService:
    """In-memory explanation service double for endpoint integration tests."""

    explanations_by_action_id: dict[str, str] | None = None
    should_raise: bool = False
    seen_action_ids: list[str] | None = None

    def __call__(
        self,
        *,
        locode: str,
        scored_actions: list[object],
        city_preference_sectors: list[str],
        city_preference_co_benefit_keys: list[str],
    ) -> tuple[dict[str, str], dict[str, object]]:
        """Return predefined explanations and capture which actions were requested."""
        del (
            locode,
            city_preference_sectors,
            city_preference_co_benefit_keys,
        )
        if self.should_raise:
            raise RuntimeError("simulated explanation provider failure")
        action_ids = [item.action.action_id for item in scored_actions]
        self.seen_action_ids = action_ids
        return dict(self.explanations_by_action_id or {}), {
            "status": "completed",
            "provider": "mock",
            "llm_input": {"curated_actions_count": len(action_ids)},
            "llm_output": {"explanations_by_action_id": dict(self.explanations_by_action_id or {})},
        }


@dataclass
class MockTranslationService:
    """In-memory translation service double for endpoint integration tests."""

    translations_by_action_id: dict[str, dict[str, str]] | None = None
    warnings: list[str] | None = None
    should_raise: bool = False
    seen_target_languages: list[str] | None = None

    def __call__(
        self,
        *,
        canonical_explanations_by_action_id: dict[str, str],
        target_languages: list[str],
    ) -> tuple[dict[str, dict[str, str]], list[str], dict[str, object]]:
        """Return predefined translations and capture the requested target languages."""
        del canonical_explanations_by_action_id
        if self.should_raise:
            raise RuntimeError("simulated translation provider failure")
        self.seen_target_languages = list(target_languages)
        return (
            dict(self.translations_by_action_id or {}),
            list(self.warnings or []),
            {
                "status": "completed",
                "provider": "mock",
                "llm_input": {"target_languages": list(target_languages)},
                "llm_output": {
                    "translations_by_action_id": dict(self.translations_by_action_id or {}),
                    "warning_action_ids": ["A_1"] if self.warnings else [],
                    "warnings": list(self.warnings or []),
                },
            },
        )


@pytest.mark.integration
@pytest.mark.parametrize(
    "weights_override",
    [
        {"impact": 0.6, "alignment": 0.2, "feasibility": 0.1},
        {"impact": 0.55, "alignment": 0.22, "feasibility": 0.23, "unknown": 0.0},
    ],
)
def test_prioritize_rejects_invalid_weights_override(
    weights_override: dict[str, float],
) -> None:
    """Invalid `weightsOverride` values are rejected with HTTP 422."""
    city = CityData(
        city_name="Santiago",
        locode="CL-SCL",
        region_name="Metropolitana",
        region_code="13",
        country_code="CL",
        city_context=[],
    )
    actions = [Action(action_id="A_ok", action_name="Action")]
    mock_city_client = MockCityDataApiClient(city=city)
    mock_action_client = MockActionPathwaysDataApiClient(actions=actions)
    mock_legal_client = MockLegalDataApiClient(assessments_by_action_id={})
    mock_policy_client = MockActionPolicyScoresDataApiClient(action_policy_scores_by_action_id={})

    app.dependency_overrides[get_city_data_api_client] = lambda: mock_city_client
    app.dependency_overrides[get_action_pathways_data_api_client] = lambda: mock_action_client
    app.dependency_overrides[get_legal_data_api_client] = lambda: mock_legal_client
    app.dependency_overrides[get_action_policy_scores_data_api_client] = (
        lambda: mock_policy_client
    )
    try:
        with TestClient(app) as test_client:
            response = test_client.post(
                "/v1/prioritize",
                json={
                    "meta": {
                        "requestId": "req-invalid-weights",
                        "generatedAtUtc": "2026-02-26T11:43:40.011939+00:00",
                        "backendConsumer": "hiap-meed",
                        "upstreamProvider": "city_catalyst_frontend",
                        "apiContext": {
                            "endpoint": "POST /prioritizer/v1/start_prioritization",
                            "locodes": ["CL-SCL"],
                        },
                        "totalRecords": 1,
                    },
                    "requestData": {
                        "requestedLanguages": ["en"],
                        "cityDataList": [
                            {
                                "locode": "CL-SCL",
                                "countryCode": "CL",
                                "populationSize": 1000,
                                "weightsOverride": weights_override,
                                "cityStrategicPreferenceSectors": [],
                                "cityStrategicPreferenceCoBenefitKeys": [],
                                "cityEmissionsData": {
                                    "inventoryYear": None,
                                    "gpcData": {},
                                },
                            }
                        ],
                    },
                },
            )
        assert response.status_code == 422
        assert response.json()["detail"]["request_id"] == "req-invalid-weights"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.integration
def test_prioritize_returns_404_when_upstream_city_is_missing() -> None:
    """Prioritize returns HTTP 404 when the upstream city API has no city data."""
    mock_city_client = FailingCityDataApiClient(
        error=UpstreamApiError(
            status_code=404,
            message="city attributes API call failed with upstream status 404",
            upstream_status_code=404,
            url="https://example.test/api/v0/city_attributes/CL-SCL",
        )
    )
    mock_action_client = MockActionPathwaysDataApiClient(actions=[])
    mock_legal_client = MockLegalDataApiClient(assessments_by_action_id={})
    mock_policy_client = MockActionPolicyScoresDataApiClient(action_policy_scores_by_action_id={})

    app.dependency_overrides[get_city_data_api_client] = lambda: mock_city_client
    app.dependency_overrides[get_action_pathways_data_api_client] = lambda: mock_action_client
    app.dependency_overrides[get_legal_data_api_client] = lambda: mock_legal_client
    app.dependency_overrides[get_action_policy_scores_data_api_client] = (
        lambda: mock_policy_client
    )
    try:
        with TestClient(app) as test_client:
            response = test_client.post(
                "/v1/prioritize",
                json={
                    "meta": {
                        "requestId": "req-city-404",
                        "generatedAtUtc": "2026-02-26T11:43:40.011939+00:00",
                        "backendConsumer": "hiap-meed",
                        "upstreamProvider": "city_catalyst_frontend",
                        "apiContext": {
                            "endpoint": "POST /v1/prioritize",
                            "locodes": ["CL-SCL"],
                        },
                        "totalRecords": 1,
                    },
                    "requestData": {
                        "requestedLanguages": ["en"],
                        "cityDataList": [
                            {
                                "locode": "CL-SCL",
                                "countryCode": "CL",
                                "populationSize": 1000,
                                "cityStrategicPreferenceSectors": [],
                                "cityStrategicPreferenceCoBenefitKeys": [],
                                "cityEmissionsData": {
                                    "inventoryYear": None,
                                    "gpcData": {},
                                },
                            }
                        ],
                    },
                },
            )
        assert response.status_code == 404
        assert response.json()["detail"]["request_id"] == "req-city-404"
        assert response.json()["detail"]["upstream_status_code"] == 404
    finally:
        app.dependency_overrides.clear()


@pytest.mark.integration
def test_prioritize_returns_503_for_retryable_upstream_city_failure() -> None:
    """Prioritize returns HTTP 503 when the upstream city API is unavailable."""
    mock_city_client = FailingCityDataApiClient(
        error=UpstreamApiError(
            status_code=503,
            message="city attributes API call is temporarily unavailable",
            url="https://example.test/api/v0/city_attributes/CL-SCL",
        )
    )
    mock_action_client = MockActionPathwaysDataApiClient(actions=[])
    mock_legal_client = MockLegalDataApiClient(assessments_by_action_id={})
    mock_policy_client = MockActionPolicyScoresDataApiClient(action_policy_scores_by_action_id={})

    app.dependency_overrides[get_city_data_api_client] = lambda: mock_city_client
    app.dependency_overrides[get_action_pathways_data_api_client] = lambda: mock_action_client
    app.dependency_overrides[get_legal_data_api_client] = lambda: mock_legal_client
    app.dependency_overrides[get_action_policy_scores_data_api_client] = (
        lambda: mock_policy_client
    )
    try:
        with TestClient(app) as test_client:
            response = test_client.post(
                "/v1/prioritize",
                json={
                    "meta": {
                        "requestId": "req-city-503",
                        "generatedAtUtc": "2026-02-26T11:43:40.011939+00:00",
                        "backendConsumer": "hiap-meed",
                        "upstreamProvider": "city_catalyst_frontend",
                        "apiContext": {
                            "endpoint": "POST /v1/prioritize",
                            "locodes": ["CL-SCL"],
                        },
                        "totalRecords": 1,
                    },
                    "requestData": {
                        "requestedLanguages": ["en"],
                        "cityDataList": [
                            {
                                "locode": "CL-SCL",
                                "countryCode": "CL",
                                "populationSize": 1000,
                                "cityStrategicPreferenceSectors": [],
                                "cityStrategicPreferenceCoBenefitKeys": [],
                                "cityEmissionsData": {
                                    "inventoryYear": None,
                                    "gpcData": {},
                                },
                            }
                        ],
                    },
                },
            )
        assert response.status_code == 503
        assert response.json()["detail"]["request_id"] == "req-city-503"
        assert response.json()["detail"]["upstream_url"] == (
            "https://example.test/api/v0/city_attributes/CL-SCL"
        )
    finally:
        app.dependency_overrides.clear()


@pytest.mark.integration
def test_prioritize_returns_502_for_upstream_city_schema_drift(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Prioritize returns HTTP 502 when the upstream city payload fails schema validation."""

    def _mock_get(
        self: httpx.Client, url: str, headers: dict[str, str] | None = None
    ) -> httpx.Response:
        request = httpx.Request("GET", url, headers=headers)
        return httpx.Response(
            200,
            request=request,
            json={
                "meta": {
                    "generated_at_utc": "2026-05-13T09:39:51.706285+00:00",
                    "api_context": {
                        "endpoint": "GET /api/v0/city_attributes/{locode}",
                        "locode": "CL SCL",
                        "version_label": None,
                    },
                    "datasources": [],
                },
                "city": {
                    "locode": "CL SCL",
                    "country_code": "CL",
                    "region_code": "13",
                    "region_name": "Metropolitana",
                },
            },
        )

    monkeypatch.setattr(httpx.Client, "get", _mock_get)

    mock_action_client = MockActionPathwaysDataApiClient(actions=[])
    mock_legal_client = MockLegalDataApiClient(assessments_by_action_id={})
    mock_policy_client = MockActionPolicyScoresDataApiClient(action_policy_scores_by_action_id={})

    app.dependency_overrides[get_city_data_api_client] = lambda: ApiCityDataApiClient()
    app.dependency_overrides[get_action_pathways_data_api_client] = lambda: mock_action_client
    app.dependency_overrides[get_legal_data_api_client] = lambda: mock_legal_client
    app.dependency_overrides[get_action_policy_scores_data_api_client] = (
        lambda: mock_policy_client
    )
    try:
        with TestClient(app) as test_client:
            response = test_client.post(
                "/v1/prioritize",
                json={
                    "meta": {
                        "requestId": "req-city-schema-drift",
                        "generatedAtUtc": "2026-02-26T11:43:40.011939+00:00",
                        "backendConsumer": "hiap-meed",
                        "upstreamProvider": "city_catalyst_frontend",
                        "apiContext": {
                            "endpoint": "POST /v1/prioritize",
                            "locodes": ["CL SCL"],
                        },
                        "totalRecords": 1,
                    },
                    "requestData": {
                        "requestedLanguages": ["en"],
                        "cityDataList": [
                            {
                                "locode": "CL SCL",
                                "countryCode": "CL",
                                "populationSize": 1000,
                                "cityStrategicPreferenceSectors": [],
                                "cityStrategicPreferenceCoBenefitKeys": [],
                                "cityEmissionsData": {
                                    "inventoryYear": None,
                                    "gpcData": {},
                                },
                            }
                        ],
                    },
                },
            )
        assert response.status_code == 502
        assert response.json()["detail"]["request_id"] == "req-city-schema-drift"
        assert response.json()["detail"]["upstream_status_code"] == 200
        assert response.json()["detail"]["upstream_url"] == (
            f"{DEFAULT_CITY_ATTRIBUTES_BASE_URL.rstrip('/')}/api/v0/city_attributes/CL%20SCL"
        )
    finally:
        app.dependency_overrides.clear()


@pytest.mark.integration
def test_prioritize_rejects_negative_non_afolu_total_emissions() -> None:
    """Endpoint rejects negative city emissions outside AFOLU at request validation."""
    city = CityData(
        city_name="Santiago",
        locode="CL-SCL",
        region_name="Metropolitana",
        region_code="13",
        country_code="CL",
        city_context=[],
    )
    actions = [Action(action_id="A_ok", action_name="Action")]
    mock_city_client = MockCityDataApiClient(city=city)
    mock_action_client = MockActionPathwaysDataApiClient(actions=actions)
    mock_legal_client = MockLegalDataApiClient(assessments_by_action_id={})
    mock_policy_client = MockActionPolicyScoresDataApiClient(action_policy_scores_by_action_id={})

    app.dependency_overrides[get_city_data_api_client] = lambda: mock_city_client
    app.dependency_overrides[get_action_pathways_data_api_client] = lambda: mock_action_client
    app.dependency_overrides[get_legal_data_api_client] = lambda: mock_legal_client
    app.dependency_overrides[get_action_policy_scores_data_api_client] = (
        lambda: mock_policy_client
    )
    try:
        with TestClient(app) as test_client:
            response = test_client.post(
                "/v1/prioritize",
                json={
                    "meta": {
                        "requestId": "req-invalid-non-afolu-negative",
                        "generatedAtUtc": "2026-02-26T11:43:40.011939+00:00",
                        "backendConsumer": "hiap-meed",
                        "upstreamProvider": "city_catalyst_frontend",
                        "apiContext": {
                            "endpoint": "POST /prioritizer/v1/start_prioritization",
                            "locodes": ["CL-SCL"],
                        },
                        "totalRecords": 1,
                    },
                    "requestData": {
                        "requestedLanguages": ["en"],
                        "cityDataList": [
                            {
                                "locode": "CL-SCL",
                                "countryCode": "CL",
                                "populationSize": 1000,
                                "cityStrategicPreferenceSectors": [],
                                "cityStrategicPreferenceCoBenefitKeys": [],
                                "cityEmissionsData": {
                                    "inventoryYear": 2022,
                                    "gpcData": {
                                        "III.1.1": {
                                            "activities": [
                                                {
                                                    "activityType": "Combustion",
                                                    "totalEmissions": -5.0,
                                                }
                                            ]
                                        }
                                    },
                                },
                            }
                        ],
                    },
                },
            )
        assert response.status_code == 422
        assert "only `V.*` may be negative" in response.json()["detail"][0]["msg"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.integration
def test_prioritize_smoke() -> None:
    """Frontend envelope request returns deterministic ranked action IDs."""
    city = CityData(
        city_name="Santiago",
        locode="CL-SCL",
        region_name="Metropolitana",
        region_code="13",
        country_code="CL",
        city_context=[
            {
                "attribute_type": "unemployment_rate",
                "attribute_value": 7.2,
                "attribute_units": "percent",
                "attribute_category": "medium",
            }
        ],
    )
    actions = [
        Action(
            action_id="c40_0010",
            action_name="Retrofit buildings",
            implementation_timeline="<5 years",
            emissions={
                "sector_number": "I",
                "subsector_number": [1],
                "gpc_reference_number": ["I.1.1", "I.1.2"],
                "impact_relationship": "positive",
                "impact_text": "high",
            },
        ),
        Action(
            action_id="c40_0020",
            action_name="Fleet expansion",
            implementation_timeline=">10 years",
            emissions={
                "sector_number": "I",
                "subsector_number": [2],
                "gpc_reference_number": ["I.2.1"],
                "impact_relationship": "negative",
                "impact_text": "low",
            },
        ),
    ]
    mock_city_client = MockCityDataApiClient(city=city)
    mock_action_client = MockActionPathwaysDataApiClient(actions=actions)
    mock_legal_client = MockLegalDataApiClient(assessments_by_action_id={})
    mock_policy_client = MockActionPolicyScoresDataApiClient(action_policy_scores_by_action_id={})

    app.dependency_overrides[get_city_data_api_client] = lambda: mock_city_client
    app.dependency_overrides[get_action_pathways_data_api_client] = lambda: mock_action_client
    app.dependency_overrides[get_legal_data_api_client] = lambda: mock_legal_client
    app.dependency_overrides[get_action_policy_scores_data_api_client] = (
        lambda: mock_policy_client
    )
    try:
        with TestClient(app) as test_client:
            response = test_client.post(
                "/v1/prioritize",
                json={
                    "meta": {
                        "requestId": "1234567890",
                        "generatedAtUtc": "2026-02-26T11:43:40.011939+00:00",
                        "backendConsumer": "hiap-meed",
                        "upstreamProvider": "city_catalyst_frontend",
                        "apiContext": {
                            "endpoint": "POST /prioritizer/v1/start_prioritization",
                            "locodes": ["CL-SCL"],
                        },
                        "totalRecords": 1,
                    },
                    "requestData": {
                        "requestedLanguages": ["en"],
                        "cityDataList": [
                            {
                                "locode": "CL-SCL",
                                "countryCode": "CL",
                                "populationSize": 1000,
                                "excludedActionIds": [],
                                "cityStrategicPreferenceSectors": [],
                                "cityStrategicPreferenceTimeframes": [
                                    "medium",
                                    "long",
                                ],
                                "cityStrategicPreferenceCoBenefitKeys": [],
                                "cityEmissionsData": {"inventoryYear": None, "gpcData": {}},
                            }
                        ],
                    },
                },
            )
        assert response.status_code == 200
        body = response.json()

        assert "results" in body
        assert len(body["results"]) == 1
        result = body["results"][0]
        assert result["locode"] == "CL-SCL"
        assert result["ranked_action_ids"] == ["c40_0010", "c40_0020"]
        assert len(result["ranked_actions"]) == 2
        first_ranked_action = result["ranked_actions"][0]
        assert first_ranked_action["action_id"] == "c40_0010"
        assert first_ranked_action["rank"] == 1
        assert "final_score" in first_ranked_action
        assert "impact_score" in first_ranked_action
        assert "alignment_score" in first_ranked_action
        assert "feasibility_score" in first_ranked_action
        assert "evidence_summary" in first_ranked_action
        assert first_ranked_action["evidence_summary"]["alignment"][
            "timeframe_component_score"
        ] == pytest.approx(0.5)
        assert first_ranked_action["explanations"] == {}
        assert "metadata" in result
        assert result["metadata"]["frontend_request_id"] == "1234567890"
        assert "timings" in result["metadata"]
        assert "counts" in result["metadata"]
        assert result["metadata"]["counts"]["discarded_excluded"] == 0
        assert result["metadata"]["counts"]["discarded_legal"] == 0
    finally:
        app.dependency_overrides.clear()


@pytest.mark.integration
def test_exclusion_preview_returns_deterministic_proposals(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Preview endpoint returns proposed exclusions with grouped reasons."""
    artifact_log_dir = tmp_path / "logs"
    monkeypatch.setenv("LOG_DIR", str(artifact_log_dir))
    monkeypatch.setenv("LOCAL_ARTIFACTS_ENABLED", "true")

    actions = [
        Action(
            action_id="A_waste",
            action_name="Waste action",
            emissions={"sector_number": "III"},
        ),
        Action(
            action_id="A_air",
            action_name="Air impact action",
            emissions={"sector_number": "II"},
            co_benefits={"air_quality": {"impact_numeric": -1}},
        ),
    ]
    mock_action_client = MockActionPathwaysDataApiClient(actions=actions)

    app.dependency_overrides[get_action_pathways_data_api_client] = lambda: mock_action_client
    try:
        with TestClient(app) as test_client:
            response = test_client.post(
                "/v1/prioritize/exclusions/preview",
                json={
                    "meta": {
                        "requestId": "req-exclusion-preview",
                        "generatedAtUtc": "2026-02-26T11:43:40.011939+00:00",
                        "backendConsumer": "hiap-meed",
                        "upstreamProvider": "city_catalyst_frontend",
                        "apiContext": {
                            "endpoint": "POST /v1/prioritize/exclusions/preview",
                            "locodes": ["CL-SCL"],
                        },
                        "totalRecords": 1,
                    },
                    "requestData": {
                        "cityDataList": [
                            {
                                "locode": "CL-SCL",
                                "excludedSectorTags": ["waste"],
                                "excludedCoBenefitKeys": ["air_quality"],
                            }
                        ]
                    },
                },
            )

        assert response.status_code == 200
        result = response.json()["results"][0]
        assert [item["actionId"] for item in result["proposedExcludedActions"]] == [
            "A_air",
            "A_waste",
        ]
        assert result["exclusionSummary"]["totalProposed"] == 2
        assert result["exclusionSummary"]["byReasonType"]["sector"]["actionIds"] == [
            "A_waste"
        ]
        assert result["exclusionSummary"]["byReasonType"]["co_benefit"]["actionIds"] == [
            "A_air"
        ]
        request_runs = sorted((artifact_log_dir / "requests" / "exclusion_preview").glob("*"))
        assert len(request_runs) == 1
        run_dir = request_runs[0]
        manifest_payload = json.loads((run_dir / "manifest.json").read_text("utf-8"))
        assert manifest_payload["request_kind"] == "exclusion_preview"
        assert (run_dir / "response_full.json").exists()
        assert (run_dir / "002_exclusion_preview_cl-scl.json").exists()
        assert (run_dir / "cities").exists() is False
        assert (run_dir / "llm" / "cl-scl_free_text_exclusion_io.json").exists() is False
        assert (artifact_log_dir / "requests" / "prioritization").exists() is False
    finally:
        app.dependency_overrides.clear()


@pytest.mark.integration
def test_exclusion_preview_rejects_invalid_sector_tag() -> None:
    """Preview endpoint should reject unsupported excluded sector tags."""
    try:
        with TestClient(app) as test_client:
            response = test_client.post(
                "/v1/prioritize/exclusions/preview",
                json={
                    "meta": {
                        "requestId": "req-invalid-sector-tag",
                        "generatedAtUtc": "2026-02-26T11:43:40.011939+00:00",
                        "backendConsumer": "hiap-meed",
                        "upstreamProvider": "city_catalyst_frontend",
                        "apiContext": {
                            "endpoint": "POST /v1/prioritize/exclusions/preview",
                            "locodes": ["CL-SCL"],
                        },
                        "totalRecords": 1,
                    },
                    "requestData": {
                        "cityDataList": [
                            {
                                "locode": "CL-SCL",
                                "excludedSectorTags": ["energy"],
                                "excludedCoBenefitKeys": [],
                            }
                        ]
                    },
                },
            )

        assert response.status_code == 422
    finally:
        app.dependency_overrides.clear()


@pytest.mark.integration
def test_exclusion_preview_rejects_invalid_co_benefit_key() -> None:
    """Preview endpoint should reject unsupported excluded co-benefit keys."""
    try:
        with TestClient(app) as test_client:
            response = test_client.post(
                "/v1/prioritize/exclusions/preview",
                json={
                    "meta": {
                        "requestId": "req-invalid-co-benefit",
                        "generatedAtUtc": "2026-02-26T11:43:40.011939+00:00",
                        "backendConsumer": "hiap-meed",
                        "upstreamProvider": "city_catalyst_frontend",
                        "apiContext": {
                            "endpoint": "POST /v1/prioritize/exclusions/preview",
                            "locodes": ["CL-SCL"],
                        },
                        "totalRecords": 1,
                    },
                    "requestData": {
                        "cityDataList": [
                            {
                                "locode": "CL-SCL",
                                "excludedSectorTags": ["waste"],
                                "excludedCoBenefitKeys": ["jobs"],
                            }
                        ]
                    },
                },
            )

        assert response.status_code == 422
    finally:
        app.dependency_overrides.clear()


@pytest.mark.integration
def test_prioritize_honors_confirmed_excluded_action_ids() -> None:
    """Ranking endpoint removes confirmed exclusions before scoring."""
    city = CityData(
        city_name="Santiago",
        locode="CL-SCL",
        region_name="Metropolitana",
        region_code="13",
        country_code="CL",
        city_context=[],
    )
    actions = [
        Action(action_id="A_keep", action_name="Keep action"),
        Action(action_id="A_exclude", action_name="Exclude action"),
    ]
    mock_city_client = MockCityDataApiClient(city=city)
    mock_action_client = MockActionPathwaysDataApiClient(actions=actions)
    mock_legal_client = MockLegalDataApiClient(assessments_by_action_id={})
    mock_policy_client = MockActionPolicyScoresDataApiClient(action_policy_scores_by_action_id={})

    app.dependency_overrides[get_city_data_api_client] = lambda: mock_city_client
    app.dependency_overrides[get_action_pathways_data_api_client] = lambda: mock_action_client
    app.dependency_overrides[get_legal_data_api_client] = lambda: mock_legal_client
    app.dependency_overrides[get_action_policy_scores_data_api_client] = (
        lambda: mock_policy_client
    )
    try:
        with TestClient(app) as test_client:
            response = test_client.post(
                "/v1/prioritize",
                json={
                    "meta": {
                        "requestId": "req-confirmed-exclusions",
                        "generatedAtUtc": "2026-02-26T11:43:40.011939+00:00",
                        "backendConsumer": "hiap-meed",
                        "upstreamProvider": "city_catalyst_frontend",
                        "apiContext": {
                            "endpoint": "POST /prioritizer/v1/start_prioritization",
                            "locodes": ["CL-SCL"],
                        },
                        "totalRecords": 1,
                    },
                    "requestData": {
                        "requestedLanguages": ["en"],
                        "cityDataList": [
                            {
                                "locode": "CL-SCL",
                                "countryCode": "CL",
                                "populationSize": 1000,
                                "excludedActionIds": ["A_exclude"],
                                "cityStrategicPreferenceSectors": [],
                                "cityStrategicPreferenceCoBenefitKeys": [],
                                "cityEmissionsData": {
                                    "inventoryYear": None,
                                    "gpcData": {},
                                },
                            }
                        ],
                    },
                },
            )

        assert response.status_code == 200
        result = response.json()["results"][0]
        assert result["ranked_action_ids"] == ["A_keep"]
        assert result["metadata"]["counts"]["discarded_excluded"] == 1
        excluded_evidence = result["metadata"]["hard_filter_evidence_by_action_id"][
            "A_exclude"
        ]
        assert excluded_evidence["discard_reason"] == "user_excluded"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.integration
def test_prioritize_rejects_no_preference_with_other_timeframes() -> None:
    """`no_preference` cannot be combined with explicit timeframe choices."""
    city = CityData(
        city_name="Santiago",
        locode="CL-SCL",
        region_name="Metropolitana",
        region_code="13",
        country_code="CL",
        city_context=[],
    )
    actions = [Action(action_id="A_ok", action_name="Action")]
    mock_city_client = MockCityDataApiClient(city=city)
    mock_action_client = MockActionPathwaysDataApiClient(actions=actions)
    mock_legal_client = MockLegalDataApiClient(assessments_by_action_id={})
    mock_policy_client = MockActionPolicyScoresDataApiClient(action_policy_scores_by_action_id={})

    app.dependency_overrides[get_city_data_api_client] = lambda: mock_city_client
    app.dependency_overrides[get_action_pathways_data_api_client] = lambda: mock_action_client
    app.dependency_overrides[get_legal_data_api_client] = lambda: mock_legal_client
    app.dependency_overrides[get_action_policy_scores_data_api_client] = (
        lambda: mock_policy_client
    )
    try:
        with TestClient(app) as test_client:
            response = test_client.post(
                "/v1/prioritize",
                json={
                    "meta": {
                        "requestId": "req-invalid-timeframes",
                        "generatedAtUtc": "2026-02-26T11:43:40.011939+00:00",
                        "backendConsumer": "hiap-meed",
                        "upstreamProvider": "city_catalyst_frontend",
                        "apiContext": {
                            "endpoint": "POST /prioritizer/v1/start_prioritization",
                            "locodes": ["CL-SCL"],
                        },
                        "totalRecords": 1,
                    },
                    "requestData": {
                        "requestedLanguages": ["en"],
                        "cityDataList": [
                            {
                                "locode": "CL-SCL",
                                "countryCode": "CL",
                                "populationSize": 1000,
                                "cityStrategicPreferenceSectors": [],
                                "cityStrategicPreferenceTimeframes": [
                                    "no_preference",
                                    "short",
                                ],
                                "cityStrategicPreferenceCoBenefitKeys": [],
                                "cityEmissionsData": {
                                    "inventoryYear": None,
                                    "gpcData": {},
                                },
                            }
                        ],
                    },
                },
            )
        assert response.status_code == 422
    finally:
        app.dependency_overrides.clear()


@pytest.mark.integration
def test_prioritize_rejects_invalid_city_preference_sector_tag() -> None:
    """Prioritize endpoint should reject unsupported preferred sector tags."""
    city = CityData(
        city_name="Santiago",
        locode="CL-SCL",
        region_name="Metropolitana",
        region_code="13",
        country_code="CL",
        city_context=[],
    )
    actions = [Action(action_id="A_ok", action_name="Action")]
    mock_city_client = MockCityDataApiClient(city=city)
    mock_action_client = MockActionPathwaysDataApiClient(actions=actions)
    mock_legal_client = MockLegalDataApiClient(assessments_by_action_id={})
    mock_policy_client = MockActionPolicyScoresDataApiClient(action_policy_scores_by_action_id={})

    app.dependency_overrides[get_city_data_api_client] = lambda: mock_city_client
    app.dependency_overrides[get_action_pathways_data_api_client] = lambda: mock_action_client
    app.dependency_overrides[get_legal_data_api_client] = lambda: mock_legal_client
    app.dependency_overrides[get_action_policy_scores_data_api_client] = (
        lambda: mock_policy_client
    )
    try:
        with TestClient(app) as test_client:
            response = test_client.post(
                "/v1/prioritize",
                json={
                    "meta": {
                        "requestId": "req-invalid-sector-tag",
                        "generatedAtUtc": "2026-02-26T11:43:40.011939+00:00",
                        "backendConsumer": "hiap-meed",
                        "upstreamProvider": "city_catalyst_frontend",
                        "apiContext": {
                            "endpoint": "POST /prioritizer/v1/start_prioritization",
                            "locodes": ["CL-SCL"],
                        },
                        "totalRecords": 1,
                    },
                    "requestData": {
                        "requestedLanguages": ["en"],
                        "cityDataList": [
                            {
                                "locode": "CL-SCL",
                                "countryCode": "CL",
                                "populationSize": 1000,
                                "cityStrategicPreferenceSectors": ["energy"],
                                "cityStrategicPreferenceCoBenefitKeys": [],
                                "cityEmissionsData": {
                                    "inventoryYear": None,
                                    "gpcData": {},
                                },
                            }
                        ],
                    },
                },
            )

        assert response.status_code == 422
    finally:
        app.dependency_overrides.clear()


@pytest.mark.integration
def test_prioritize_rejects_invalid_city_preference_co_benefit_key() -> None:
    """Prioritize endpoint should reject unsupported preferred co-benefit keys."""
    city = CityData(
        city_name="Santiago",
        locode="CL-SCL",
        region_name="Metropolitana",
        region_code="13",
        country_code="CL",
        city_context=[],
    )
    actions = [Action(action_id="A_ok", action_name="Action")]
    mock_city_client = MockCityDataApiClient(city=city)
    mock_action_client = MockActionPathwaysDataApiClient(actions=actions)
    mock_legal_client = MockLegalDataApiClient(assessments_by_action_id={})
    mock_policy_client = MockActionPolicyScoresDataApiClient(action_policy_scores_by_action_id={})

    app.dependency_overrides[get_city_data_api_client] = lambda: mock_city_client
    app.dependency_overrides[get_action_pathways_data_api_client] = lambda: mock_action_client
    app.dependency_overrides[get_legal_data_api_client] = lambda: mock_legal_client
    app.dependency_overrides[get_action_policy_scores_data_api_client] = (
        lambda: mock_policy_client
    )
    try:
        with TestClient(app) as test_client:
            response = test_client.post(
                "/v1/prioritize",
                json={
                    "meta": {
                        "requestId": "req-invalid-co-benefit-key",
                        "generatedAtUtc": "2026-02-26T11:43:40.011939+00:00",
                        "backendConsumer": "hiap-meed",
                        "upstreamProvider": "city_catalyst_frontend",
                        "apiContext": {
                            "endpoint": "POST /prioritizer/v1/start_prioritization",
                            "locodes": ["CL-SCL"],
                        },
                        "totalRecords": 1,
                    },
                    "requestData": {
                        "requestedLanguages": ["en"],
                        "cityDataList": [
                            {
                                "locode": "CL-SCL",
                                "countryCode": "CL",
                                "populationSize": 1000,
                                "cityStrategicPreferenceSectors": [],
                                "cityStrategicPreferenceCoBenefitKeys": ["jobs"],
                                "cityEmissionsData": {
                                    "inventoryYear": None,
                                    "gpcData": {},
                                },
                            }
                        ],
                    },
                },
            )

        assert response.status_code == 422
    finally:
        app.dependency_overrides.clear()


@pytest.mark.integration
def test_prioritize_alignment_timeframe_multi_select_uses_best_match() -> None:
    """Multi-select timeframes use the best score, including nearest selected bucket."""
    city = CityData(
        city_name="Santiago",
        locode="CL-SCL",
        region_name="Metropolitana",
        region_code="13",
        country_code="CL",
        city_context=[],
    )
    actions = [
        Action(
            action_id="A_long",
            action_name="Long action",
            implementation_timeline=">10 years",
        ),
        Action(
            action_id="A_short",
            action_name="Short action",
            implementation_timeline="<5 years",
        ),
    ]
    mock_city_client = MockCityDataApiClient(city=city)
    mock_action_client = MockActionPathwaysDataApiClient(actions=actions)
    mock_legal_client = MockLegalDataApiClient(assessments_by_action_id={})
    mock_policy_client = MockActionPolicyScoresDataApiClient(action_policy_scores_by_action_id={})

    app.dependency_overrides[get_city_data_api_client] = lambda: mock_city_client
    app.dependency_overrides[get_action_pathways_data_api_client] = lambda: mock_action_client
    app.dependency_overrides[get_legal_data_api_client] = lambda: mock_legal_client
    app.dependency_overrides[get_action_policy_scores_data_api_client] = (
        lambda: mock_policy_client
    )
    try:
        with TestClient(app) as test_client:
            response = test_client.post(
                "/v1/prioritize",
                json={
                    "meta": {
                        "requestId": "req-timeframe-best-match",
                        "generatedAtUtc": "2026-02-26T11:43:40.011939+00:00",
                        "backendConsumer": "hiap-meed",
                        "upstreamProvider": "city_catalyst_frontend",
                        "apiContext": {
                            "endpoint": "POST /prioritizer/v1/start_prioritization",
                            "locodes": ["CL-SCL"],
                        },
                        "totalRecords": 1,
                    },
                    "requestData": {
                        "requestedLanguages": ["en"],
                        "cityDataList": [
                            {
                                "locode": "CL-SCL",
                                "countryCode": "CL",
                                "populationSize": 1000,
                                "weightsOverride": {
                                    "impact": 0.0,
                                    "alignment": 1.0,
                                    "feasibility": 0.0,
                                },
                                "cityStrategicPreferenceSectors": [],
                                "cityStrategicPreferenceTimeframes": [
                                    "medium",
                                    "long",
                                ],
                                "cityStrategicPreferenceCoBenefitKeys": [],
                                "cityEmissionsData": {
                                    "inventoryYear": None,
                                    "gpcData": {},
                                },
                            }
                        ],
                    },
                },
            )
        assert response.status_code == 200
        body = response.json()
        result = body["results"][0]
        assert result["ranked_action_ids"] == ["A_long", "A_short"]
        assert result["ranked_actions"][0]["evidence_summary"]["alignment"][
            "timeframe_component_score"
        ] == pytest.approx(1.0)
        assert result["ranked_actions"][1]["evidence_summary"]["alignment"][
            "timeframe_component_score"
        ] == pytest.approx(0.5)
    finally:
        app.dependency_overrides.clear()


@pytest.mark.integration
def test_prioritize_discards_hard_legal_mismatch() -> None:
    """Actions failing hard legal requirements are removed before ranking."""
    city = CityData(
        city_name="Santiago",
        locode="CL-SCL",
        region_name="Metropolitana",
        region_code="13",
        country_code="CL",
        city_context=[],
    )
    actions = [
        Action(action_id="A_ok", action_name="Aligned action"),
        Action(action_id="A_blocked", action_name="Blocked action"),
    ]
    assessments_by_action_id = {
        "A_blocked": LegalAssessmentRecord(
            action_id="A_blocked",
            country_code="CL",
            verdict_category="blocked",
            verdict_score=0.16,
        )
    }
    mock_city_client = MockCityDataApiClient(city=city)
    mock_action_client = MockActionPathwaysDataApiClient(actions=actions)
    mock_legal_client = MockLegalDataApiClient(
        assessments_by_action_id=assessments_by_action_id
    )
    mock_policy_client = MockActionPolicyScoresDataApiClient(action_policy_scores_by_action_id={})

    app.dependency_overrides[get_city_data_api_client] = lambda: mock_city_client
    app.dependency_overrides[get_action_pathways_data_api_client] = lambda: mock_action_client
    app.dependency_overrides[get_legal_data_api_client] = lambda: mock_legal_client
    app.dependency_overrides[get_action_policy_scores_data_api_client] = (
        lambda: mock_policy_client
    )
    try:
        with TestClient(app) as test_client:
            response = test_client.post(
                "/v1/prioritize",
                json={
                    "meta": {
                        "requestId": "req-legal-discard",
                        "generatedAtUtc": "2026-02-26T11:43:40.011939+00:00",
                        "backendConsumer": "hiap-meed",
                        "upstreamProvider": "city_catalyst_frontend",
                        "apiContext": {
                            "endpoint": "POST /prioritizer/v1/start_prioritization",
                            "locodes": ["CL-SCL"],
                        },
                        "totalRecords": 1,
                    },
                    "requestData": {
                        "requestedLanguages": ["en"],
                        "cityDataList": [
                            {
                                "locode": "CL-SCL",
                                "countryCode": "CL",
                                "populationSize": 1000,
                                "cityStrategicPreferenceSectors": [],
                                "cityStrategicPreferenceCoBenefitKeys": [],
                                "cityEmissionsData": {"inventoryYear": None, "gpcData": {}},
                            }
                        ],
                    },
                },
            )

        assert response.status_code == 200
        result = response.json()["results"][0]
        assert result["ranked_action_ids"] == ["A_ok"]
        assert result["metadata"]["counts"]["discarded_legal"] == 1
    finally:
        app.dependency_overrides.clear()


@pytest.mark.integration
def test_prioritize_keeps_missing_legal_category_and_uses_score() -> None:
    """Missing verdict category should not hard-filter an action when a score exists."""
    city = CityData(
        city_name="Santiago",
        locode="CL-SCL",
        region_name="Metropolitana",
        region_code="13",
        country_code="CL",
        city_context=[],
    )
    actions = [Action(action_id="A_unknown", action_name="Unknown legal evidence action")]
    assessments_by_action_id = {
        "A_unknown": LegalAssessmentRecord(
            action_id="A_unknown",
            country_code="CL",
            verdict_category=None,
            verdict_score=0.75,
        )
    }
    mock_city_client = MockCityDataApiClient(city=city)
    mock_action_client = MockActionPathwaysDataApiClient(actions=actions)
    mock_legal_client = MockLegalDataApiClient(
        assessments_by_action_id=assessments_by_action_id
    )
    mock_policy_client = MockActionPolicyScoresDataApiClient(action_policy_scores_by_action_id={})

    app.dependency_overrides[get_city_data_api_client] = lambda: mock_city_client
    app.dependency_overrides[get_action_pathways_data_api_client] = lambda: mock_action_client
    app.dependency_overrides[get_legal_data_api_client] = lambda: mock_legal_client
    app.dependency_overrides[get_action_policy_scores_data_api_client] = (
        lambda: mock_policy_client
    )
    try:
        with TestClient(app) as test_client:
            response = test_client.post(
                "/v1/prioritize",
                json={
                    "meta": {
                        "requestId": "req-legal-no-evidence",
                        "generatedAtUtc": "2026-02-26T11:43:40.011939+00:00",
                        "backendConsumer": "hiap-meed",
                        "upstreamProvider": "city_catalyst_frontend",
                        "apiContext": {
                            "endpoint": "POST /prioritizer/v1/start_prioritization",
                            "locodes": ["CL-SCL"],
                        },
                        "totalRecords": 1,
                    },
                    "requestData": {
                        "requestedLanguages": ["en"],
                        "cityDataList": [
                            {
                                "locode": "CL-SCL",
                                "countryCode": "CL",
                                "populationSize": 1000,
                                "cityStrategicPreferenceSectors": [],
                                "cityStrategicPreferenceCoBenefitKeys": [],
                                "cityEmissionsData": {"inventoryYear": None, "gpcData": {}},
                            }
                        ],
                    },
                },
            )

        assert response.status_code == 200
        result = response.json()["results"][0]
        assert result["ranked_action_ids"] == ["A_unknown"]
        assert result["metadata"]["counts"]["discarded_legal"] == 0

        unknown_evidence = result["metadata"]["hard_filter_evidence_by_action_id"][
            "A_unknown"
        ]
        assert unknown_evidence["discard_reason"] is None
        assert unknown_evidence["legal_assessment_present"] is True
        assert unknown_evidence["legal_verdict_category"] is None
    finally:
        app.dependency_overrides.clear()


@pytest.mark.integration
def test_prioritize_rejects_country_code_mismatch_with_locode_prefix() -> None:
    """Request countryCode must match the first two locode characters."""
    city = CityData(
        city_name="Santiago",
        locode="CL-SCL",
        region_name="Metropolitana",
        region_code="13",
        city_context=[],
        country_code="CL",
    )
    mock_city_client = MockCityDataApiClient(city=city)
    mock_action_client = MockActionPathwaysDataApiClient(actions=[])
    mock_legal_client = MockLegalDataApiClient(assessments_by_action_id={})
    mock_policy_client = MockActionPolicyScoresDataApiClient(action_policy_scores_by_action_id={})

    app.dependency_overrides[get_city_data_api_client] = lambda: mock_city_client
    app.dependency_overrides[get_action_pathways_data_api_client] = lambda: mock_action_client
    app.dependency_overrides[get_legal_data_api_client] = lambda: mock_legal_client
    app.dependency_overrides[get_action_policy_scores_data_api_client] = (
        lambda: mock_policy_client
    )
    try:
        with TestClient(app) as test_client:
            response = test_client.post(
                "/v1/prioritize",
                json={
                    "meta": {
                        "requestId": "req-country-mismatch",
                        "generatedAtUtc": "2026-02-26T11:43:40.011939+00:00",
                        "backendConsumer": "hiap-meed",
                        "upstreamProvider": "city_catalyst_frontend",
                        "apiContext": {
                            "endpoint": "POST /v1/prioritize",
                            "locodes": ["CL-SCL"],
                        },
                        "totalRecords": 1,
                    },
                    "requestData": {
                        "requestedLanguages": ["en"],
                        "cityDataList": [
                            {
                                "locode": "CL-SCL",
                                "countryCode": "DE",
                                "cityStrategicPreferenceSectors": [],
                                "cityStrategicPreferenceCoBenefitKeys": [],
                                "cityEmissionsData": {
                                    "inventoryYear": None,
                                    "gpcData": {},
                                },
                            }
                        ],
                    },
                },
            )

        assert response.status_code == 422
        assert "locode country prefix" in response.json()["detail"]["error"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.integration
def test_prioritize_returns_502_for_city_country_code_mismatch() -> None:
    """Fetched city country_code mismatches should be surfaced as upstream inconsistency."""
    city = CityData(
        city_name="Santiago",
        locode="CL-SCL",
        region_name="Metropolitana",
        region_code="13",
        city_context=[],
        country_code="AR",
    )
    mock_city_client = MockCityDataApiClient(city=city)
    mock_action_client = MockActionPathwaysDataApiClient(actions=[])
    mock_legal_client = MockLegalDataApiClient(assessments_by_action_id={})
    mock_policy_client = MockActionPolicyScoresDataApiClient(action_policy_scores_by_action_id={})

    app.dependency_overrides[get_city_data_api_client] = lambda: mock_city_client
    app.dependency_overrides[get_action_pathways_data_api_client] = lambda: mock_action_client
    app.dependency_overrides[get_legal_data_api_client] = lambda: mock_legal_client
    app.dependency_overrides[get_action_policy_scores_data_api_client] = (
        lambda: mock_policy_client
    )
    try:
        with TestClient(app) as test_client:
            response = test_client.post(
                "/v1/prioritize",
                json={
                    "meta": {
                        "requestId": "req-city-country-mismatch",
                        "generatedAtUtc": "2026-02-26T11:43:40.011939+00:00",
                        "backendConsumer": "hiap-meed",
                        "upstreamProvider": "city_catalyst_frontend",
                        "apiContext": {
                            "endpoint": "POST /v1/prioritize",
                            "locodes": ["CL-SCL"],
                        },
                        "totalRecords": 1,
                    },
                    "requestData": {
                        "requestedLanguages": ["en"],
                        "cityDataList": [
                            {
                                "locode": "CL-SCL",
                                "countryCode": "CL",
                                "cityStrategicPreferenceSectors": [],
                                "cityStrategicPreferenceCoBenefitKeys": [],
                                "cityEmissionsData": {
                                    "inventoryYear": None,
                                    "gpcData": {},
                                },
                            }
                        ],
                    },
                },
            )

        assert response.status_code == 502
        assert "country_code" in response.json()["detail"]["error"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.integration
def test_prioritize_skips_explanations_when_flag_false(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Request flag=false must skip explanation service invocation."""
    city = CityData(
        city_name="Santiago",
        locode="CL-SCL",
        region_name="Metropolitana",
        region_code="13",
        country_code="CL",
        city_context=[],
    )
    actions = [Action(action_id="A_1", action_name="Action one")]
    mock_city_client = MockCityDataApiClient(city=city)
    mock_action_client = MockActionPathwaysDataApiClient(actions=actions)
    mock_legal_client = MockLegalDataApiClient(assessments_by_action_id={})
    mock_policy_client = MockActionPolicyScoresDataApiClient(action_policy_scores_by_action_id={})
    mock_explanation_service = MockExplanationService(
        should_raise=True
    )

    app.dependency_overrides[get_city_data_api_client] = lambda: mock_city_client
    app.dependency_overrides[get_action_pathways_data_api_client] = lambda: mock_action_client
    app.dependency_overrides[get_legal_data_api_client] = lambda: mock_legal_client
    app.dependency_overrides[get_action_policy_scores_data_api_client] = (
        lambda: mock_policy_client
    )
    monkeypatch.setattr(
        prioritizer_orchestrator, "generate_explanations", mock_explanation_service
    )
    try:
        with TestClient(app) as test_client:
            response = test_client.post(
                "/v1/prioritize",
                json={
                    "meta": {
                        "requestId": "req-explanations-skipped",
                        "generatedAtUtc": "2026-02-26T11:43:40.011939+00:00",
                        "backendConsumer": "hiap-meed",
                        "upstreamProvider": "city_catalyst_frontend",
                        "apiContext": {
                            "endpoint": "POST /prioritizer/v1/start_prioritization",
                            "locodes": ["CL-SCL"],
                        },
                        "totalRecords": 1,
                    },
                    "requestData": {
                        "requestedLanguages": ["en"],
                        "createExplanations": False,
                        "cityDataList": [
                            {
                                "locode": "CL-SCL",
                                "countryCode": "CL",
                                "populationSize": 1000,
                                "cityStrategicPreferenceSectors": [],
                                "cityStrategicPreferenceCoBenefitKeys": [],
                                "cityEmissionsData": {"inventoryYear": None, "gpcData": {}},
                            }
                        ],
                    },
                },
            )

        assert response.status_code == 200
        result = response.json()["results"][0]
        assert result["ranked_actions"][0]["explanations"] == {}
    finally:
        app.dependency_overrides.clear()


@pytest.mark.integration
def test_prioritize_generates_explanations_for_returned_top_n_only(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Explanation service receives only top-N scored actions from orchestrator."""
    city = CityData(
        city_name="Santiago",
        locode="CL-SCL",
        region_name="Metropolitana",
        region_code="13",
        country_code="CL",
        city_context=[],
    )
    actions = [
        Action(action_id="A_top", action_name="Top action"),
        Action(action_id="A_second", action_name="Second action"),
    ]
    mock_city_client = MockCityDataApiClient(city=city)
    mock_action_client = MockActionPathwaysDataApiClient(actions=actions)
    mock_legal_client = MockLegalDataApiClient(assessments_by_action_id={})
    mock_policy_client = MockActionPolicyScoresDataApiClient(action_policy_scores_by_action_id={})
    mock_explanation_service = MockExplanationService(
        explanations_by_action_id={"A_top": "Top action explanation"}
    )

    app.dependency_overrides[get_city_data_api_client] = lambda: mock_city_client
    app.dependency_overrides[get_action_pathways_data_api_client] = lambda: mock_action_client
    app.dependency_overrides[get_legal_data_api_client] = lambda: mock_legal_client
    app.dependency_overrides[get_action_policy_scores_data_api_client] = (
        lambda: mock_policy_client
    )
    monkeypatch.setattr(
        prioritizer_orchestrator, "generate_explanations", mock_explanation_service
    )
    try:
        with TestClient(app) as test_client:
            response = test_client.post(
                "/v1/prioritize",
                json={
                    "meta": {
                        "requestId": "req-topn-explanations",
                        "generatedAtUtc": "2026-02-26T11:43:40.011939+00:00",
                        "backendConsumer": "hiap-meed",
                        "upstreamProvider": "city_catalyst_frontend",
                        "apiContext": {
                            "endpoint": "POST /prioritizer/v1/start_prioritization",
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
                                "populationSize": 1000,
                                "cityStrategicPreferenceSectors": [],
                                "cityStrategicPreferenceCoBenefitKeys": [],
                                "cityEmissionsData": {"inventoryYear": None, "gpcData": {}},
                            }
                        ],
                    },
                },
            )

        assert response.status_code == 200
        result = response.json()["results"][0]
        assert result["ranked_action_ids"] == ["A_second"]
        assert mock_explanation_service.seen_action_ids == ["A_second"]
        assert result["ranked_actions"][0]["explanations"] == {}
    finally:
        app.dependency_overrides.clear()


@pytest.mark.integration
def test_prioritize_fails_open_when_explanation_generation_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """LLM failures should not break ranking response semantics."""
    city = CityData(
        city_name="Santiago",
        locode="CL-SCL",
        region_name="Metropolitana",
        region_code="13",
        country_code="CL",
        city_context=[],
    )
    actions = [Action(action_id="A_1", action_name="Action one")]
    mock_city_client = MockCityDataApiClient(city=city)
    mock_action_client = MockActionPathwaysDataApiClient(actions=actions)
    mock_legal_client = MockLegalDataApiClient(assessments_by_action_id={})
    mock_policy_client = MockActionPolicyScoresDataApiClient(action_policy_scores_by_action_id={})
    mock_explanation_service = MockExplanationService(should_raise=True)

    app.dependency_overrides[get_city_data_api_client] = lambda: mock_city_client
    app.dependency_overrides[get_action_pathways_data_api_client] = lambda: mock_action_client
    app.dependency_overrides[get_legal_data_api_client] = lambda: mock_legal_client
    app.dependency_overrides[get_action_policy_scores_data_api_client] = (
        lambda: mock_policy_client
    )
    monkeypatch.setattr(
        prioritizer_orchestrator, "generate_explanations", mock_explanation_service
    )
    try:
        with TestClient(app) as test_client:
            response = test_client.post(
                "/v1/prioritize",
                json={
                    "meta": {
                        "requestId": "req-explanation-failure",
                        "generatedAtUtc": "2026-02-26T11:43:40.011939+00:00",
                        "backendConsumer": "hiap-meed",
                        "upstreamProvider": "city_catalyst_frontend",
                        "apiContext": {
                            "endpoint": "POST /prioritizer/v1/start_prioritization",
                            "locodes": ["CL-SCL"],
                        },
                        "totalRecords": 1,
                    },
                    "requestData": {
                        "requestedLanguages": ["en"],
                        "createExplanations": True,
                        "cityDataList": [
                            {
                                "locode": "CL-SCL",
                                "countryCode": "CL",
                                "populationSize": 1000,
                                "cityStrategicPreferenceSectors": [],
                                "cityStrategicPreferenceCoBenefitKeys": [],
                                "cityEmissionsData": {"inventoryYear": None, "gpcData": {}},
                            }
                        ],
                    },
                },
            )

        assert response.status_code == 200
        result = response.json()["results"][0]
        assert result["ranked_action_ids"] == ["A_1"]
        assert result["ranked_actions"][0]["explanations"] == {}
    finally:
        app.dependency_overrides.clear()


@pytest.mark.integration
def test_prioritize_logs_non_zero_explanation_elapsed_time(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Explanation completion logs should report measured elapsed time."""
    city = CityData(
        city_name="Santiago",
        locode="CL-SCL",
        region_name="Metropolitana",
        region_code="13",
        country_code="CL",
        city_context=[],
    )
    actions = [Action(action_id="A_1", action_name="Action one")]
    mock_city_client = MockCityDataApiClient(city=city)
    mock_action_client = MockActionPathwaysDataApiClient(actions=actions)
    mock_legal_client = MockLegalDataApiClient(assessments_by_action_id={})
    mock_policy_client = MockActionPolicyScoresDataApiClient(action_policy_scores_by_action_id={})
    logged_completion_elapsed_seconds: list[float] = []

    def delayed_explanation_service(
        *,
        locode: str,
        scored_actions: list[object],
        city_preference_sectors: list[str],
        city_preference_co_benefit_keys: list[str],
    ) -> tuple[dict[str, str], dict[str, object]]:
        """Return one explanation after a small delay."""
        del (
            locode,
            city_preference_sectors,
            city_preference_co_benefit_keys,
        )
        time.sleep(0.01)
        return {"A_1": "Delayed explanation"}, {
            "status": "completed",
            "provider": "mock",
            "llm_input": {"curated_actions_count": len(scored_actions)},
            "llm_output": {"explanations_by_action_id": {"A_1": "Delayed explanation"}},
        }

    def capture_info(message: str, *args: object, **kwargs: object) -> None:
        """Capture the elapsed time logged for explanation completion."""
        del kwargs
        if message.startswith("Explanation generation completed"):
            logged_completion_elapsed_seconds.append(float(args[3]))

    app.dependency_overrides[get_city_data_api_client] = lambda: mock_city_client
    app.dependency_overrides[get_action_pathways_data_api_client] = lambda: mock_action_client
    app.dependency_overrides[get_legal_data_api_client] = lambda: mock_legal_client
    app.dependency_overrides[get_action_policy_scores_data_api_client] = (
        lambda: mock_policy_client
    )
    monkeypatch.setattr(
        prioritizer_orchestrator, "generate_explanations", delayed_explanation_service
    )
    monkeypatch.setattr(prioritizer_orchestrator.logger, "info", capture_info)
    try:
        with TestClient(app) as test_client:
            response = test_client.post(
                "/v1/prioritize",
                json={
                    "meta": {
                        "requestId": "req-explanation-timing",
                        "generatedAtUtc": "2026-02-26T11:43:40.011939+00:00",
                        "backendConsumer": "hiap-meed",
                        "upstreamProvider": "city_catalyst_frontend",
                        "apiContext": {
                            "endpoint": "POST /prioritizer/v1/start_prioritization",
                            "locodes": ["CL-SCL"],
                        },
                        "totalRecords": 1,
                    },
                    "requestData": {
                        "requestedLanguages": ["en"],
                        "createExplanations": True,
                        "cityDataList": [
                            {
                                "locode": "CL-SCL",
                                "countryCode": "CL",
                                "populationSize": 1000,
                                "cityStrategicPreferenceSectors": [],
                                "cityStrategicPreferenceCoBenefitKeys": [],
                                "cityEmissionsData": {"inventoryYear": None, "gpcData": {}},
                            }
                        ],
                    },
                },
            )

        assert response.status_code == 200
        assert logged_completion_elapsed_seconds
        assert logged_completion_elapsed_seconds[0] > 0.0
        result = response.json()["results"][0]
        assert result["ranked_actions"][0]["explanations"] == {
            "en": "Delayed explanation"
        }
    finally:
        app.dependency_overrides.clear()


@pytest.mark.integration
def test_prioritize_returns_canonical_english_and_requested_translations(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Prioritization should always return English plus requested translated explanations."""
    city = CityData(
        city_name="Santiago",
        locode="CL-SCL",
        region_name="Metropolitana",
        region_code="13",
        country_code="CL",
        city_context=[],
    )
    actions = [Action(action_id="A_1", action_name="Action one")]
    mock_city_client = MockCityDataApiClient(city=city)
    mock_action_client = MockActionPathwaysDataApiClient(actions=actions)
    mock_legal_client = MockLegalDataApiClient(assessments_by_action_id={})
    mock_policy_client = MockActionPolicyScoresDataApiClient(action_policy_scores_by_action_id={})
    mock_explanation_service = MockExplanationService(
        explanations_by_action_id={"A_1": "English explanation"}
    )
    mock_translation_service = MockTranslationService(
        translations_by_action_id={"A_1": {"es": "Explicacion de prueba"}}
    )

    app.dependency_overrides[get_city_data_api_client] = lambda: mock_city_client
    app.dependency_overrides[get_action_pathways_data_api_client] = lambda: mock_action_client
    app.dependency_overrides[get_legal_data_api_client] = lambda: mock_legal_client
    app.dependency_overrides[get_action_policy_scores_data_api_client] = (
        lambda: mock_policy_client
    )
    monkeypatch.setattr(
        prioritizer_orchestrator,
        "generate_explanations",
        mock_explanation_service,
    )
    monkeypatch.setattr(
        prioritizer_orchestrator,
        "translate_explanations",
        mock_translation_service,
    )
    try:
        with TestClient(app) as test_client:
            response = test_client.post(
                "/v1/prioritize",
                json={
                    "meta": {
                        "requestId": "req-explanation-language",
                        "generatedAtUtc": "2026-02-26T11:43:40.011939+00:00",
                        "backendConsumer": "hiap-meed",
                        "upstreamProvider": "city_catalyst_frontend",
                        "apiContext": {
                            "endpoint": "POST /prioritizer/v1/start_prioritization",
                            "locodes": ["CL-SCL"],
                        },
                        "totalRecords": 1,
                    },
                    "requestData": {
                        "requestedLanguages": ["es", "en"],
                        "createExplanations": True,
                        "cityDataList": [
                            {
                                "locode": "CL-SCL",
                                "countryCode": "CL",
                                "populationSize": 1000,
                                "cityStrategicPreferenceSectors": [],
                                "cityStrategicPreferenceCoBenefitKeys": [],
                                "cityEmissionsData": {"inventoryYear": None, "gpcData": {}},
                            }
                        ],
                    },
                },
            )

        assert response.status_code == 200
        result = response.json()["results"][0]
        assert mock_explanation_service.seen_action_ids == ["A_1"]
        assert mock_translation_service.seen_target_languages == ["es"]
        assert result["ranked_actions"][0]["explanations"] == {
            "en": "English explanation",
            "es": "Explicacion de prueba",
        }
        assert result["metadata"]["explanations"]["requested_languages"] == ["es", "en"]
        assert result["metadata"]["explanations"]["canonical_language"] == "en"
        assert result["metadata"]["explanations"]["generated_languages"] == ["en", "es"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.integration
def test_prioritize_reports_only_successfully_generated_languages(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Metadata should reflect only explanation languages present in the response."""
    city = CityData(
        city_name="Santiago",
        locode="CL-SCL",
        region_name="Metropolitana",
        region_code="13",
        country_code="CL",
        city_context=[],
    )
    actions = [Action(action_id="A_1", action_name="Action one")]
    mock_city_client = MockCityDataApiClient(city=city)
    mock_action_client = MockActionPathwaysDataApiClient(actions=actions)
    mock_legal_client = MockLegalDataApiClient(assessments_by_action_id={})
    mock_policy_client = MockActionPolicyScoresDataApiClient(action_policy_scores_by_action_id={})
    mock_explanation_service = MockExplanationService(
        explanations_by_action_id={"A_1": "English explanation"}
    )
    mock_translation_service = MockTranslationService(should_raise=True)

    app.dependency_overrides[get_city_data_api_client] = lambda: mock_city_client
    app.dependency_overrides[get_action_pathways_data_api_client] = lambda: mock_action_client
    app.dependency_overrides[get_legal_data_api_client] = lambda: mock_legal_client
    app.dependency_overrides[get_action_policy_scores_data_api_client] = (
        lambda: mock_policy_client
    )
    monkeypatch.setattr(
        prioritizer_orchestrator,
        "generate_explanations",
        mock_explanation_service,
    )
    monkeypatch.setattr(
        prioritizer_orchestrator,
        "translate_explanations",
        mock_translation_service,
    )
    try:
        with TestClient(app) as test_client:
            response = test_client.post(
                "/v1/prioritize",
                json={
                    "meta": {
                        "requestId": "req-translation-failure-languages",
                        "generatedAtUtc": "2026-02-26T11:43:40.011939+00:00",
                        "backendConsumer": "hiap-meed",
                        "upstreamProvider": "city_catalyst_frontend",
                        "apiContext": {
                            "endpoint": "POST /prioritizer/v1/start_prioritization",
                            "locodes": ["CL-SCL"],
                        },
                        "totalRecords": 1,
                    },
                    "requestData": {
                        "requestedLanguages": ["es", "en"],
                        "createExplanations": True,
                        "cityDataList": [
                            {
                                "locode": "CL-SCL",
                                "countryCode": "CL",
                                "populationSize": 1000,
                                "cityStrategicPreferenceSectors": [],
                                "cityStrategicPreferenceCoBenefitKeys": [],
                                "cityEmissionsData": {"inventoryYear": None, "gpcData": {}},
                            }
                        ],
                    },
                },
            )

        assert response.status_code == 200
        result = response.json()["results"][0]
        assert mock_explanation_service.seen_action_ids == ["A_1"]
        assert result["ranked_actions"][0]["explanations"] == {
            "en": "English explanation"
        }
        assert result["metadata"]["explanations"]["requested_languages"] == ["es", "en"]
        assert result["metadata"]["explanations"]["generated_languages"] == ["en"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.integration
def test_translate_endpoint_returns_requested_translations_only(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Translation endpoint should return only the requested non-English targets."""
    mock_translation_service = MockTranslationService(
        translations_by_action_id={"A_1": {"pt": "Traducao de teste"}}
    )
    monkeypatch.setattr(
        "app.modules.prioritizer.api.translate_explanations",
        mock_translation_service,
    )

    with TestClient(app) as test_client:
        response = test_client.post(
            "/v1/explanations/translate",
            json={
                "meta": {
                    "requestId": "req-translate-endpoint",
                    "generatedAtUtc": "2026-02-26T11:43:40.011939+00:00",
                    "backendConsumer": "hiap-meed",
                    "upstreamProvider": "city_catalyst_frontend",
                    "apiContext": {
                        "endpoint": "POST /v1/explanations/translate",
                        "locodes": [],
                    },
                    "totalRecords": 1,
                },
                "requestData": {
                    "sourceLanguage": "en",
                    "targetLanguages": ["pt"],
                    "rankedActions": [
                        {
                            "actionId": "A_1",
                            "canonicalExplanation": "English explanation",
                        }
                    ],
                },
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body["warnings"] == []
    assert body["translations"] == [
        {"actionId": "A_1", "explanations": {"pt": "Traducao de teste"}}
    ]


@pytest.mark.integration
def test_translate_endpoint_warns_when_source_text_is_likely_not_english(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Translation endpoint should still return translations when source text looks non-English."""
    mock_translation_service = MockTranslationService(
        translations_by_action_id={"A_1": {"pt": "Traducao de teste"}},
        warnings=[
            "One or more canonical explanations labeled as English appeared non-English or mixed-language. Translations were still returned."
        ],
    )
    monkeypatch.setattr(
        "app.modules.prioritizer.api.translate_explanations",
        mock_translation_service,
    )

    with TestClient(app) as test_client:
        response = test_client.post(
            "/v1/explanations/translate",
            json={
                "meta": {
                    "requestId": "req-translate-warning",
                    "generatedAtUtc": "2026-02-26T11:43:40.011939+00:00",
                    "backendConsumer": "hiap-meed",
                    "upstreamProvider": "city_catalyst_frontend",
                    "apiContext": {
                        "endpoint": "POST /v1/explanations/translate",
                        "locodes": [],
                    },
                    "totalRecords": 1,
                },
                "requestData": {
                    "sourceLanguage": "en",
                    "targetLanguages": ["pt"],
                    "rankedActions": [
                        {
                            "actionId": "A_1",
                            "canonicalExplanation": "Explicacion de prueba",
                        }
                    ],
                },
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert len(body["warnings"]) == 1
    assert body["translations"] == [
        {"actionId": "A_1", "explanations": {"pt": "Traducao de teste"}}
    ]


@pytest.mark.integration
def test_translate_endpoint_rejects_non_english_source_language() -> None:
    """Translation endpoint should reject any source-language contract other than English."""
    with TestClient(app) as test_client:
        response = test_client.post(
            "/v1/explanations/translate",
            json={
                "meta": {
                    "requestId": "req-translate-invalid-source",
                    "generatedAtUtc": "2026-02-26T11:43:40.011939+00:00",
                    "backendConsumer": "hiap-meed",
                    "upstreamProvider": "city_catalyst_frontend",
                    "apiContext": {
                        "endpoint": "POST /v1/explanations/translate",
                        "locodes": [],
                    },
                    "totalRecords": 1,
                },
                "requestData": {
                    "sourceLanguage": "es",
                    "targetLanguages": ["pt"],
                    "rankedActions": [
                        {
                            "actionId": "A_1",
                            "canonicalExplanation": "English explanation",
                        }
                    ],
                },
            },
        )

    assert response.status_code == 422


@pytest.mark.integration
def test_translate_endpoint_rejects_duplicate_action_ids() -> None:
    """Translation endpoint should reject duplicate action IDs instead of collapsing rows silently."""
    with TestClient(app) as test_client:
        response = test_client.post(
            "/v1/explanations/translate",
            json={
                "meta": {
                    "requestId": "req-translate-duplicate-action-id",
                    "generatedAtUtc": "2026-02-26T11:43:40.011939+00:00",
                    "backendConsumer": "hiap-meed",
                    "upstreamProvider": "city_catalyst_frontend",
                    "apiContext": {
                        "endpoint": "POST /v1/explanations/translate",
                        "locodes": [],
                    },
                    "totalRecords": 1,
                },
                "requestData": {
                    "sourceLanguage": "en",
                    "targetLanguages": ["pt"],
                    "rankedActions": [
                        {
                            "actionId": "A_1",
                            "canonicalExplanation": "First canonical explanation",
                        },
                        {
                            "actionId": "A_1",
                            "canonicalExplanation": "Second canonical explanation",
                        },
                    ],
                },
            },
        )

    assert response.status_code == 422



