"""
Integration smoke tests for the `/v1/prioritize` endpoint.
"""

from dataclasses import dataclass
import time

import pytest
from fastapi.testclient import TestClient

from app.main import app
import app.modules.prioritizer.orchestrator as prioritizer_orchestrator
from app.modules.prioritizer.api import (
    get_action_data_api_client,
    get_city_data_api_client,
    get_legal_data_api_client,
    get_policy_signals_data_api_client,
)
from app.modules.prioritizer.internal_models import (
    Action,
    CityData,
    LegalRequirementRecord,
)


@dataclass
class MockCityDataApiClient:
    """In-memory city client for prioritization endpoint tests."""

    city: CityData

    def get_city(self, locode: str) -> CityData:
        if locode != self.city.locode:
            raise ValueError(f"Unknown locode: {locode}")
        return self.city


@dataclass
class MockActionDataApiClient:
    """In-memory action client for prioritization endpoint tests."""

    actions: list[Action]

    def list_actions(self) -> list[Action]:
        return list(self.actions)


@dataclass
class MockLegalDataApiClient:
    """In-memory legal client for hard filter integration tests."""

    requirements_by_action_id: dict[str, list[LegalRequirementRecord]]

    def get_action_legal_requirements(
        self, locode: str
    ) -> dict[str, list[LegalRequirementRecord]]:
        """Return legal requirements for the requested city test case."""
        del locode
        return dict(self.requirements_by_action_id)


