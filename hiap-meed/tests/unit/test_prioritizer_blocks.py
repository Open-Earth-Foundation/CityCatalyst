"""Unit tests for prioritizer pipeline blocks using mock API payloads."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.modules.prioritizer.blocks import (
    alignment,
    feasibility,
    final_scoring,
    hard_filter,
    impact,
)
from app.modules.prioritizer.internal_models import Action, CityData
from app.modules.prioritizer.models import CityApiItem
from app.services.data_clients import (
    MockActionDataApiClient,
    MockCityDataApiClient,
    MockLegalDataApiClient,
    MockPolicySignalsDataApiClient,
)


def _mock_data_dir() -> Path:
    """Return the checked-in mock data directory path."""
    return Path(__file__).resolve().parents[2] / "data" / "mock"


def _load_mock_actions() -> list[Action]:
    """Load actions from the mock actions API payload."""
    action_client = MockActionDataApiClient(
        mock_file_path=_mock_data_dir() / "actions_api_mock.json"
    )
    return action_client.list_actions()


def _load_mock_city() -> CityData:
    """Load city context from the mock city API payload."""
    city_client = MockCityDataApiClient(
        mock_file_path=_mock_data_dir() / "city_api_mock.json"
    )
    return city_client.get_city("CL IQQ")


def _load_mock_legal_requirements() -> dict[str, object]:
    """Load legal requirements from the mock legal API payload."""
    legal_client = MockLegalDataApiClient(
        mock_file_path=_mock_data_dir() / "actions_legal_api_mock.json"
    )
    return legal_client.get_action_legal_requirements(locode="CL IQQ")


def _load_mock_policy_signals() -> dict[str, object]:
    """Load policy support signals from the mock policy-signals payload."""
    policy_client = MockPolicySignalsDataApiClient(
        mock_file_path=_mock_data_dir() / "actions_policy_signals_api_mock.json"
    )
    return policy_client.get_action_policy_signals(locode="CL IQQ")


def _load_city_emissions_by_gpc_ref() -> dict[str, float]:
    """Return city emissions totals per GPC key from frontend request mock payload."""
    request_payload = json.loads(
        (_mock_data_dir() / "prioritizer_request_mock.json").read_text(encoding="utf-8")
    )
    city_input = request_payload["requestData"]["cityDataList"][0]
    gpc_data = city_input["cityEmissionsData"]["gpcData"]

    emissions_by_gpc_ref: dict[str, float] = {}
    for gpc_ref, gpc_entry in gpc_data.items():
        activities = gpc_entry.get("activities", [])
        emissions_by_gpc_ref[gpc_ref] = sum(
            activity.get("totalEmissions") or 0.0 for activity in activities
        )
    return emissions_by_gpc_ref


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
        policy_signals_by_action_id={},
        city_preference_sectors=[],
        city_preference_timeframes=city_preference_timeframes,
        city_preference_co_benefit_keys=[],
    )
    assert result.evidence_by_action_id is not None
    return result.evidence_by_action_id["A_timeframe"]


@pytest.mark.unit
def test_mock_city_loader_keeps_renamed_indicator_keys() -> None:
    """Mock city parsing preserves renamed socioeconomic indicators in raw/context."""
    city = _load_mock_city()

    assert "employment_in_transport_and_logistics" in city.raw
    assert "electricity_access_rate" in city.raw
    city_context_names = {
        row["attribute_name"] for row in city.city_context if "attribute_name" in row
    }
    assert "employment_in_transport_and_logistics" in city_context_names
    assert "electricity_access_rate" in city_context_names


@pytest.mark.unit
def test_city_api_item_ignores_legacy_indicator_names() -> None:
    """Legacy city indicator names are ignored so mismatches remain visible."""
    city = CityApiItem.model_validate(
        {
            "comuna_name": "Iquique",
            "locode": "CL IQQ",
            "countryCode": "CL",
            "region_name": "Tarapaca",
            "comuna_code": "CL01101",
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

    assert city.employment_in_transport_and_logistics is None
    assert city.electricity_access_rate is None


@pytest.mark.unit
def test_hard_filter_block_with_mock_api_data() -> None:
    """Hard filter removes known not-aligned actions from mock legal data."""
    actions = _load_mock_actions()
    legal_requirements = _load_mock_legal_requirements()

    result = hard_filter.run(
        actions=actions,
        excluded_action_ids=[],
        legal_requirements_by_action_id=legal_requirements,
    )

    discarded_legal_ids = {action.action_id for action in result.discarded_legal}
    expected_discarded_legal_ids = {"c40_0012", "c40_0034", "c40_0037", "c40_0029"}
    assert discarded_legal_ids == expected_discarded_legal_ids
    assert len(result.discarded_excluded) == 0
    assert len(result.valid_actions) == len(actions) - len(expected_discarded_legal_ids)

    assert result.evidence["c40_0012"]["discard_reason"] == "legal_hard_requirement_failed"
    assert result.evidence["c40_0013"]["hard_requirements_unknown_count"] == 1


@pytest.mark.unit
def test_impact_block_with_mock_api_data() -> None:
    """Impact block emits canonical weighted-sum scores and explainability evidence."""
    actions = _load_mock_actions()
    city_emissions_by_gpc_ref = _load_city_emissions_by_gpc_ref()

    result = impact.run(
        actions=actions,
        city_emissions_by_gpc_ref=city_emissions_by_gpc_ref,
    )

    assert len(result.score_by_action_id) == len(actions)
    assert all(0.0 <= score <= 1.0 for score in result.score_by_action_id.values())
    assert result.evidence_by_action_id is not None

    first_action_evidence = result.evidence_by_action_id["c40_0010"]
    assert first_action_evidence["has_emissions_entry"] is True
    assert first_action_evidence["has_any_action_gpc_ref"] is True
    assert first_action_evidence["action_gpc_refs"] == ["I.1.1", "I.1.2"]
    assert first_action_evidence["matched_city_gpc_refs_count"] == 2
    assert first_action_evidence["emissions_reduction_share_of_city_total"] > 0.0
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
                "gpc_reference_number": ["I.1.1"],
                "impact_text": "extreme",
            },
        )
    ]

    with pytest.raises(ValueError, match="Unknown mitigation impact_text value"):
        impact.run(actions=actions, city_emissions_by_gpc_ref={"I.1.1": 100.0})


@pytest.mark.unit
def test_impact_block_ranks_higher_emissions_target_above_lower_target() -> None:
    """Action targeting higher-emitting city refs ranks higher with same timeline/band."""
    actions = [
        Action(
            action_id="A_high",
            action_name="Targets high emissions",
            implementation_timeline="<5 years",
            emissions={
                "gpc_reference_number": ["I.1.1"],
                "impact_text": "medium",
            },
        ),
        Action(
            action_id="A_low",
            action_name="Targets low emissions",
            implementation_timeline="<5 years",
            emissions={
                "gpc_reference_number": ["II.1.1"],
                "impact_text": "medium",
            },
        ),
    ]

    result = impact.run(
        actions=actions,
        city_emissions_by_gpc_ref={"I.1.1": 1_000.0, "II.1.1": 100.0},
    )

    assert result.score_by_action_id["A_high"] > result.score_by_action_id["A_low"]


@pytest.mark.unit
def test_impact_block_accepts_gpc_reference_number_list_shape() -> None:
    """Impact block accepts the mock schema where gpc_reference_number is a list."""
    action = Action(
        action_id="A_refs",
        action_name="Action with repeated refs",
        implementation_timeline="5-10 years",
        emissions={
            "gpc_reference_number": ["I.1.1", "I.1.1", "I.1.2"],
            "impact_text": "low",
        },
    )

    result = impact.run(
        actions=[action],
        city_emissions_by_gpc_ref={"I.1.1": 10.0, "I.1.2": 5.0},
    )

    evidence = result.evidence_by_action_id["A_refs"]
    assert evidence["action_gpc_refs"] == ["I.1.1", "I.1.2"]
    assert evidence["matched_city_gpc_refs_count"] == 2


@pytest.mark.unit
def test_impact_block_timeline_mapping_prefers_faster_implementation() -> None:
    """Timeline mapping contributes more for faster implementation buckets."""
    actions = [
        Action(
            action_id="A_fast",
            action_name="Fast timeline",
            implementation_timeline="<5 years",
            emissions={
                "gpc_reference_number": ["I.1.1"],
                "impact_text": "high",
            },
        ),
        Action(
            action_id="A_slow",
            action_name="Slow timeline",
            implementation_timeline=">10 years",
            emissions={
                "gpc_reference_number": ["I.1.1"],
                "impact_text": "high",
            },
        ),
    ]

    result = impact.run(
        actions=actions,
        city_emissions_by_gpc_ref={"I.1.1": 100.0},
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
                    "gpc_reference_number": ["I.1.1"],
                    "impact_text": "high",
                },
            )
        ],
        city_emissions_by_gpc_ref={"I.1.1": 100.0},
    )

    evidence = result.evidence_by_action_id["A_missing_timeline"]
    assert evidence["timeline_bucket_known"] is False
    assert evidence["timeline_component_score"] == pytest.approx(0.5)
    assert evidence["timeline_score"] == pytest.approx(0.5)


@pytest.mark.unit
def test_alignment_block_with_mock_api_data() -> None:
    """Alignment block computes canonical weighted scores with policy and sectors."""
    actions = _load_mock_actions()
    policy_signals = _load_mock_policy_signals()

    result = alignment.run(
        actions=actions,
        policy_signals_by_action_id=policy_signals,
        city_preference_sectors=["stationary_energy", "transportation"],
        city_preference_timeframes=["no_preference"],
        city_preference_co_benefit_keys=["mobility"],
    )

    assert len(result.score_by_action_id) == len(actions)
    assert all(0.0 <= score <= 1.0 for score in result.score_by_action_id.values())
    assert result.evidence_by_action_id is not None

    first_action_evidence = result.evidence_by_action_id["c40_0010"]
    assert first_action_evidence["policy_component_score"] > 0.0
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
    policy_signals = _load_mock_policy_signals()

    result = alignment.run(
        actions=actions,
        policy_signals_by_action_id=policy_signals,
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
    assert first_action_evidence["co_benefit_component_score"] == pytest.approx(0.5)


@pytest.mark.unit
def test_alignment_other_preference_component_is_neutral_without_selected_keys() -> None:
    """Alignment keeps the other-preference component neutral without selections."""
    actions = _load_mock_actions()
    policy_signals = _load_mock_policy_signals()

    result = alignment.run(
        actions=actions,
        policy_signals_by_action_id=policy_signals,
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
        policy_signals_by_action_id={},
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
        policy_signals_by_action_id={},
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
        policy_signals_by_action_id={},
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
def test_feasibility_block_with_mock_api_data(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Feasibility block computes legal+socio canonical scores and evidence."""
    actions = _load_mock_actions()
    city = _load_mock_city()
    legal_requirements = _load_mock_legal_requirements()

    with caplog.at_level("WARNING", logger="app.modules.prioritizer.blocks.feasibility"):
        result = feasibility.run(
            actions=actions,
            city=city,
            legal_requirements_by_action_id=legal_requirements,
        )

    assert len(result.score_by_action_id) == len(actions)
    assert all(0.0 <= score <= 1.0 for score in result.score_by_action_id.values())
    assert result.evidence_by_action_id is not None
    first_action_evidence = result.evidence_by_action_id["c40_0010"]
    assert "socioeconomic_indicator_rows" in first_action_evidence
    assert first_action_evidence["feasibility_score"] == pytest.approx(
        first_action_evidence["soft_legal_contribution"]
        + first_action_evidence["socioeconomic_contribution"]
    )
    first_action_rows = {
        row["action_socioeconomic_indicator_key"]: row
        for row in first_action_evidence["socioeconomic_indicator_rows"]
    }
    assert (
        first_action_rows["employment_in_transport_and_logistics"][
            "city_socioeconomic_bucket_label"
        ]
        == "low"
    )
    assert (
        first_action_rows["electricity_access_rate"][
            "city_socioeconomic_bucket_label"
        ]
        == "very_low"
    )
    missing_indicator_messages = [
        record.message
        for record in caplog.records
        if "Missing city socioeconomic indicator" in record.message
    ]
    assert not any(
        "employment_in_transport_and_logistics" in message
        or "electricity_access_rate" in message
        for message in missing_indicator_messages
    )


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
