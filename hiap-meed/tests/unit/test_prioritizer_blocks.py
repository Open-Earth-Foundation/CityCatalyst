"""Unit tests for prioritizer pipeline blocks using mock API payloads."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.modules.prioritizer.api import _extract_city_emissions_context
from app.modules.prioritizer.blocks import (
    alignment,
    feasibility,
    final_scoring,
    hard_filter,
    impact,
)
from app.modules.prioritizer.internal_models import (
    Action,
    CityData,
    CityEmissionsContext,
)
from app.modules.prioritizer.models import CityApiItem, FrontendCityInput
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


def _load_mock_actions() -> list[Action]:
    """Load actions from the mock actions API payload."""
    action_client = MockActionPathwaysDataApiClient(
        mock_file_path=_mock_data_dir() / "action_pathways_api_mock.json"
    )
    return action_client.list_actions().actions


def _load_mock_city() -> CityData:
    """Load city context from the mock city API payload."""
    city_client = MockCityDataApiClient(
        mock_file_path=_mock_data_dir() / "city_api_mock.json"
    )
    return city_client.get_city("CL IQQ")


def _load_mock_legal_assessments() -> dict[str, object]:
    """Load legal assessments from the mock legal API payload."""
    legal_client = MockLegalDataApiClient(
        mock_file_path=_mock_data_dir() / "actions_legal_api_mock.json"
    )
    return legal_client.get_action_legal_assessments(country_code="CL")


def _load_mock_action_policy_scores() -> dict[str, object]:
    """Load action policy scores from the mock action policy scores payload."""
    policy_client = MockActionPolicyScoresDataApiClient(
        mock_file_path=_mock_data_dir() / "action_policy_scores_api_mock.json"
    )
    return policy_client.get_action_policy_scores(locode="CL IQQ").scores_by_action_id


def _load_mock_action_mitigation_feasibility_scores() -> dict[str, object]:
    """Load mitigation feasibility scores from the mock payload."""
    feasibility_client = MockActionMitigationFeasibilityScoresDataApiClient(
        mock_file_path=(
            _mock_data_dir() / "action_mitigation_feasibility_scores_api_mock.json"
        )
    )
    return feasibility_client.get_action_mitigation_feasibility_scores(
        locode="CL ARI",
        country_code="CL",
    ).scores_by_action_id


def _load_mock_action_financial_feasibility_scores() -> dict[str, object]:
    """Load financial feasibility scores from the mock payload."""
    feasibility_client = MockActionFinancialFeasibilityScoresDataApiClient(
        mock_file_path=(
            _mock_data_dir() / "action_financial_feasibility_scores_api_mock.json"
        )
    )
    return feasibility_client.get_action_financial_feasibility_scores(
        locode="CL IQQ",
        country_code="CL",
    ).scores_by_action_id


def _load_city_emissions_context() -> CityEmissionsContext:
    """Return normalized city emissions context from the frontend request mock payload."""
    request_payload = json.loads(
        (_mock_data_dir() / "prioritizer_request_mock.json").read_text(encoding="utf-8")
    )
    city_input = FrontendCityInput.model_validate(
        request_payload["requestData"]["cityDataList"][0]
    )
    return _extract_city_emissions_context(city_input)


def _alignment_timeframe_evidence(
    *,
    city_preference_timeframes: list[str],
    action_timeline: str | None,
) -> dict[str, object]:
    """Return alignment evidence for one action scored only against timeframe input."""
    result = alignment.run(
        actions=[
            Action(
                action_id="A_timeframe",
                action_name="Timeframe alignment action",
                implementation_timeline=action_timeline,
            )
        ],
        action_policy_scores_by_action_id={},
        city_preference_sectors=[],
        city_preference_timeframes=city_preference_timeframes,
        city_preference_co_benefit_keys=[],
    )
    assert result.evidence_by_action_id is not None
    return result.evidence_by_action_id["A_timeframe"]


@pytest.mark.unit
def test_mock_city_loader_preserves_core_city_payload_and_context() -> None:
    """Mock city parsing keeps core fields plus the small retained context backfill."""
    city = _load_mock_city()

    assert "population" in city.raw
    assert "employment_construction" in city.raw
    city_context_names = {
        row["attribute_name"] for row in city.city_context if "attribute_name" in row
    }
    assert "employment_construction" in city_context_names
    assert "unemployment_rate" in city_context_names


@pytest.mark.unit
def test_city_api_item_ignores_unknown_indicator_names() -> None:
    """City API parsing tolerates additive upstream keys we do not consume yet."""
    city = CityApiItem.model_validate(
        {
            "city_name": "Iquique",
            "locode": "CL IQQ",
            "country_code": "CL",
            "region_name": "Tarapaca",
            "region_code": "CL01",
            "transport_logistics_employment": {
                "attribute_value": 7.35,
                "attribute_units": "percent",
                "attribute_category": "low",
            },
            "electricity_access": {
                "attribute_value": 100.0,
                "attribute_units": "percent",
                "attribute_category": "very low",
            },
        }
    )

    assert city.locode == "CL IQQ"
    assert city.city_name == "Iquique"


@pytest.mark.unit
def test_hard_filter_block_with_mock_api_data() -> None:
    """Hard filter removes actions whose legal verdict category is blocked."""
    actions = _load_mock_actions()
    legal_assessments = _load_mock_legal_assessments()

    result = hard_filter.run(
        actions=actions,
        excluded_action_ids=[],
        legal_assessments_by_action_id=legal_assessments,
    )

    discarded_legal_ids = {action.action_id for action in result.discarded_legal}
    assert "c40_0013" in discarded_legal_ids
    assert "c40_0012" not in discarded_legal_ids
    assert len(result.discarded_excluded) == 0
    assert len(result.valid_actions) == len(actions) - len(discarded_legal_ids)

    assert result.evidence["c40_0013"]["discard_reason"] == "legal_verdict_blocked"
    assert result.evidence["c40_0012"]["legal_verdict_category"] == "enabled"
    missing_action_id = next(
        action.action_id
        for action in actions
        if action.action_id not in legal_assessments
    )
    assert result.evidence[missing_action_id]["legal_assessment_present"] is False


@pytest.mark.unit
def test_impact_block_with_mock_api_data() -> None:
    """Impact block emits canonical weighted-sum scores and explainability evidence."""
    actions = _load_mock_actions()
    city_emissions_context = _load_city_emissions_context()

    result = impact.run(
        actions=actions,
        city_emissions_context=city_emissions_context,
    )

    assert len(result.score_by_action_id) == len(actions)
    assert all(0.0 <= score <= 1.0 for score in result.score_by_action_id.values())
    assert result.evidence_by_action_id is not None
    assert result.metadata["matching_mode"] == "subsector_only"

    first_action_evidence = result.evidence_by_action_id["c40_0010"]
    assert first_action_evidence["has_emissions_entry"] is True
    assert first_action_evidence["has_any_action_subsector_key"] is True
    assert first_action_evidence["action_subsector_keys"] == ["I.1"]
    assert first_action_evidence["matched_city_subsector_keys_count"] == 1
    assert first_action_evidence["matched_city_subsector_keys"] == ["I.1"]
    assert first_action_evidence["emissions_reduction_component_score"] > 0.0
    assert first_action_evidence["impact_block_score"] == pytest.approx(
        result.score_by_action_id["c40_0010"]
    )
    assert first_action_evidence["impact_block_score"] == pytest.approx(
        first_action_evidence["emissions_reduction_contribution"]
        + first_action_evidence["timeline_contribution"]
    )


@pytest.mark.unit
def test_impact_block_rejects_unknown_impact_text_band() -> None:
    """Impact block fails fast when an action has an unknown impact_text band."""
    actions = [
        Action(
            action_id="A1",
            action_name="Unknown impact text action",
            implementation_timeline="<5 years",
            emissions={
                "sector_number": "I",
                "subsector_number": [1],
                "gpc_reference_number": ["I.1.1"],
                "impact_text": "extreme",
            },
        )
    ]
    with pytest.raises(ValueError, match="Unknown mitigation impact_text value"):
        impact.run(
            actions=actions,
            city_emissions_context=CityEmissionsContext(
                emissions_by_subsector_key={"I.1": 100.0},
                activity_rows=[],
            ),
        )


@pytest.mark.unit
def test_impact_block_ranks_higher_emissions_target_above_lower_target() -> None:
    """Action targeting higher-emitting city refs ranks higher with same timeline/band."""
    actions = [
        Action(
            action_id="A_high",
            action_name="Targets high emissions",
            implementation_timeline="<5 years",
            emissions={
                "sector_number": "I",
                "subsector_number": [1],
                "gpc_reference_number": ["I.1.1"],
                "impact_text": "medium",
            },
        ),
        Action(
            action_id="A_low",
            action_name="Targets low emissions",
            implementation_timeline="<5 years",
            emissions={
                "sector_number": "II",
                "subsector_number": [1],
                "gpc_reference_number": ["II.1.1"],
                "impact_text": "medium",
            },
        ),
    ]

    result = impact.run(
        actions=actions,
        city_emissions_context=CityEmissionsContext(
            emissions_by_subsector_key={"I.1": 1_000.0, "II.1": 100.0},
            activity_rows=[],
        ),
    )

    assert result.score_by_action_id["A_high"] > result.score_by_action_id["A_low"]


@pytest.mark.unit
def test_impact_block_timeline_mapping_prefers_faster_implementation() -> None:
    """Timeline mapping contributes more for faster implementation buckets."""
    actions = [
        Action(
            action_id="A_fast",
            action_name="Fast timeline",
            implementation_timeline="<5 years",
            emissions={
                "sector_number": "I",
                "subsector_number": [1],
                "gpc_reference_number": ["I.1.1"],
                "impact_text": "high",
            },
        ),
        Action(
            action_id="A_slow",
            action_name="Slow timeline",
            implementation_timeline=">10 years",
            emissions={
                "sector_number": "I",
                "subsector_number": [1],
                "gpc_reference_number": ["I.1.1"],
                "impact_text": "high",
            },
        ),
    ]

    result = impact.run(
        actions=actions,
        city_emissions_context=CityEmissionsContext(
            emissions_by_subsector_key={"I.1": 100.0},
            activity_rows=[],
        ),
    )
    assert (
        result.evidence_by_action_id["A_fast"]["timeline_component_score"]
        > result.evidence_by_action_id["A_slow"]["timeline_component_score"]
    )
    assert result.score_by_action_id["A_fast"] > result.score_by_action_id["A_slow"]


@pytest.mark.unit
def test_impact_block_missing_timeline_is_neutral_not_punitive() -> None:
    """Missing impact timeline uses the neutral 0.5 fallback score."""
    result = impact.run(
        actions=[
            Action(
                action_id="A_missing_timeline",
                action_name="Missing timeline",
                implementation_timeline=None,
                emissions={
                    "sector_number": "I",
                    "subsector_number": [1],
                    "gpc_reference_number": ["I.1.1"],
                    "impact_text": "high",
                },
            )
        ],
        city_emissions_context=CityEmissionsContext(
            emissions_by_subsector_key={"I.1": 100.0},
            activity_rows=[],
        ),
    )

    evidence = result.evidence_by_action_id["A_missing_timeline"]
    assert evidence["timeline_bucket_known"] is False
    assert evidence["timeline_component_score"] == pytest.approx(0.5)
    assert evidence["timeline_score"] == pytest.approx(0.5)


@pytest.mark.unit
def test_city_emissions_context_normalizes_to_true_subsector_keys() -> None:
    """Frontend city emissions are aggregated to `sector.subsector` join keys."""
    city_emissions_context = _load_city_emissions_context()

    assert city_emissions_context.emissions_by_subsector_key["I.1"] == pytest.approx(
        599.532 + 818452.245 + 42200.983 + 2955600.0 + 1438300.0 + 3524785.0
    )
    assert city_emissions_context.emissions_by_subsector_key["II.1"] == pytest.approx(
        1943.87 + 24808.289 + 836.075
    )
    assert city_emissions_context.emissions_by_subsector_key["IV.1"] == pytest.approx(
        28588.499 + 69.867
    )


@pytest.mark.unit
def test_impact_block_zero_emissions_subsector_does_not_count_as_match() -> None:
    """Impact should not match zero-emissions subsectors."""
    result = impact.run(
        actions=[
            Action(
                action_id="A_zero_bucket",
                action_name="Zero-emissions bucket action",
                implementation_timeline="<5 years",
                emissions={
                    "sector_number": "III",
                    "subsector_number": [1],
                    "gpc_reference_number": ["III.1.1"],
                    "impact_text": "high",
                },
            )
        ],
        city_emissions_context=CityEmissionsContext(
            emissions_by_subsector_key={"III.1": 0.0},
            activity_rows=[],
        ),
    )

    evidence = result.evidence_by_action_id["A_zero_bucket"]
    assert evidence["matched_city_subsector_keys_count"] == 0
    assert evidence["matched_city_subsector_keys"] == []
    assert evidence["total_reduction_amount"] == 0.0
    assert evidence["subsector_contributors"] == []


@pytest.mark.unit
def test_impact_block_afolu_negative_emissions_use_absolute_magnitude() -> None:
    """Impact should score AFOLU removals by absolute magnitude."""
    result = impact.run(
        actions=[
            Action(
                action_id="A_afolu_negative",
                action_name="AFOLU removals action",
                implementation_timeline="<5 years",
                emissions={
                    "sector_number": "V",
                    "subsector_number": [2],
                    "gpc_reference_number": ["V.2"],
                    "impact_text": "high",
                },
            )
        ],
        city_emissions_context=CityEmissionsContext(
            emissions_by_subsector_key={"V.2": -50.0},
            activity_rows=[],
        ),
    )

    evidence = result.evidence_by_action_id["A_afolu_negative"]
    assert evidence["matched_city_subsector_keys_count"] == 1
    assert evidence["matched_city_subsector_keys"] == ["V.2"]
    assert evidence["total_city_emissions"] == pytest.approx(50.0)
    assert evidence["total_reduction_amount"] == pytest.approx(40.0)
    assert evidence["emissions_reduction_component_score"] == pytest.approx(0.8)
    assert evidence["impact_block_score"] == pytest.approx(0.84)
    contributor = evidence["subsector_contributors"][0]
    assert contributor["city_emissions"] == pytest.approx(-50.0)
    assert contributor["scoring_city_emissions_magnitude"] == pytest.approx(50.0)


@pytest.mark.unit
def test_impact_block_mixed_sign_inventory_stays_within_zero_to_one() -> None:
    """Impact should include AFOLU absolute magnitude in the scoring denominator."""
    result = impact.run(
        actions=[
            Action(
                action_id="A_positive_inventory",
                action_name="Positive inventory action",
                implementation_timeline="<5 years",
                emissions={
                    "sector_number": "I",
                    "subsector_number": [1],
                    "gpc_reference_number": ["I.1"],
                    "impact_text": "high",
                },
            )
        ],
        city_emissions_context=CityEmissionsContext(
            emissions_by_subsector_key={"I.1": 100.0, "V.2": -50.0},
            activity_rows=[],
        ),
    )

    evidence = result.evidence_by_action_id["A_positive_inventory"]
    assert evidence["matched_city_subsector_keys_count"] == 1
    assert evidence["matched_city_subsector_keys"] == ["I.1"]
    assert evidence["total_city_emissions"] == pytest.approx(150.0)
    assert evidence["emissions_reduction_component_score"] == pytest.approx(80.0 / 150.0)
    assert evidence["impact_block_score"] == pytest.approx((0.8 * (80.0 / 150.0)) + 0.2)


@pytest.mark.unit
def test_impact_block_non_afolu_negative_emissions_do_not_count_as_match() -> None:
    """Impact should not match negative inventory values outside AFOLU."""
    result = impact.run(
        actions=[
            Action(
                action_id="A_non_afolu_negative",
                action_name="Non-AFOLU negative bucket action",
                implementation_timeline="<5 years",
                emissions={
                    "sector_number": "III",
                    "subsector_number": [1],
                    "gpc_reference_number": ["III.1.1"],
                    "impact_text": "high",
                },
            )
        ],
        city_emissions_context=CityEmissionsContext(
            emissions_by_subsector_key={"III.1": -50.0},
            activity_rows=[],
        ),
    )

    evidence = result.evidence_by_action_id["A_non_afolu_negative"]
    assert evidence["matched_city_subsector_keys_count"] == 0
    assert evidence["matched_city_subsector_keys"] == []


@pytest.mark.unit
def test_impact_block_stubbed_activity_mapping_keeps_same_scores(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Enabling the stubbed activity-data mapping should not change Impact output."""
    actions = _load_mock_actions()
    city_emissions_context = _load_city_emissions_context()

    with caplog.at_level("WARNING", logger="app.modules.prioritizer.blocks.impact"):
        disabled_result = impact.run(
            actions=actions,
            city_emissions_context=city_emissions_context,
        )
        monkeypatch.setenv("ACTIVITY_DATA_LEVEL_MAPPING", "true")
        enabled_result = impact.run(
            actions=actions,
            city_emissions_context=city_emissions_context,
        )

    assert enabled_result.score_by_action_id == disabled_result.score_by_action_id
    assert enabled_result.metadata["activity_data_level_mapping_enabled"] is True
    assert enabled_result.metadata["stub_invoked"] is True
    assert any(
        "not implemented" in warning
        for warning in enabled_result.metadata["warnings"]
    )


