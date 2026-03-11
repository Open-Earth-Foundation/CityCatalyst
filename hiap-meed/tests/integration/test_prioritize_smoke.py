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
    """Excluded actions are removed and remaining actions are ranked."""
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
                    "locode": "CL-SCL",
                    "excluded_action_ids": ["c40_0020"],
                    "top_n": 5,
                },
            )
        assert response.status_code == 200
        body = response.json()

        assert body["ranked_action_ids"] == ["c40_0010"]
        assert "metadata" in body
        assert "timings" in body["metadata"]
        assert "counts" in body["metadata"]
        assert body["metadata"]["counts"]["discarded_excluded"] == 1
    finally:
        app.dependency_overrides.clear()


@pytest.mark.integration
def test_prioritize_rejects_non_unit_weight_sum() -> None:
    """Non-unit weight sums return 422 and do not get normalized."""
    city = CityData(
        comuna_name="Santiago",
        locode="CL-SCL",
        region_name="Metropolitana",
        comuna_code="13101",
        region_code="13",
        city_context=[],
    )
    actions = [Action(action_id="c40_0010", action_name="Retrofit buildings")]
    mock_city_client = MockCityDataApiClient(city=city)
    mock_action_client = MockActionDataApiClient(actions=actions)

    app.dependency_overrides[get_city_data_api_client] = lambda: mock_city_client
    app.dependency_overrides[get_action_data_api_client] = lambda: mock_action_client
    try:
        with TestClient(app) as test_client:
            response = test_client.post(
                "/v1/prioritize",
                json={
                    "locode": "CL-SCL",
                    "weights_override": {
                        "impact": 0.5,
                        "alignment": 0.3,
                        "feasibility": 0.3,
                    },
                },
            )
        assert response.status_code == 422
        detail = response.json()["detail"]
        assert "Weight sum must be 1.0" in detail["error"]
    finally:
        app.dependency_overrides.clear()