@dataclass
class MockPolicySignalsDataApiClient:
    """In-memory policy signal client for alignment integration tests."""

    policy_signals_by_action_id: dict[str, object]

    def get_action_policy_signals(self, locode: str) -> dict[str, object]:
        """Return policy support signals for the requested city test case."""
        del locode
        return dict(self.policy_signals_by_action_id)


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
        city_preference_other_text: str | None,
        excluded_actions_free_text: str | None,
    ) -> tuple[dict[str, str], dict[str, object]]:
        """Return predefined explanations and capture which actions were requested."""
        del (
            locode,
            city_preference_sectors,
            city_preference_other_text,
            excluded_actions_free_text,
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
        comuna_name="Santiago",
        locode="CL-SCL",
        region_name="Metropolitana",
        comuna_code="13101",
        region_code="13",
        city_context=[],
    )
    actions = [Action(action_id="A_ok", action_name="Action")]
    mock_city_client = MockCityDataApiClient(city=city)
    mock_action_client = MockActionDataApiClient(actions=actions)
    mock_legal_client = MockLegalDataApiClient(requirements_by_action_id={})
    mock_policy_client = MockPolicySignalsDataApiClient(policy_signals_by_action_id={})

    app.dependency_overrides[get_city_data_api_client] = lambda: mock_city_client
    app.dependency_overrides[get_action_data_api_client] = lambda: mock_action_client
    app.dependency_overrides[get_legal_data_api_client] = lambda: mock_legal_client
    app.dependency_overrides[get_policy_signals_data_api_client] = (
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
                                "excludedActionsFreeText": None,
                                "weightsOverride": weights_override,
                                "cityStrategicPreferenceSectors": [],
                                "cityStrategicPreferenceOther": None,
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
def test_prioritize_smoke() -> None:
    """Frontend envelope request returns deterministic ranked action IDs."""
    city = CityData(
        comuna_name="Santiago",
        locode="CL-SCL",
        region_name="Metropolitana",
        comuna_code="13101",
        region_code="13",
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
                "gpc_reference_number": ["I.2.1"],
                "impact_relationship": "negative",
                "impact_text": "low",
            },
        ),
    ]
    mock_city_client = MockCityDataApiClient(city=city)
    mock_action_client = MockActionDataApiClient(actions=actions)
    mock_legal_client = MockLegalDataApiClient(requirements_by_action_id={})
    mock_policy_client = MockPolicySignalsDataApiClient(policy_signals_by_action_id={})

    app.dependency_overrides[get_city_data_api_client] = lambda: mock_city_client
    app.dependency_overrides[get_action_data_api_client] = lambda: mock_action_client
    app.dependency_overrides[get_legal_data_api_client] = lambda: mock_legal_client
    app.dependency_overrides[get_policy_signals_data_api_client] = (
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
                                "excludedActionsFreeText": "Do not include ... (stub)",
                                "cityStrategicPreferenceSectors": [],
                                "cityStrategicPreferenceOther": None,
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
        assert first_ranked_action["explanation"] is None
        assert "metadata" in result
        assert result["metadata"]["frontend_request_id"] == "1234567890"
        assert "timings" in result["metadata"]
        assert "counts" in result["metadata"]
        assert result["metadata"]["counts"]["discarded_excluded"] == 0
        assert result["metadata"]["counts"]["discarded_legal"] == 0
    finally:
        app.dependency_overrides.clear()


@pytest.mark.integration
def test_prioritize_discards_hard_legal_mismatch() -> None:
    """Actions failing hard legal requirements are removed before ranking."""
    city = CityData(
        comuna_name="Santiago",
        locode="CL-SCL",
        region_name="Metropolitana",
        comuna_code="13101",
        region_code="13",
        city_context=[],
    )
    actions = [
        Action(action_id="A_ok", action_name="Aligned action"),
        Action(action_id="A_blocked", action_name="Blocked action"),
    ]
    requirements_by_action_id = {
        "A_blocked": [
            LegalRequirementRecord(
                signal_code="MUNI_ENV_STANDARDS",
                signal_name="Municipal environmental standards",
                operator="equals",
                required_value="apply_standards",
                legal_signal_value="restricted",
                strength="mandatory",
                alignment_status="not_aligned",
                location_scope="National",
                location_name="Chile",
                evidence_ids=["ev_1"],
                evidence_count=1,
            )
        ]
    }
    mock_city_client = MockCityDataApiClient(city=city)
    mock_action_client = MockActionDataApiClient(actions=actions)
    mock_legal_client = MockLegalDataApiClient(
        requirements_by_action_id=requirements_by_action_id
    )
    mock_policy_client = MockPolicySignalsDataApiClient(policy_signals_by_action_id={})

    app.dependency_overrides[get_city_data_api_client] = lambda: mock_city_client
    app.dependency_overrides[get_action_data_api_client] = lambda: mock_action_client
    app.dependency_overrides[get_legal_data_api_client] = lambda: mock_legal_client
    app.dependency_overrides[get_policy_signals_data_api_client] = (
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
                                "excludedActionsFreeText": None,
                                "cityStrategicPreferenceSectors": [],
                                "cityStrategicPreferenceOther": None,
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
def test_prioritize_keeps_no_evidence_hard_legal_requirements() -> None:
    """No-evidence hard requirements keep actions but expose unknown requirement evidence."""
    city = CityData(
        comuna_name="Santiago",
        locode="CL-SCL",
        region_name="Metropolitana",
        comuna_code="13101",
        region_code="13",
        city_context=[],
    )
    actions = [Action(action_id="A_unknown", action_name="Unknown legal evidence action")]
    requirements_by_action_id = {
        "A_unknown": [
            LegalRequirementRecord(
                signal_code="PLANS_ALIGNMENT",
                signal_name="Plans alignment requirement",
                operator="equals",
                required_value="comply",
                legal_signal_value=None,
                strength="required",
                alignment_status="no_evidence",
                location_scope=None,
                location_name=None,
                evidence_ids=[],
                evidence_count=0,
            )
        ]
    }
    mock_city_client = MockCityDataApiClient(city=city)
    mock_action_client = MockActionDataApiClient(actions=actions)
    mock_legal_client = MockLegalDataApiClient(
        requirements_by_action_id=requirements_by_action_id
    )
    mock_policy_client = MockPolicySignalsDataApiClient(policy_signals_by_action_id={})

    app.dependency_overrides[get_city_data_api_client] = lambda: mock_city_client
    app.dependency_overrides[get_action_data_api_client] = lambda: mock_action_client
    app.dependency_overrides[get_legal_data_api_client] = lambda: mock_legal_client
    app.dependency_overrides[get_policy_signals_data_api_client] = (
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
                                "excludedActionsFreeText": None,
                                "cityStrategicPreferenceSectors": [],
                                "cityStrategicPreferenceOther": None,
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
        assert unknown_evidence["hard_requirements_unknown_count"] == 1
        assert len(unknown_evidence["unknown_requirements"]) == 1
    finally:
        app.dependency_overrides.clear()


@pytest.mark.integration
def test_prioritize_skips_explanations_when_flag_false(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Request flag=false must skip explanation service invocation."""
    city = CityData(
        comuna_name="Santiago",
        locode="CL-SCL",
        region_name="Metropolitana",
        comuna_code="13101",
        region_code="13",
        city_context=[],
    )
    actions = [Action(action_id="A_1", action_name="Action one")]
    mock_city_client = MockCityDataApiClient(city=city)
    mock_action_client = MockActionDataApiClient(actions=actions)
    mock_legal_client = MockLegalDataApiClient(requirements_by_action_id={})
    mock_policy_client = MockPolicySignalsDataApiClient(policy_signals_by_action_id={})
    mock_explanation_service = MockExplanationService(
        should_raise=True
    )

    app.dependency_overrides[get_city_data_api_client] = lambda: mock_city_client
    app.dependency_overrides[get_action_data_api_client] = lambda: mock_action_client
    app.dependency_overrides[get_legal_data_api_client] = lambda: mock_legal_client
    app.dependency_overrides[get_policy_signals_data_api_client] = (
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
                                "excludedActionsFreeText": None,
                                "cityStrategicPreferenceSectors": [],
                                "cityStrategicPreferenceOther": None,
                                "cityEmissionsData": {"inventoryYear": None, "gpcData": {}},
                            }
                        ],
                    },
                },
            )

        assert response.status_code == 200
        result = response.json()["results"][0]
        assert result["ranked_actions"][0]["explanation"] is None
    finally:
        app.dependency_overrides.clear()


@pytest.mark.integration
def test_prioritize_generates_explanations_for_returned_top_n_only(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Explanation service receives only top-N scored actions from orchestrator."""
    city = CityData(
        comuna_name="Santiago",
        locode="CL-SCL",
        region_name="Metropolitana",
        comuna_code="13101",
        region_code="13",
        city_context=[],
    )
    actions = [
        Action(action_id="A_top", action_name="Top action"),
        Action(action_id="A_second", action_name="Second action"),
    ]
    mock_city_client = MockCityDataApiClient(city=city)
    mock_action_client = MockActionDataApiClient(actions=actions)
    mock_legal_client = MockLegalDataApiClient(requirements_by_action_id={})
    mock_policy_client = MockPolicySignalsDataApiClient(policy_signals_by_action_id={})
    mock_explanation_service = MockExplanationService(
        explanations_by_action_id={"A_top": "Top action explanation"}
    )

    app.dependency_overrides[get_city_data_api_client] = lambda: mock_city_client
    app.dependency_overrides[get_action_data_api_client] = lambda: mock_action_client
    app.dependency_overrides[get_legal_data_api_client] = lambda: mock_legal_client
    app.dependency_overrides[get_policy_signals_data_api_client] = (
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
                                "excludedActionsFreeText": None,
                                "cityStrategicPreferenceSectors": [],
                                "cityStrategicPreferenceOther": None,
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
        assert result["ranked_actions"][0]["explanation"] is None
    finally:
        app.dependency_overrides.clear()


@pytest.mark.integration
def test_prioritize_fails_open_when_explanation_generation_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """LLM failures should not break ranking response semantics."""
    city = CityData(
        comuna_name="Santiago",
        locode="CL-SCL",
        region_name="Metropolitana",
        comuna_code="13101",
        region_code="13",
        city_context=[],
    )
    actions = [Action(action_id="A_1", action_name="Action one")]
    mock_city_client = MockCityDataApiClient(city=city)
    mock_action_client = MockActionDataApiClient(actions=actions)
    mock_legal_client = MockLegalDataApiClient(requirements_by_action_id={})
    mock_policy_client = MockPolicySignalsDataApiClient(policy_signals_by_action_id={})
    mock_explanation_service = MockExplanationService(should_raise=True)

    app.dependency_overrides[get_city_data_api_client] = lambda: mock_city_client
    app.dependency_overrides[get_action_data_api_client] = lambda: mock_action_client
    app.dependency_overrides[get_legal_data_api_client] = lambda: mock_legal_client
    app.dependency_overrides[get_policy_signals_data_api_client] = (
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
                                "excludedActionsFreeText": None,
                                "cityStrategicPreferenceSectors": [],
                                "cityStrategicPreferenceOther": None,
                                "cityEmissionsData": {"inventoryYear": None, "gpcData": {}},
                            }
                        ],
                    },
                },
            )

        assert response.status_code == 200
        result = response.json()["results"][0]
        assert result["ranked_action_ids"] == ["A_1"]
        assert result["ranked_actions"][0]["explanation"] is None
    finally:
        app.dependency_overrides.clear()


@pytest.mark.integration
def test_prioritize_logs_non_zero_explanation_elapsed_time(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Explanation completion logs should report measured elapsed time."""
    city = CityData(
        comuna_name="Santiago",
        locode="CL-SCL",
        region_name="Metropolitana",
        comuna_code="13101",
        region_code="13",
        city_context=[],
    )
    actions = [Action(action_id="A_1", action_name="Action one")]
    mock_city_client = MockCityDataApiClient(city=city)
    mock_action_client = MockActionDataApiClient(actions=actions)
    mock_legal_client = MockLegalDataApiClient(requirements_by_action_id={})
    mock_policy_client = MockPolicySignalsDataApiClient(policy_signals_by_action_id={})
    logged_completion_elapsed_seconds: list[float] = []

    def delayed_explanation_service(
        *,
        locode: str,
        scored_actions: list[object],
        city_preference_sectors: list[str],
        city_preference_other_text: str | None,
        excluded_actions_free_text: str | None,
    ) -> tuple[dict[str, str], dict[str, object]]:
        """Return one explanation after a small delay."""
        del (
            locode,
            city_preference_sectors,
            city_preference_other_text,
            excluded_actions_free_text,
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
    app.dependency_overrides[get_action_data_api_client] = lambda: mock_action_client
    app.dependency_overrides[get_legal_data_api_client] = lambda: mock_legal_client
    app.dependency_overrides[get_policy_signals_data_api_client] = (
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
                                "excludedActionsFreeText": None,
                                "cityStrategicPreferenceSectors": [],
                                "cityStrategicPreferenceOther": None,
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
        assert result["ranked_actions"][0]["explanation"] == "Delayed explanation"
    finally:
        app.dependency_overrides.clear()