@pytest.mark.unit
def test_alignment_block_with_mock_api_data() -> None:
    """Alignment block computes canonical weighted scores with policy and sectors."""
    actions = _load_mock_actions()
    action_policy_scores = _load_mock_action_policy_scores()

    result = alignment.run(
        actions=actions,
        action_policy_scores_by_action_id=action_policy_scores,
        city_preference_sectors=["stationary_energy", "transportation"],
        city_preference_timeframes=["no_preference"],
        city_preference_co_benefit_keys=["mobility"],
    )

    assert len(result.score_by_action_id) == len(actions)
    assert all(0.0 <= score <= 1.0 for score in result.score_by_action_id.values())
    assert result.evidence_by_action_id is not None

    first_action_evidence = result.evidence_by_action_id["c40_0010"]
    assert first_action_evidence["policy_component_score"] > 0.0
    assert "policy_source_metadata" not in first_action_evidence
    assert first_action_evidence["sector_component_score"] in {0.0, 1.0}
    assert first_action_evidence["co_benefit_component_score"] == pytest.approx(0.5)
    assert first_action_evidence["alignment_score"] == pytest.approx(
        first_action_evidence["policy_contribution"]
        + first_action_evidence["sector_contribution"]
        + first_action_evidence["co_benefit_contribution"]
        + first_action_evidence["timeframe_contribution"]
    )


