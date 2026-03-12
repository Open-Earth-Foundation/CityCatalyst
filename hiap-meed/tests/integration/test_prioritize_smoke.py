"""
Integration smoke tests for the `/v1/prioritize` endpoint.
"""

from dataclasses import dataclass

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.modules.prioritizer.api import (
    get_action_data_api_client,
    get_city_data_api_client,
    get_legal_data_api_client,
)
from app.modules.prioritizer.internal_models import (
    Action,
    CityData,
    HardFilterLegalRequirement,
)
from app.services.data_clients import (
    ActionDataApiClient,
    CityDataApiClient,
    LegalDataApiClient,
)


@dataclass
class MockCityDataApiClient(CityDataApiClient):
    """In-memory city client for prioritization endpoint tests."""

    city: CityData

    def get_city(self, locode: str) -> CityData:
        if locode != self.city.locode:
            raise ValueError(f"Unknown locode: {locode}")
        return self.city


@dataclass
class MockActionDataApiClient(ActionDataApiClient):
    """In-memory action client for prioritization endpoint tests."""

    actions: list[Action]

    def list_actions(self) -> list[Action]:
        return list(self.actions)


@dataclass
class MockLegalDataApiClient(LegalDataApiClient):
    """In-memory legal client for hard filter integration tests."""

    requirements_by_action_id: dict[str, list[HardFilterLegalRequirement]]

    def get_action_legal_requirements(
        self, locode: str
    ) -> dict[str, list[HardFilterLegalRequirement]]:
        """Return legal requirements for the requested city test case."""
        del locode
        return dict(self.requirements_by_action_id)


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
            impacts=[
                {
                    "impact_type": "emissions",
                    "impact_relationship": "positive",
                    "gpc_reference_number": "{'I.1.1','I.1.2'}",
                }
            ],
        ),
        Action(
            action_id="c40_0020",
            action_name="Fleet expansion",
            impacts=[
                {
                    "impact_type": "emissions",
                    "impact_relationship": "negative",
                    "gpc_reference_number": "{'I.2.1'}",
                }
            ],
        ),
    ]
    mock_city_client = MockCityDataApiClient(city=city)
    mock_action_client = MockActionDataApiClient(actions=actions)
    mock_legal_client = MockLegalDataApiClient(requirements_by_action_id={})

    app.dependency_overrides[get_city_data_api_client] = lambda: mock_city_client
    app.dependency_overrides[get_action_data_api_client] = lambda: mock_action_client
    app.dependency_overrides[get_legal_data_api_client] = lambda: mock_legal_client
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
        assert "metadata" in result
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
            HardFilterLegalRequirement(
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

    app.dependency_overrides[get_city_data_api_client] = lambda: mock_city_client
    app.dependency_overrides[get_action_data_api_client] = lambda: mock_action_client
    app.dependency_overrides[get_legal_data_api_client] = lambda: mock_legal_client
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
            HardFilterLegalRequirement(
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

    app.dependency_overrides[get_city_data_api_client] = lambda: mock_city_client
    app.dependency_overrides[get_action_data_api_client] = lambda: mock_action_client
    app.dependency_overrides[get_legal_data_api_client] = lambda: mock_legal_client
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
