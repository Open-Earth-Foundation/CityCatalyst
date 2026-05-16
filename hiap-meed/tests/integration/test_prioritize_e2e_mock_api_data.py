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
    request_payload["requestData"]["createExplanations"] = False

    mock_city_client = MockCityDataApiClient(mock_file_path=mock_data_dir / "city_api_mock.json")
    mock_action_client = MockActionDataApiClient(
        mock_file_path=mock_data_dir / "actions_api_mock.json"
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

        ranked_action_ids = result["ranked_action_ids"]
        ranked_actions = result["ranked_actions"]

        assert result["locode"] == "CL IQQ"
        assert metadata["weights"] == {"impact": 0.5, "alignment": 0.3, "feasibility": 0.2}
        assert metadata["counts"]["total_actions"] == 155
        assert metadata["counts"]["discarded_excluded"] == 1
        assert metadata["counts"]["discarded_legal"] > 0
        assert metadata["counts"]["valid_actions"] == (
            metadata["counts"]["total_actions"]
            - metadata["counts"]["discarded_excluded"]
            - metadata["counts"]["discarded_legal"]
        )
        assert metadata["counts"]["ranked_actions"] == 20
        assert len(ranked_actions) == 20
        discarded_legal_action_ids = set(
            metadata["hard_filter_evidence_by_action_id"].keys()
        )
        assert "c40_0013" in discarded_legal_action_ids
        assert "c40_0013" not in ranked_action_ids
        assert ranked_action_ids == [item["action_id"] for item in ranked_actions]
        assert ranked_actions[0]["rank"] == 1
        assert ranked_actions[0]["explanations"] == {} or isinstance(
            ranked_actions[0]["explanations"], dict
        )

        blocked_evidence = metadata["hard_filter_evidence_by_action_id"]["c40_0013"]
        missing_evidence = metadata["hard_filter_evidence_by_action_id"]["icare_0172"]
        assert blocked_evidence["discard_reason"] == "legal_hard_requirement_failed"
        assert blocked_evidence["legal_verdict_category"] == "blocked"
        assert missing_evidence["legal_assessment_present"] is False

        # Verify artifact naming and full-response persistence.
        request_runs = sorted((artifact_log_dir / "requests" / "prioritization").glob("*"))
        assert len(request_runs) == 1
        run_dir = request_runs[0]

        manifest_payload = json.loads((run_dir / "manifest.json").read_text("utf-8"))
        assert manifest_payload["request_kind"] == "prioritization"
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

        fetch_city_files = [
            file_name for file_name in generated_files if file_name.endswith("_fetch_city.json")
        ]
        assert len(fetch_city_files) == 1
        fetch_city_payload = json.loads(
            (run_dir / fetch_city_files[0]).read_text("utf-8")
        )["payload"]
        assert fetch_city_payload["city_name"] == "Iquique"
        assert fetch_city_payload["source"] == "mock_city_api"
        assert fetch_city_payload["source_metadata"]["requested_locode"] == "CL IQQ"

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


@pytest.mark.integration
def test_prioritize_e2e_stubbed_activity_mapping_matches_disabled_mode(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Stub-enabled activity mapping should preserve the same prioritization output."""
    artifact_log_dir = tmp_path / "logs"
    monkeypatch.setenv("LOG_DIR", str(artifact_log_dir))
    monkeypatch.setenv("ARTIFACT_LOG_JSONL", "true")

    mock_data_dir = _mock_data_dir()
    request_payload = json.loads(
        (mock_data_dir / "prioritizer_request_mock.json").read_text(encoding="utf-8")
    )
    request_payload["requestData"]["createExplanations"] = False

    mock_city_client = MockCityDataApiClient(mock_file_path=mock_data_dir / "city_api_mock.json")
    mock_action_client = MockActionDataApiClient(
        mock_file_path=mock_data_dir / "actions_api_mock.json"
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
            monkeypatch.setenv("ACTIVITY_DATA_LEVEL_MAPPING", "false")
            disabled_response = test_client.post("/v1/prioritize", json=request_payload)
            monkeypatch.setenv("ACTIVITY_DATA_LEVEL_MAPPING", "true")
            enabled_response = test_client.post("/v1/prioritize", json=request_payload)

        assert disabled_response.status_code == 200
        assert enabled_response.status_code == 200
        assert enabled_response.json()["results"][0]["ranked_action_ids"] == (
            disabled_response.json()["results"][0]["ranked_action_ids"]
        )
        assert enabled_response.json()["results"][0]["ranked_actions"] == (
            disabled_response.json()["results"][0]["ranked_actions"]
        )

        request_runs = sorted((artifact_log_dir / "requests" / "prioritization").glob("*"))
        assert len(request_runs) == 2
        enabled_internal_request_id = enabled_response.json()["results"][0]["metadata"][
            "internal_request_id"
        ]
        enabled_run_dir = next(
            run_dir
            for run_dir in request_runs
            if enabled_internal_request_id in run_dir.name
        )
        impact_detail_file = sorted(enabled_run_dir.glob("*_impact.json"))[-1]
        impact_payload = json.loads(impact_detail_file.read_text("utf-8"))["payload"]
        assert impact_payload["impact_matching"]["stub_invoked"] is True
        assert (
            impact_payload["impact_matching"]["activity_data_level_mapping_enabled"]
            is True
        )
    finally:
        app.dependency_overrides.clear()