@pytest.mark.unit
def test_alignment_other_preference_component_uses_selected_co_benefit_keys() -> None:
    """Alignment other-preference score reflects selected co-benefit impacts."""
    actions = _load_mock_actions()
    action_policy_scores = _load_mock_action_policy_scores()

    result = alignment.run(
        actions=actions,
        action_policy_scores_by_action_id=action_policy_scores,
        city_preference_sectors=["stationary_energy", "transportation"],
        city_preference_timeframes=["no_preference"],
        city_preference_co_benefit_keys=["air_quality", "housing"],
    )

    assert result.evidence_by_action_id is not None
    first_action_evidence = result.evidence_by_action_id["c40_0010"]
    assert first_action_evidence["scored_city_co_benefit_keys"] == [
        "air_quality",
        "housing",
    ]
    assert first_action_evidence["matched_preferred_co_benefits"] == [
        "air_quality",
        "housing",
    ]
    assert first_action_evidence["co_benefit_component_score"] == pytest.approx(0.75)


@pytest.mark.unit
def test_alignment_other_preference_component_is_neutral_without_selected_keys() -> None:
    """Alignment keeps the other-preference component neutral without selections."""
    actions = _load_mock_actions()
    action_policy_scores = _load_mock_action_policy_scores()

    result = alignment.run(
        actions=actions,
        action_policy_scores_by_action_id=action_policy_scores,
        city_preference_sectors=["stationary_energy", "transportation"],
        city_preference_timeframes=["no_preference"],
        city_preference_co_benefit_keys=[],
    )

    assert result.evidence_by_action_id is not None
    first_action_evidence = result.evidence_by_action_id["c40_0010"]
    assert first_action_evidence["scored_city_co_benefit_keys"] == []
    assert first_action_evidence["co_benefit_component_score"] == pytest.approx(0.5)


