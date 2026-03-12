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
)
from app.modules.prioritizer.internal_models import Action, CityData
from app.services.data_clients import ActionDataApiClient, CityDataApiClient


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

    app.dependency_overrides[get_city_data_api_client] = lambda: mock_city_client
    app.dependency_overrides[get_action_data_api_client] = lambda: mock_action_client
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
    finally:
        app.dependency_overrides.clear()
