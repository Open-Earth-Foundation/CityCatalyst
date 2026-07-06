"""Dedicated end-to-end prioritize test using checked-in mock API payloads."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.modules.prioritizer.api import (
    get_action_financial_feasibility_scores_data_api_client,
    get_action_pathways_data_api_client,
    get_city_data_api_client,
    get_legal_data_api_client,
    get_action_policy_scores_data_api_client,
    get_action_mitigation_feasibility_scores_data_api_client,
)
from app.services.data_clients import (
    MockActionFinancialFeasibilityScoresDataApiClient,
    MockActionPathwaysDataApiClient,
    MockActionMitigationFeasibilityScoresDataApiClient,
    MockCityDataApiClient,
    MockLegalDataApiClient,
    MockActionPolicyScoresDataApiClient,
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
    monkeypatch.setenv("LOCAL_ARTIFACTS_ENABLED", "true")

    mock_data_dir = _mock_data_dir()
    request_payload = json.loads(
        (mock_data_dir / "prioritizer_request_mock.json").read_text(encoding="utf-8")
    )
    request_payload["requestData"]["createExplanations"] = False

    mock_city_client = MockCityDataApiClient(mock_file_path=mock_data_dir / "city_api_mock.json")
    mock_action_client = MockActionPathwaysDataApiClient(
        mock_file_path=mock_data_dir / "action_pathways_api_mock.json"
    )
    mock_legal_client = MockLegalDataApiClient(
        mock_file_path=mock_data_dir / "actions_legal_api_mock.json"
    )
    mock_policy_client = MockActionPolicyScoresDataApiClient(
        mock_file_path=mock_data_dir / "action_policy_scores_api_mock.json"
    )
    mock_feasibility_client = MockActionMitigationFeasibilityScoresDataApiClient(
        mock_file_path=mock_data_dir / "action_mitigation_feasibility_scores_api_mock.json"
    )
    mock_financial_feasibility_client = MockActionFinancialFeasibilityScoresDataApiClient(
        mock_file_path=mock_data_dir / "action_financial_feasibility_scores_api_mock.json"
    )

    app.dependency_overrides[get_city_data_api_client] = lambda: mock_city_client
    app.dependency_overrides[get_action_pathways_data_api_client] = lambda: mock_action_client
    app.dependency_overrides[get_legal_data_api_client] = lambda: mock_legal_client
    app.dependency_overrides[get_action_policy_scores_data_api_client] = (
        lambda: mock_policy_client
    )
    app.dependency_overrides[get_action_mitigation_feasibility_scores_data_api_client] = (
        lambda: mock_feasibility_client
    )
    app.dependency_overrides[get_action_financial_feasibility_scores_data_api_client] = (
        lambda: mock_financial_feasibility_client
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
        assert metadata["counts"]["total_actions"] == 102
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
        alignment_summary = ranked_actions[0]["evidence_summary"]["alignment"]
        assert set(alignment_summary.keys()) == {
            "alignment_score",
            "policy_component_score",
            "sector_component_score",
            "co_benefit_component_score",
            "timeframe_component_score",
        }
        feasibility_summary = ranked_actions[0]["evidence_summary"]["feasibility"]
        assert set(feasibility_summary.keys()) == {
            "feasibility_score",
            "legal",
            "mitigation_feasibility",
            "financial_feasibility",
        }
        assert isinstance(
            feasibility_summary["financial_feasibility"]["route"],
            str,
        )

        blocked_evidence = metadata["hard_filter_evidence_by_action_id"]["c40_0013"]
        missing_evidence_rows = [
            row
            for row in metadata["hard_filter_evidence_by_action_id"].values()
            if row.get("legal_assessment_present") is False
        ]
        assert blocked_evidence["discard_reason"] == "legal_verdict_blocked"
        assert blocked_evidence["legal_verdict_category"] == "blocked"
        assert missing_evidence_rows

        # Verify artifact naming and full-response persistence.
        request_runs = sorted((artifact_log_dir / "requests" / "prioritization").glob("*"))
        assert len(request_runs) == 1
        run_dir = request_runs[0]

        manifest_payload = json.loads((run_dir / "manifest.json").read_text("utf-8"))
        assert manifest_payload["request_kind"] == "prioritization"
        generated_files = set(manifest_payload["generated_files"])

        feasibility_files = [
            file_name
            for file_name in generated_files
            if file_name.endswith("_feasibility.json")
        ]
        assert len(feasibility_files) == 1
        feasibility_step = json.loads(
            (run_dir / feasibility_files[0]).read_text("utf-8")
        )
        assert feasibility_step["payload"]["missing_legal_assessment_actions_count"] > 0
        assert feasibility_step["payload"]["neutral_legal_fallback_actions_count"] > 0
        assert set(feasibility_step["payload"]["missing_legal_assessment_action_ids"])
        assert set(feasibility_step["payload"]["neutral_legal_fallback_action_ids"])

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
        assert fetch_city_payload["source_metadata"]["mock_file_path"].endswith(
            "city_api_mock.json"
        )

        fetch_actions_files = [
            file_name for file_name in generated_files if file_name.endswith("_fetch_actions.json")
        ]
        assert len(fetch_actions_files) == 1
        fetch_actions_payload = json.loads(
            (run_dir / fetch_actions_files[0]).read_text("utf-8")
        )["payload"]
        assert fetch_actions_payload["source"] == "mock_action_pathways_api"
        assert fetch_actions_payload["total_fetched_actions"] >= fetch_actions_payload["total_actions"]
        assert fetch_actions_payload["supported_action_type"] == "mitigation"
        assert fetch_actions_payload["filtered_out_action_type_actions_count"] >= 0
        assert fetch_actions_payload["source_metadata"]["mock_file_path"].endswith(
            "action_pathways_api_mock.json"
        )

        fetch_legal_files = [
            file_name
            for file_name in generated_files
            if file_name.endswith("_fetch_legal_assessments.json")
        ]
        assert len(fetch_legal_files) == 1
        fetch_legal_payload = json.loads(
            (run_dir / fetch_legal_files[0]).read_text("utf-8")
        )["payload"]
        assert fetch_legal_payload["source"] == "mock_action_legal_assessments_api"
        assert fetch_legal_payload["source_metadata"]["requested_country_code"] == "CL"
        assert fetch_legal_payload["source_metadata"]["mock_file_path"].endswith(
            "actions_legal_api_mock.json"
        )

        fetch_policy_files = [
            file_name
            for file_name in generated_files
            if file_name.endswith("_fetch_action_policy_scores.json")
        ]
        assert len(fetch_policy_files) == 1
        fetch_policy_payload = json.loads(
            (run_dir / fetch_policy_files[0]).read_text("utf-8")
        )["payload"]
        assert fetch_policy_payload["source"] == "mock_action_policy_scores_api"
        assert fetch_policy_payload["source_metadata"]["requested_locode"] == "CL IQQ"
        assert fetch_policy_payload["source_metadata"]["mock_file_path"].endswith(
            "action_policy_scores_api_mock.json"
        )

        fetch_feasibility_files = [
            file_name
            for file_name in generated_files
            if file_name.endswith("_fetch_action_mitigation_feasibility_scores.json")
        ]
        assert len(fetch_feasibility_files) == 1
        fetch_feasibility_payload = json.loads(
            (run_dir / fetch_feasibility_files[0]).read_text("utf-8")
        )["payload"]
        assert (
            fetch_feasibility_payload["source"]
            == "mock_action_mitigation_feasibility_scores_api"
        )
        assert fetch_feasibility_payload["source_metadata"]["requested_locode"] == "CL IQQ"
        assert fetch_feasibility_payload["source_metadata"]["mock_file_path"].endswith(
            "action_mitigation_feasibility_scores_api_mock.json"
        )

        fetch_financial_feasibility_files = [
            file_name
            for file_name in generated_files
            if file_name.endswith("_fetch_action_financial_feasibility_scores.json")
        ]
        assert len(fetch_financial_feasibility_files) == 1
        fetch_financial_feasibility_payload = json.loads(
            (run_dir / fetch_financial_feasibility_files[0]).read_text("utf-8")
        )["payload"]
        assert (
            fetch_financial_feasibility_payload["source"]
            == "mock_action_financial_feasibility_scores_api"
        )
        assert (
            fetch_financial_feasibility_payload["source_metadata"]["requested_locode"]
            == "CL IQQ"
        )
        assert fetch_financial_feasibility_payload["source_metadata"][
            "mock_file_path"
        ].endswith("action_financial_feasibility_scores_api_mock.json")

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
    monkeypatch.setenv("LOCAL_ARTIFACTS_ENABLED", "true")

    mock_data_dir = _mock_data_dir()
    request_payload = json.loads(
        (mock_data_dir / "prioritizer_request_mock.json").read_text(encoding="utf-8")
    )
    request_payload["requestData"]["createExplanations"] = False

    mock_city_client = MockCityDataApiClient(mock_file_path=mock_data_dir / "city_api_mock.json")
    mock_action_client = MockActionPathwaysDataApiClient(
        mock_file_path=mock_data_dir / "action_pathways_api_mock.json"
    )
    mock_legal_client = MockLegalDataApiClient(
        mock_file_path=mock_data_dir / "actions_legal_api_mock.json"
    )
    mock_policy_client = MockActionPolicyScoresDataApiClient(
        mock_file_path=mock_data_dir / "action_policy_scores_api_mock.json"
    )
    mock_feasibility_client = MockActionMitigationFeasibilityScoresDataApiClient(
        mock_file_path=mock_data_dir / "action_mitigation_feasibility_scores_api_mock.json"
    )
    mock_financial_feasibility_client = MockActionFinancialFeasibilityScoresDataApiClient(
        mock_file_path=mock_data_dir / "action_financial_feasibility_scores_api_mock.json"
    )

    app.dependency_overrides[get_city_data_api_client] = lambda: mock_city_client
    app.dependency_overrides[get_action_pathways_data_api_client] = lambda: mock_action_client
    app.dependency_overrides[get_legal_data_api_client] = lambda: mock_legal_client
    app.dependency_overrides[get_action_policy_scores_data_api_client] = (
        lambda: mock_policy_client
    )
    app.dependency_overrides[get_action_mitigation_feasibility_scores_data_api_client] = (
        lambda: mock_feasibility_client
    )
    app.dependency_overrides[get_action_financial_feasibility_scores_data_api_client] = (
        lambda: mock_financial_feasibility_client
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