@pytest.mark.unit
def test_alignment_selected_co_benefit_evidence_marks_missing_entry_as_neutral() -> None:
    """Missing selected co-benefit entries stay neutral in evidence and say why."""
    result = alignment.run(
        actions=[
            Action(
                action_id="A_missing_key",
                action_name="Missing key action",
                co_benefits={},
            )
        ],
        action_policy_scores_by_action_id={},
        city_preference_sectors=[],
        city_preference_timeframes=[],
        city_preference_co_benefit_keys=["air_quality"],
    )

    evidence = result.evidence_by_action_id["A_missing_key"]
    assert evidence["co_benefit_component_score"] == pytest.approx(0.5)
    assert evidence["matched_preferred_co_benefits"] == []
    detail = evidence["selected_co_benefit_match_details"][0]
    assert detail["co_benefit_key"] == "air_quality"
    assert detail["action_has_co_benefit"] is False
    assert detail["impact_numeric"] is None
    assert detail["normalized_preference_score"] == pytest.approx(0.5)
    assert detail["score_source"] == "missing_co_benefit"
    assert detail["effect_label"] == "not_provided"


@pytest.mark.unit
def test_alignment_selected_co_benefit_evidence_marks_missing_numeric_as_neutral() -> None:
    """Missing impact_numeric stays neutral in evidence and is distinct from missing key."""
    result = alignment.run(
        actions=[
            Action(
                action_id="A_missing_numeric",
                action_name="Missing numeric action",
                co_benefits={
                    "air_quality": {
                        "impact_text": "unknown",
                        "impact_relationship": "unknown",
                    }
                },
            )
        ],
        action_policy_scores_by_action_id={},
        city_preference_sectors=[],
        city_preference_timeframes=[],
        city_preference_co_benefit_keys=["air_quality"],
    )

    evidence = result.evidence_by_action_id["A_missing_numeric"]
    assert evidence["co_benefit_component_score"] == pytest.approx(0.5)
    assert evidence["matched_preferred_co_benefits"] == ["air_quality"]
    detail = evidence["selected_co_benefit_match_details"][0]
    assert detail["co_benefit_key"] == "air_quality"
    assert detail["action_has_co_benefit"] is True
    assert detail["impact_numeric"] is None
    assert detail["normalized_preference_score"] == pytest.approx(0.5)
    assert detail["score_source"] == "missing_impact_numeric"
    assert detail["effect_label"] == "unknown"


