"""Live contract checks for upstream mitigation feasibility scores."""

from __future__ import annotations

import pytest

from app.modules.prioritizer.models import (
    ActionMitigationFeasibilityScoresApiResponse,
)
from app.services.action_mitigation_feasibility_scores_api import (
    ACTION_MITIGATION_FEASIBILITY_SCORES_ENDPOINT_TEMPLATE,
    ActionMitigationFeasibilityScoresApiService,
)
from app.services.http_client import get_json_with_retries

EXPECTED_SCORE_KEYS = {
    "locode",
    "src_action_id",
    "global_mitigation_option",
    "action_mapping_strength",
    "option_family",
    "action_score",
    "n_feasibility_dimensions",
    "dimension_scores",
    "breakdown",
    "rank_within_city",
}
EXPECTED_META_KEYS = {
    "generated_at_utc",
    "endpoint",
    "locode",
    "country_code",
    "release_id",
    "src_action_id",
    "total_records",
}


def _assert_optional_score(value: object, field_name: str) -> None:
    """Assert one optional score stays within the normalized `0..1` range."""
    assert value is None or isinstance(value, (int, float)), field_name
    if value is not None:
        assert 0.0 <= float(value) <= 1.0, field_name


def _assert_optional_signed_unit_value(value: object, field_name: str) -> None:
    """Assert one optional signed value stays within the normalized `-1..1` range."""
    assert value is None or isinstance(value, (int, float)), field_name
    if value is not None:
        assert -1.0 <= float(value) <= 1.0, field_name


def _assert_live_dimension_scores_shape(dimension_scores: dict[str, object]) -> None:
    """Assert dimension score mapping stays numeric and normalized."""
    assert dimension_scores
    for dimension_name, dimension_score in dimension_scores.items():
        assert isinstance(dimension_name, str)
        assert dimension_name
        _assert_optional_score(dimension_score, dimension_name)


def _assert_live_breakdown_shape(breakdown: dict[str, object]) -> None:
    """Assert one breakdown payload keeps the nested shape we store."""
    for dimension_name, dimension_payload in breakdown.items():
        assert isinstance(dimension_name, str)
        assert dimension_name
        assert isinstance(dimension_payload, dict), dimension_name
        assert {"dimension_score", "n_global_indicators", "global_indicators"}.issubset(
            dimension_payload.keys()
        ), dimension_name
        _assert_optional_score(
            dimension_payload["dimension_score"],
            f"{dimension_name}.dimension_score",
        )
        assert isinstance(
            dimension_payload["n_global_indicators"],
            int,
        ), dimension_name
        global_indicators = dimension_payload["global_indicators"]
        assert isinstance(global_indicators, list), dimension_name
        for indicator_payload in global_indicators:
            assert isinstance(indicator_payload, dict), dimension_name
            assert {
                "global_indicator",
                "global_verdict",
                "global_contribution",
                "n_city_indicators",
                "avg_city_contribution",
                "indicator_score",
                "city_indicators",
            }.issubset(indicator_payload.keys()), dimension_name
            assert isinstance(indicator_payload["global_indicator"], str), dimension_name
            assert indicator_payload["global_indicator"], dimension_name
            assert indicator_payload["global_verdict"] is None or isinstance(
                indicator_payload["global_verdict"],
                str,
            ), dimension_name
            _assert_optional_signed_unit_value(
                indicator_payload["global_contribution"],
                f"{dimension_name}.global_contribution",
            )
            assert isinstance(indicator_payload["n_city_indicators"], int), dimension_name
            assert indicator_payload["avg_city_contribution"] is None or isinstance(
                indicator_payload["avg_city_contribution"],
                (int, float),
            ), dimension_name
            _assert_optional_score(
                indicator_payload["indicator_score"],
                f"{dimension_name}.indicator_score",
            )
            city_indicators = indicator_payload["city_indicators"]
            assert isinstance(city_indicators, list), dimension_name
            for city_indicator_payload in city_indicators:
                assert isinstance(city_indicator_payload, dict), dimension_name
                assert {
                    "city_indicator",
                    "category",
                    "direction",
                    "capacity",
                    "contribution",
                }.issubset(city_indicator_payload.keys()), dimension_name
                assert isinstance(
                    city_indicator_payload["city_indicator"],
                    str,
                ), dimension_name
                assert city_indicator_payload["city_indicator"], dimension_name
                assert city_indicator_payload["category"] is None or isinstance(
                    city_indicator_payload["category"],
                    str,
                ), dimension_name
                assert city_indicator_payload["direction"] is None or isinstance(
                    city_indicator_payload["direction"],
                    str,
                ), dimension_name
                _assert_optional_score(
                    city_indicator_payload["capacity"],
                    f"{dimension_name}.capacity",
                )
                _assert_optional_signed_unit_value(
                    city_indicator_payload["contribution"],
                    f"{dimension_name}.contribution",
                )


