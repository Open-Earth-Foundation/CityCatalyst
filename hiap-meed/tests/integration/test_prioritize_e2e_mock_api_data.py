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
def test_prioritize_e2e_with_mock_api_payloads(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Prioritize endpoint returns expected hard-filtered ranking for mock payloads."""
    # Route request artifacts into an isolated test folder.
    artifact_log_dir = tmp_path / "logs"
    monkeypatch.setenv("LOG_DIR", str(artifact_log_dir))
    monkeypatch.setenv("ARTIFACT_LOG_JSONL", "true")

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
        assert metadata["frontend_request_id"] == "1234567890"

        expected_discarded_legal_ids = {"c40_0012", "c40_0034", "c40_0037", "c40_0029"}
        ranked_action_ids = result["ranked_action_ids"]
        ranked_actions = result["ranked_actions"]

        assert result["locode"] == "CL IQQ"
        assert metadata["weights"] == {"impact": 0.5, "alignment": 0.3, "feasibility": 0.2}
        assert metadata["counts"]["total_actions"] == 155
        assert metadata["counts"]["discarded_excluded"] == 0
        assert metadata["counts"]["discarded_legal"] == len(expected_discarded_legal_ids)
        assert metadata["counts"]["valid_actions"] == 151
        assert metadata["counts"]["ranked_actions"] == 20
        assert len(ranked_actions) == 20
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
        assert [item["action_id"] for item in ranked_actions] == expected_ranked_ids
        assert ranked_actions[0]["rank"] == 1
        assert ranked_actions[0]["explanation"] is None or isinstance(
            ranked_actions[0]["explanation"], str
        )

        blocked_evidence = metadata["hard_filter_evidence_by_action_id"]["c40_0012"]
        unknown_evidence = metadata["hard_filter_evidence_by_action_id"]["c40_0013"]
        assert blocked_evidence["discard_reason"] == "legal_hard_requirement_failed"
        assert unknown_evidence["hard_requirements_unknown_count"] == 1

        # Verify artifact naming and full-response persistence.
        request_runs = sorted((artifact_log_dir / "requests").glob("*"))
        assert len(request_runs) == 1
        run_dir = request_runs[0]

        manifest_payload = json.loads((run_dir / "manifest.json").read_text("utf-8"))
        generated_files = set(manifest_payload["generated_files"])
        response_summary_files = [
            file_name
            for file_name in generated_files
            if file_name.endswith("_response_summary.json")
        ]
        assert len(response_summary_files) == 1
        assert "response_full.json" in generated_files

        response_summary_payload = json.loads(
            (run_dir / response_summary_files[0]).read_text("utf-8")
        )
        assert response_summary_payload["event_type"] == "response_summary.completed"
        assert response_summary_payload["step_name"] == "response_summary"

        response_full_payload = json.loads(
            (run_dir / "response_full.json").read_text("utf-8")
        )
        assert "results" in response_full_payload
        assert len(response_full_payload["results"]) == 1
        assert response_full_payload["results"][0]["locode"] == "CL IQQ"
        assert (
            response_full_payload["results"][0]["ranked_action_ids"]
            == result["ranked_action_ids"]
        )
    finally:
        app.dependency_overrides.clear()