@pytest.mark.unit
def test_alignment_selected_co_benefit_evidence_marks_real_value_source() -> None:
    """Known co-benefit values keep their normalized score and explicit value source."""
    result = alignment.run(
        actions=[
            Action(
                action_id="A_known_numeric",
                action_name="Known numeric action",
                co_benefits={
                    "air_quality": {
                        "impact_numeric": 1,
                        "impact_text": "beneficial",
                        "impact_relationship": "positive",
                    }
                },
            )
        ],
        action_policy_scores_by_action_id={},
        city_preference_sectors=[],
        city_preference_timeframes=[],
        city_preference_co_benefit_keys=["air_quality"],
    )

    detail = result.evidence_by_action_id["A_known_numeric"][
        "selected_co_benefit_match_details"
    ][0]
    assert detail["normalized_preference_score"] == pytest.approx(0.75)
    assert detail["score_source"] == "derived_from_value"
    assert detail["effect_label"] == "beneficial"


@pytest.mark.unit
@pytest.mark.parametrize(
    ("city_preference_timeframes", "action_timeline", "expected_component_value"),
    [
        (["short"], "<5 years", 1.0),
        (["medium"], "5-10 years", 1.0),
        (["long"], ">10 years", 1.0),
        (["short"], "5-10 years", 0.5),
        (["medium"], "<5 years", 0.5),
        (["medium"], ">10 years", 0.5),
        (["long"], "5-10 years", 0.5),
        (["short"], ">10 years", 0.0),
        (["long"], "<5 years", 0.0),
        (["no_preference"], "<5 years", 0.5),
        (["no_preference"], "5-10 years", 0.5),
        (["no_preference"], ">10 years", 0.5),
        (["short"], None, 0.5),
    ],
)
def test_alignment_timeframe_component_scores_expected_matches(
    city_preference_timeframes: list[str],
    action_timeline: str | None,
    expected_component_value: float,
) -> None:
    """Alignment timeframe component follows exact, adjacent, far, and neutral rules."""
    evidence = _alignment_timeframe_evidence(
        city_preference_timeframes=city_preference_timeframes,
        action_timeline=action_timeline,
    )

    assert evidence["timeframe_component_score"] == pytest.approx(
        expected_component_value
    )