@pytest.mark.integration
@pytest.mark.external
def test_action_mitigation_feasibility_scores_live_payload_matches_contract() -> None:
    """The live feasibility payload keeps the contract our service implements."""
    service = ActionMitigationFeasibilityScoresApiService()
    url = service._build_action_mitigation_feasibility_scores_url("CL ARI", "CL")

    payload, status_code = get_json_with_retries(
        url=url,
        operation_name="action mitigation feasibility scores API call",
        headers={"accept": "application/json"},
    )

    assert status_code == 200
    assert {"meta", "scores"}.issubset(payload.keys())
    meta = payload["meta"]
    assert EXPECTED_META_KEYS.issubset(meta.keys())
    assert isinstance(meta["generated_at_utc"], str)
    assert meta["generated_at_utc"]
    assert meta["endpoint"] == ACTION_MITIGATION_FEASIBILITY_SCORES_ENDPOINT_TEMPLATE
    assert meta["locode"] == "CL ARI"
    assert meta["country_code"] == "CL"
    assert meta["release_id"] is None or isinstance(meta["release_id"], str)
    assert meta["src_action_id"] is None or isinstance(meta["src_action_id"], str)
    assert isinstance(meta["total_records"], int)
    assert meta["total_records"] == len(payload["scores"])

    scores = payload["scores"]
    assert isinstance(scores, list)
    assert scores
    for score in scores:
        assert EXPECTED_SCORE_KEYS.issubset(score.keys())
        assert score["locode"] == "CL ARI"
        assert isinstance(score["src_action_id"], str)
        assert score["src_action_id"]
        assert score["global_mitigation_option"] is None or isinstance(
            score["global_mitigation_option"],
            str,
        )
        assert score["action_mapping_strength"] is None or isinstance(
            score["action_mapping_strength"],
            str,
        )
        assert score["option_family"] is None or isinstance(score["option_family"], str)
        _assert_optional_score(score["action_score"], "action_score")
        assert isinstance(score["n_feasibility_dimensions"], int)
        assert score["n_feasibility_dimensions"] >= 0
        assert isinstance(score["rank_within_city"], int)
        assert score["rank_within_city"] > 0
        dimension_scores = score["dimension_scores"]
        assert isinstance(dimension_scores, dict)
        _assert_live_dimension_scores_shape(dimension_scores)
        breakdown = score["breakdown"]
        assert isinstance(breakdown, dict)
        _assert_live_breakdown_shape(breakdown)

    validated = ActionMitigationFeasibilityScoresApiResponse.model_validate(payload)
    assert validated.scores


@pytest.mark.integration
@pytest.mark.external
def test_action_mitigation_feasibility_scores_live_service_maps_payload() -> None:
    """The synchronous feasibility service maps the live payload into records."""
    fetch_result = ActionMitigationFeasibilityScoresApiService().get_scores_by_action_id(
        "CL ARI",
        "CL",
    )
    scores = fetch_result.scores_by_action_id

    assert scores
    first_score = scores[sorted(scores.keys())[0]]
    assert first_score.action_id
    assert first_score.action_score is not None
    assert 0.0 <= first_score.action_score <= 1.0
    assert first_score.source_metadata["requested_locode"] == "CL ARI"
    assert first_score.source_metadata["requested_country_code"] == "CL"
    assert first_score.source_metadata["http_status_code"] == 200
