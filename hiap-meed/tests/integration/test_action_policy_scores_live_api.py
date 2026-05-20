"""Live contract checks for the implemented upstream action policy scores API path."""

from __future__ import annotations

import pytest

from app.modules.prioritizer.models import ActionPolicyScoresApiResponse
from app.services.action_policy_scores_api import (
    ACTION_POLICY_SCORES_ENDPOINT_TEMPLATE,
    ActionPolicyScoresApiService,
)
from app.services.http_client import get_json_with_retries

EXPECTED_SCORE_KEYS = {
    "src_action_id",
    "policy_support_score",
    "policy_support_category",
    "best_relevance",
    "n_findings",
    "n_docs",
    "sum_strength",
    "policy_evidence",
}
EXPECTED_EVIDENCE_KEYS = {
    "evidence_rank",
    "signal_type",
    "signal_relation",
    "signal_strength",
    "document_name",
    "document_type",
    "doc_relevance",
    "explicitness",
    "page",
    "evidence_strength",
    "evidence_text",
}


def _assert_optional_score(value: object, field_name: str) -> None:
    """Assert one optional score stays within the normalized `0..1` range."""
    assert value is None or isinstance(value, (int, float)), field_name
    if value is not None:
        assert 0.0 <= float(value) <= 1.0, field_name


def _assert_live_evidence_shape(row: dict[str, object]) -> None:
    """Assert one live policy evidence row keeps the fields hiap-meed stores."""
    assert EXPECTED_EVIDENCE_KEYS.issubset(row.keys())
    assert isinstance(row["evidence_rank"], int)
    assert row["evidence_rank"] > 0
    assert row["signal_type"] is None or isinstance(row["signal_type"], str)
    assert row["signal_relation"] is None or isinstance(row["signal_relation"], str)
    assert row["signal_strength"] is None or isinstance(row["signal_strength"], str)
    assert row["document_name"] is None or isinstance(row["document_name"], str)
    assert row["document_type"] is None or isinstance(row["document_type"], str)
    assert row["doc_relevance"] is None or isinstance(row["doc_relevance"], str)
    assert row["explicitness"] is None or isinstance(row["explicitness"], str)
    assert row["page"] is None or isinstance(row["page"], int)
    _assert_optional_score(row["evidence_strength"], "evidence_strength")
    assert row["evidence_text"] is None or isinstance(row["evidence_text"], str)


def _assert_live_score_shape(row: dict[str, object]) -> None:
    """Assert one live score row keeps the fields that drive scoring/artifacts."""
    assert EXPECTED_SCORE_KEYS.issubset(row.keys())
    assert isinstance(row["src_action_id"], str)
    assert row["src_action_id"]
    _assert_optional_score(row["policy_support_score"], "policy_support_score")
    assert row["policy_support_category"] is None or isinstance(
        row["policy_support_category"], str
    )
    assert row["best_relevance"] is None or isinstance(row["best_relevance"], str)
    assert row["n_findings"] is None or isinstance(row["n_findings"], int)
    assert row["n_docs"] is None or isinstance(row["n_docs"], int)
    assert row["sum_strength"] is None or isinstance(row["sum_strength"], (int, float))

    evidence_rows = row["policy_evidence"]
    assert isinstance(evidence_rows, list)
    for evidence_row in evidence_rows:
        assert isinstance(evidence_row, dict)
        _assert_live_evidence_shape(evidence_row)


def _assert_spatial_document_coverage_shape(coverage: dict[str, object]) -> None:
    """Assert upstream spatial coverage metadata keeps the expected shape."""
    assert {"location_scopes_included", "finest_location_scope", "caveat"}.issubset(
        coverage.keys()
    )
    scopes = coverage["location_scopes_included"]
    assert isinstance(scopes, list)
    assert scopes
    for scope in scopes:
        assert isinstance(scope, str)
        assert scope
    assert coverage["finest_location_scope"] is None or isinstance(
        coverage["finest_location_scope"], str
    )
    assert coverage["caveat"] is None or isinstance(coverage["caveat"], str)


@pytest.mark.integration
@pytest.mark.external
def test_action_policy_scores_live_payload_matches_expected_contract() -> None:
    """The live upstream policy payload keeps the contract our service implements."""
    service = ActionPolicyScoresApiService()
    url = service._build_action_policy_scores_url("CL ARI")

    payload, status_code = get_json_with_retries(
        url=url,
        operation_name="action policy scores API call",
        headers={"accept": "application/json"},
    )

    assert status_code == 200
    assert {"meta", "scores"}.issubset(payload.keys())

    meta = payload["meta"]
    assert {
        "generated_at_utc",
        "api_context",
        "total_records",
        "total_evidence_items",
        "spatial_document_coverage",
    }.issubset(meta.keys())
    assert isinstance(meta["generated_at_utc"], str)
    assert meta["generated_at_utc"]
    assert isinstance(meta["total_records"], int)
    assert meta["total_records"] == len(payload["scores"])
    assert isinstance(meta["total_evidence_items"], int)
    assert meta["total_evidence_items"] >= 0
    assert meta["backend_consumer"] is None or isinstance(meta["backend_consumer"], str)
    assert meta["upstream_provider"] is None or isinstance(meta["upstream_provider"], str)
    assert meta["scoring_rubric_version"] is None or isinstance(
        meta["scoring_rubric_version"], str
    )

    api_context = meta["api_context"]
    assert {
        "endpoint",
        "locode",
        "city_name",
        "release_id",
        "top_evidence_limit",
        "src_action_id",
    }.issubset(api_context.keys())
    assert api_context["endpoint"] == ACTION_POLICY_SCORES_ENDPOINT_TEMPLATE
    assert api_context["locode"] == "CL ARI"
    assert api_context["city_name"] is None or isinstance(api_context["city_name"], str)
    assert api_context["release_id"] is None or isinstance(api_context["release_id"], str)
    assert api_context["top_evidence_limit"] is None or isinstance(
        api_context["top_evidence_limit"], int
    )
    assert api_context["src_action_id"] is None or isinstance(
        api_context["src_action_id"], str
    )

    coverage = meta["spatial_document_coverage"]
    assert isinstance(coverage, dict)
    _assert_spatial_document_coverage_shape(coverage)

    scores = payload["scores"]
    assert isinstance(scores, list)
    assert scores
    for score_row in scores:
        assert isinstance(score_row, dict)
        _assert_live_score_shape(score_row)

    validated = ActionPolicyScoresApiResponse.model_validate(payload)
    assert validated.scores


@pytest.mark.integration
@pytest.mark.external
def test_action_policy_scores_live_service_maps_current_upstream_payload() -> None:
    """The synchronous policy service maps the live upstream payload into records."""
    fetch_result = ActionPolicyScoresApiService().get_scores_by_action_id("CL ARI")
    scores = fetch_result.scores_by_action_id

    assert scores
    first_score = scores[sorted(scores.keys())[0]]
    assert first_score.action_id
    assert first_score.policy_support_score is None or (
        0.0 <= first_score.policy_support_score <= 1.0
    )
    assert isinstance(first_score.policy_evidence, list)
    assert first_score.source_metadata["requested_locode"] == "CL ARI"
    assert first_score.source_metadata["upstream_endpoint"] == (
        ACTION_POLICY_SCORES_ENDPOINT_TEMPLATE
    )
    assert first_score.source_metadata["http_status_code"] == 200