@pytest.mark.unit
@pytest.mark.parametrize(
    ("city_preference_timeframes", "action_timeline", "expected_component_value"),
    [
        (["short", "medium"], "5-10 years", 1.0),
        (["short", "medium"], ">10 years", 0.5),
        (["medium", "long"], "<5 years", 0.5),
        (["short", "long"], "5-10 years", 0.5),
        (["short", "long"], "<5 years", 1.0),
        (["short", "long"], ">10 years", 1.0),
    ],
)
def test_alignment_timeframe_component_uses_best_multi_select_match(
    city_preference_timeframes: list[str],
    action_timeline: str | None,
    expected_component_value: float,
) -> None:
    """Multiple timeframe selections use the highest score across selected options."""
    evidence = _alignment_timeframe_evidence(
        city_preference_timeframes=city_preference_timeframes,
        action_timeline=action_timeline,
    )

    assert evidence["timeframe_component_score"] == pytest.approx(
        expected_component_value
    )


@pytest.mark.unit
def test_feasibility_block_with_mock_api_data() -> None:
    """Feasibility block computes legal, mitigation, and financial evidence."""
    actions = _load_mock_actions()
    legal_assessments = _load_mock_legal_assessments()
    mitigation_feasibility_scores = _load_mock_action_mitigation_feasibility_scores()
    financial_feasibility_scores = _load_mock_action_financial_feasibility_scores()

    result = feasibility.run(
        actions=actions,
        legal_assessments_by_action_id=legal_assessments,
        mitigation_feasibility_scores_by_action_id=mitigation_feasibility_scores,
        financial_feasibility_scores_by_action_id=financial_feasibility_scores,
    )

    assert len(result.score_by_action_id) == len(actions)
    assert all(0.0 <= score <= 1.0 for score in result.score_by_action_id.values())
    assert result.evidence_by_action_id is not None
    first_action_evidence = result.evidence_by_action_id["c40_0034"]
    assert first_action_evidence["feasibility_score"] == pytest.approx(
        first_action_evidence["legal_contribution"]
        + first_action_evidence["mitigation_feasibility_contribution"]
        + first_action_evidence["financial_feasibility_contribution"]
    )
    assert (
        first_action_evidence["mitigation_feasibility_component_source"]
        == "action_mitigation_feasibility_score"
    )
    assert first_action_evidence["mitigation_feasibility_component_score"] == pytest.approx(0.969)
    assert first_action_evidence["mitigation_feasibility_score_present"] is True
    assert (
        first_action_evidence["financial_feasibility_component_source"]
        == "action_financial_feasibility_score"
    )
    assert first_action_evidence["financial_feasibility_component_score"] == pytest.approx(1.0)
    assert first_action_evidence["financial_feasibility_score_present"] is True
    assert first_action_evidence["financial_feasibility_route"] == "self-deliverable"
    assert (
        first_action_evidence["financial_feasibility_reason"]
        == "Low-capital action the city can deliver itself."
    )
    assert first_action_evidence["financial_feasibility_inputs"]["finance"][
        "fund_access"
    ] == "direct"
    assert first_action_evidence["financial_feasibility_links"]["detail"].endswith(
        "/climate-finance/actions/c40_0034"
    )
    first_action_legal_assessment = legal_assessments["c40_0034"]
    assert (
        first_action_evidence["ownership_category"]
        == first_action_legal_assessment.ownership_category
    )
    assert (
        first_action_evidence["ownership_score"]
        == first_action_legal_assessment.ownership_score
    )
    assert (
        first_action_evidence["ownership_description"]
        == first_action_legal_assessment.ownership_description
    )
    assert (
        first_action_evidence["ownership_description_es"]
        == first_action_legal_assessment.ownership_description_i18n["es"]
    )
    assert (
        first_action_evidence["restrictions_category"]
        == first_action_legal_assessment.restrictions_category
    )
    assert (
        first_action_evidence["restrictions_score"]
        == first_action_legal_assessment.restrictions_score
    )
    assert (
        first_action_evidence["restrictions_description"]
        == first_action_legal_assessment.restrictions_description
    )
    assert (
        first_action_evidence["restrictions_description_es"]
        == first_action_legal_assessment.restrictions_description_i18n["es"]
    )
    assert (
        first_action_evidence["legal_justification"]
        == first_action_legal_assessment.legal_justification_i18n["es"]
    )
    assert (
        first_action_evidence["legal_justification_en"]
        == first_action_legal_assessment.legal_justification_i18n["en"]
    )
    assert first_action_evidence["legal_references"] == (
        first_action_legal_assessment.legal_references
    )
    missing_score_action_ids = result.metadata[
        "missing_mitigation_feasibility_score_action_ids"
    ]
    assert isinstance(missing_score_action_ids, list)
    assert set(missing_score_action_ids).issubset(
        {action.action_id for action in actions}
    )
    missing_action_id = next(
        action.action_id
        for action in actions
        if action.action_id not in legal_assessments
    )
    missing_action_evidence = result.evidence_by_action_id[missing_action_id]
    assert missing_action_evidence["legal_component_score"] == pytest.approx(0.5)
    assert missing_action_evidence["legal_component_source"] == "neutral_fallback"
    assert missing_action_evidence["legal_assessment_missing"] is True
    assert result.metadata["missing_legal_assessment_actions_count"] > 0
    assert missing_action_id in result.metadata["missing_legal_assessment_action_ids"]
    assert result.metadata["neutral_legal_fallback_actions_count"] > 0
    assert missing_action_id in result.metadata["neutral_legal_fallback_action_ids"]
    assert result.metadata["missing_financial_feasibility_score_actions_count"] == 0


