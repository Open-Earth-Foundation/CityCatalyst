"""Dedicated end-to-end prioritize test using checked-in mock API payloads."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.modules.prioritizer.api import (
    get_action_data_api_client,
    get_city_data_api_client,
    get_legal_data_api_client,
)
from app.modules.prioritizer.internal_models import CityData
from app.services.data_clients import (
    CityDataApiClient,
    MockActionDataApiClient,
    MockLegalDataApiClient,
)


def _mock_data_dir() -> Path:
    """Return the checked-in mock data directory path."""
    return Path(__file__).resolve().parents[2] / "data" / "mock"


@dataclass
class MockCityDataApiClient(CityDataApiClient):
    """File-backed city client loading the checked-in city mock payload."""

    mock_file_path: Path

    def get_city(self, locode: str) -> CityData:
        """Load one city and enforce that requested locode matches the mock record."""
        payload = json.loads(self.mock_file_path.read_text(encoding="utf-8"))
        city = CityData.model_validate(payload["city"])
        if locode != city.locode:
            raise ValueError(f"Unknown locode: {locode}")
        return city


@pytest.mark.integration
def test_prioritize_e2e_with_mock_api_payloads() -> None:
    """Prioritize endpoint returns expected hard-filtered ranking for mock payloads."""
    mock_data_dir = _mock_data_dir()
    request_payload = json.loads(
        (mock_data_dir / "prioritizer_request_mock.json").read_text(encoding="utf-8")
    )

    mock_city_client = MockCityDataApiClient(mock_file_path=mock_data_dir / "city_api_mock.json")
    mock_action_client = MockActionDataApiClient(
        mock_file_path=mock_data_dir / "actions_api_mock.json"
    )
    mock_legal_client = MockLegalDataApiClient(
        mock_file_path=mock_data_dir / "actions_legal_api_mock.json"
    )

    app.dependency_overrides[get_city_data_api_client] = lambda: mock_city_client
    app.dependency_overrides[get_action_data_api_client] = lambda: mock_action_client
    app.dependency_overrides[get_legal_data_api_client] = lambda: mock_legal_client
    try:
        with TestClient(app) as test_client:
            response = test_client.post("/v1/prioritize", json=request_payload)

        assert response.status_code == 200
        body = response.json()
        assert len(body["results"]) == 1
        result = body["results"][0]
        metadata = result["metadata"]

        expected_discarded_legal_ids = {"c40_0012", "c40_0034", "c40_0037", "c40_0029"}
        ranked_action_ids = result["ranked_action_ids"]

        assert result["locode"] == "CL IQQ"
        assert metadata["weights"] == {"impact": 0.5, "alignment": 0.3, "feasibility": 0.2}
        assert metadata["counts"]["total_actions"] == 155
        assert metadata["counts"]["discarded_excluded"] == 0
        assert metadata["counts"]["discarded_legal"] == len(expected_discarded_legal_ids)
        assert metadata["counts"]["valid_actions"] == 151
        assert metadata["counts"]["ranked_actions"] == 20
        assert not expected_discarded_legal_ids.intersection(ranked_action_ids)

        expected_ranked_ids = sorted(
            action.action_id
            for action in mock_action_client.list_actions()
            if action.action_id not in expected_discarded_legal_ids
        )[:20]
        assert ranked_action_ids == expected_ranked_ids

        blocked_evidence = metadata["hard_filter_evidence_by_action_id"]["c40_0012"]
        unknown_evidence = metadata["hard_filter_evidence_by_action_id"]["c40_0013"]
        assert blocked_evidence["discard_reason"] == "legal_hard_requirement_failed"
        assert unknown_evidence["hard_requirements_unknown_count"] == 1
    finally:
        app.dependency_overrides.clear()
