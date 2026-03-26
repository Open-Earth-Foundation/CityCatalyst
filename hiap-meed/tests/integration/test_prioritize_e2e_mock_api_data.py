"""Dedicated end-to-end prioritize test using checked-in mock API payloads."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.modules.prioritizer.api import (
    get_action_data_api_client,
    get_city_data_api_client,
    get_legal_data_api_client,
    get_policy_signals_data_api_client,
)
from app.services.data_clients import (
    MockActionDataApiClient,
    MockCityDataApiClient,
    MockLegalDataApiClient,
    MockPolicySignalsDataApiClient,
)


def _mock_data_dir() -> Path:
    """Return the checked-in mock data directory path."""
    return Path(__file__).resolve().parents[2] / "data" / "mock"


@pytest.mark.integration
def test_prioritize_e2e_with_mock_api_payloads() -> None:
    """Prioritize endpoint returns expected hard-filtered ranking for mock payloads."""
    mock_data_dir = _mock_data_dir()
    request_payload = json.loads(
        (mock_data_dir / "prioritizer_request_mock.json").read_text(encoding="utf-8")
    )

    mock_city_client = MockCityDataApiClient(mock_file_path=mock_data_dir / "city_api_mock.json")
    mock_action_client = MockActionDataApiClient(
        mock_file_path=mock_data_dir / "actions_api_mock_v2.json"
    )
    mock_legal_client = MockLegalDataApiClient(
        mock_file_path=mock_data_dir / "actions_legal_api_mock.json"
    )
    mock_policy_client = MockPolicySignalsDataApiClient(
        mock_file_path=mock_data_dir / "actions_policy_signals_api_mock.json"
    )

    app.dependency_overrides[get_city_data_api_client] = lambda: mock_city_client
    app.dependency_overrides[get_action_data_api_client] = lambda: mock_action_client
    app.dependency_overrides[get_legal_data_api_client] = lambda: mock_legal_client
    app.dependency_overrides[get_policy_signals_data_api_client] = (
        lambda: mock_policy_client
    )
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

        expected_ranked_ids = [
            "icare_0025",
            "c40_0025",
            "icare_0016",
            "c40_0010",
            "c40_0015",
            "icare_0002",
            "icare_0028",
            "c40_0023",
            "icare_0139",
            "icare_0121",
            "ipcc_0105",
            "icare_0040",
            "icare_0156",
            "icare_0172",
            "icare_0176",
            "ipcc_0050",
            "icare_0072",
            "icare_0099",
            "c40_0018",
            "icare_0045",
        ]
        assert ranked_action_ids == expected_ranked_ids

        blocked_evidence = metadata["hard_filter_evidence_by_action_id"]["c40_0012"]
        unknown_evidence = metadata["hard_filter_evidence_by_action_id"]["c40_0013"]
        assert blocked_evidence["discard_reason"] == "legal_hard_requirement_failed"
        assert unknown_evidence["hard_requirements_unknown_count"] == 1
    finally:
        app.dependency_overrides.clear()