@pytest.mark.unit
def test_feasibility_block_missing_financial_score_uses_neutral_fallback() -> None:
    """Missing financial feasibility rows use the neutral fallback component."""
    result = feasibility.run(
        actions=[Action(action_id="A_missing_finance", action_name="Missing finance")],
        legal_assessments_by_action_id={},
        mitigation_feasibility_scores_by_action_id={},
        financial_feasibility_scores_by_action_id={},
    )

    evidence = result.evidence_by_action_id["A_missing_finance"]
    assert evidence["financial_feasibility_component_score"] == pytest.approx(0.5)
    assert evidence["financial_feasibility_component_source"] == "neutral_fallback"
    assert evidence["financial_feasibility_score_missing"] is True
    assert evidence["financial_feasibility_contribution"] == pytest.approx(0.165)
    assert result.metadata["missing_financial_feasibility_score_action_ids"] == [
        "A_missing_finance"
    ]
    assert result.score_by_action_id["A_missing_finance"] == pytest.approx(0.5)


@pytest.mark.unit
def test_final_scoring_block_with_mock_api_data() -> None:
    """Final scoring applies tie-break sorting and competitive ranking."""
    actions = _load_mock_actions()
    action_by_id = {action.action_id: action for action in actions}
    selected_actions = [
        action_by_id["c40_0013"],
        action_by_id["c40_0012"],
        action_by_id["c40_0010"],
    ]

    scored_actions = final_scoring.run(
        actions=selected_actions,
        impact_scores={"c40_0013": 0.6, "c40_0012": 0.4, "c40_0010": 0.4},
        alignment_scores={"c40_0013": 0.2, "c40_0012": 0.6, "c40_0010": 0.6},
        feasibility_scores={"c40_0013": 0.1, "c40_0012": 0.1, "c40_0010": 0.1},
        weights={"impact": 0.5, "alignment": 0.3, "feasibility": 0.2},
        top_n=2,
    )

    ranked_ids = [item.action.action_id for item in scored_actions]
    assert ranked_ids == ["c40_0010", "c40_0012"]
    assert [item.rank for item in scored_actions] == [1, 1]
    assert scored_actions[0].final_score == pytest.approx(scored_actions[1].final_score)


