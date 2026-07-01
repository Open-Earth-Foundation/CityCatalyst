"""Live contract checks for upstream financial feasibility scores."""

from __future__ import annotations

import pytest

from app.modules.prioritizer.models import (
    ActionFinancialFeasibilityScoresApiResponse,
)
from app.services.action_financial_feasibility_scores_api import (
    ACTION_FINANCIAL_FEASIBILITY_SCORES_ENDPOINT_TEMPLATE,
    ActionFinancialFeasibilityScoresApiService,
)
from app.services.http_client import get_json_with_retries

EXPECTED_ITEM_KEYS = {
    "action_id",
    "action_name",
    "sector",
    "financial_feasibility",
    "route",
    "reason",
    "inputs",
    "links",
}
EXPECTED_META_KEYS = {
    "generated_at_utc",
    "endpoint",
    "locode",
    "country_code",
    "caveat",
    "filters",
    "total_records",
}
EXPECTED_INPUT_KEYS = {"action", "city", "finance", "evidence"}
EXPECTED_LINK_KEYS = {"detail", "opportunities", "projects"}


def _assert_optional_score(value: object, field_name: str) -> None:
    """Assert one optional score stays within the normalized `0..1` range."""
    assert value is None or isinstance(value, (int, float)), field_name
    if value is not None:
        assert 0.0 <= float(value) <= 1.0, field_name


def _assert_optional_string(value: object, field_name: str) -> None:
    """Assert one optional text field stays string-shaped when present."""
    assert value is None or isinstance(value, str), field_name


def _assert_live_inputs_shape(inputs: dict[str, object]) -> None:
    """Assert the compact finance evidence inputs we preserve stay available."""
    assert EXPECTED_INPUT_KEYS.issubset(inputs.keys())
    assert isinstance(inputs["action"], dict)
    assert isinstance(inputs["city"], dict)
    assert isinstance(inputs["finance"], dict)
    assert isinstance(inputs["evidence"], dict)
    finance = inputs["finance"]
    evidence = inputs["evidence"]
    assert "fund_access" in finance
    _assert_optional_string(finance["fund_access"], "inputs.finance.fund_access")
    assert "n_reachable_opportunities" in finance
    assert finance["n_reachable_opportunities"] is None or isinstance(
        finance["n_reachable_opportunities"],
        int,
    )
    assert "n_existing_projects" in evidence
    assert evidence["n_existing_projects"] is None or isinstance(
        evidence["n_existing_projects"],
        int,
    )


def _assert_live_links_shape(links: dict[str, object]) -> None:
    """Assert follow-up links remain present without fetching them here."""
    assert EXPECTED_LINK_KEYS.issubset(links.keys())
    for link_name in EXPECTED_LINK_KEYS:
        assert isinstance(links[link_name], str), link_name
        assert links[link_name].startswith("/api/v1/"), link_name


@pytest.mark.integration
@pytest.mark.external
def test_action_financial_feasibility_scores_live_payload_matches_contract() -> None:
    """The live financial feasibility payload keeps the contract we implement."""
    service = ActionFinancialFeasibilityScoresApiService()
    url = service._build_action_financial_feasibility_scores_url("CL ARI", "CL")

    payload, status_code = get_json_with_retries(
        url=url,
        operation_name="action financial feasibility scores API call",
        headers={"accept": "application/json"},
    )

    assert status_code == 200
    assert {"meta", "data"}.issubset(payload.keys())
    meta = payload["meta"]
    assert EXPECTED_META_KEYS.issubset(meta.keys())
    assert isinstance(meta["generated_at_utc"], str)
    assert meta["generated_at_utc"]
    assert meta["endpoint"] == ACTION_FINANCIAL_FEASIBILITY_SCORES_ENDPOINT_TEMPLATE
    assert meta["locode"] == "CL ARI"
    assert meta["country_code"] == "CL"
    assert isinstance(meta["caveat"], str)
    assert meta["caveat"]
    assert isinstance(meta["filters"], dict)
    assert "action_id" in meta["filters"]
    assert isinstance(meta["total_records"], int)
    assert meta["total_records"] == len(payload["data"])

    rows = payload["data"]
    assert isinstance(rows, list)
    assert rows
    for row in rows:
        assert EXPECTED_ITEM_KEYS.issubset(row.keys())
        assert isinstance(row["action_id"], str)
        assert row["action_id"]
        _assert_optional_string(row["action_name"], "action_name")
        _assert_optional_string(row["sector"], "sector")
        _assert_optional_score(row["financial_feasibility"], "financial_feasibility")
        _assert_optional_string(row["route"], "route")
        _assert_optional_string(row["reason"], "reason")
        assert isinstance(row["inputs"], dict)
        assert isinstance(row["links"], dict)
        _assert_live_inputs_shape(row["inputs"])
        _assert_live_links_shape(row["links"])

    validated = ActionFinancialFeasibilityScoresApiResponse.model_validate(payload)
    assert validated.data


@pytest.mark.integration
@pytest.mark.external
def test_action_financial_feasibility_scores_live_service_maps_payload() -> None:
    """The synchronous financial feasibility service maps live payload records."""
    fetch_result = ActionFinancialFeasibilityScoresApiService().get_scores_by_action_id(
        "CL ARI",
        "CL",
    )
    scores = fetch_result.scores_by_action_id

    assert scores
    first_score = scores[sorted(scores.keys())[0]]
    assert first_score.action_id
    assert first_score.financial_feasibility is not None
    assert 0.0 <= first_score.financial_feasibility <= 1.0
    assert first_score.route is None or isinstance(first_score.route, str)
    assert isinstance(first_score.inputs, dict)
    assert isinstance(first_score.links, dict)
    assert first_score.source_metadata["requested_locode"] == "CL ARI"
    assert first_score.source_metadata["requested_country_code"] == "CL"
    assert first_score.source_metadata["http_status_code"] == 200