@pytest.mark.unit
def test_final_scoring_tie_break_follows_weight_priority() -> None:
    """Tie-break order follows pillar weight priority when final scores are equal."""
    actions = [
        Action(action_id="action_a", action_name="Action A"),
        Action(action_id="action_b", action_name="Action B"),
    ]

    # Scenario 1: impact has highest weight and should break final-score tie.
    impact_first = final_scoring.run(
        actions=actions,
        impact_scores={"action_a": 0.8, "action_b": 0.5},
        alignment_scores={"action_a": 0.2, "action_b": 0.7},
        feasibility_scores={"action_a": 0.2, "action_b": 0.2},
        weights={"impact": 0.5, "alignment": 0.3, "feasibility": 0.2},
        top_n=2,
    )
    assert impact_first[0].final_score == pytest.approx(impact_first[1].final_score)
    assert [item.action.action_id for item in impact_first] == ["action_a", "action_b"]
    assert [item.rank for item in impact_first] == [1, 1]

    # Scenario 2: feasibility has highest weight and should break final-score tie.
    feasibility_first = final_scoring.run(
        actions=actions,
        impact_scores={"action_a": 0.8, "action_b": 0.3},
        alignment_scores={"action_a": 0.5, "action_b": 0.5},
        feasibility_scores={"action_a": 0.2, "action_b": 0.4},
        weights={"impact": 0.2, "alignment": 0.3, "feasibility": 0.5},
        top_n=2,
    )
    assert feasibility_first[0].final_score == pytest.approx(
        feasibility_first[1].final_score
    )
    assert [item.action.action_id for item in feasibility_first] == [
        "action_b",
        "action_a",
    ]
    assert [item.rank for item in feasibility_first] == [1, 1]


@pytest.mark.unit
def test_final_scoring_competitive_ranks_skip_after_ties() -> None:
    """Competitive ranks skip positions after ties in the returned top_n slice."""
    actions = [
        Action(action_id="a1", action_name="Action 1"),
        Action(action_id="a2", action_name="Action 2"),
        Action(action_id="a3", action_name="Action 3"),
        Action(action_id="a4", action_name="Action 4"),
    ]
    scored_actions = final_scoring.run(
        actions=actions,
        impact_scores={"a1": 1.0, "a2": 0.8, "a3": 0.8, "a4": 0.7},
        alignment_scores={"a1": 0.0, "a2": 0.0, "a3": 0.0, "a4": 0.0},
        feasibility_scores={"a1": 0.0, "a2": 0.0, "a3": 0.0, "a4": 0.0},
        weights={"impact": 1.0, "alignment": 0.0, "feasibility": 0.0},
        top_n=4,
    )
    assert [item.rank for item in scored_actions] == [1, 2, 2, 4]

