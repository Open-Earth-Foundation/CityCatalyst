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
from app.services.data_clients import MockActionDataApiClient, MockLegalDataApiClient


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
    payload = json.loads((_mock_data_dir() / "city_api_mock.json").read_text(encoding="utf-8"))
    return CityData.model_validate(payload["city"])


def _load_mock_legal_requirements() -> dict[str, object]:
    """Load legal requirements from the mock legal API payload."""
    legal_client = MockLegalDataApiClient(
        mock_file_path=_mock_data_dir() / "actions_legal_api_mock.json"
    )
    return legal_client.get_action_legal_requirements(locode="CL IQQ")


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


@pytest.mark.unit
def test_hard_filter_block_with_mock_api_data() -> None:
    """Hard filter removes known not-aligned actions from mock legal data."""
    actions = _load_mock_actions()
    legal_requirements = _load_mock_legal_requirements()

    result = hard_filter.run(
        actions=actions,
        excluded_actions_free_text="Exclude fossil-heavy actions (stub behavior today).",
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
    """Impact block emits normalized city-specific scores and explainability evidence."""
    actions = _load_mock_actions()
    city_emissions_by_gpc_ref = _load_city_emissions_by_gpc_ref()

    result = impact.run(
        actions=actions,
        city_emissions_by_gpc_ref=city_emissions_by_gpc_ref,
    )

    assert len(result.score_by_action_id) == len(actions)
    assert all(0.0 <= score <= 1.0 for score in result.score_by_action_id.values())
    assert max(result.score_by_action_id.values()) == pytest.approx(1.0)
    assert result.evidence_by_action_id is not None

    first_action_evidence = result.evidence_by_action_id["c40_0010"]
    assert first_action_evidence["has_emissions_entry"] is True
    assert first_action_evidence["has_any_action_gpc_ref"] is True
    assert first_action_evidence["action_gpc_refs"] == ["I.1.1", "I.1.2"]
    assert first_action_evidence["matched_city_gpc_refs_count"] == 2
    assert first_action_evidence["reduction_share_of_city_emissions"] > 0.0
    assert first_action_evidence["impact_normalized"] == pytest.approx(
        result.score_by_action_id["c40_0010"]
    )


@pytest.mark.unit
def test_impact_block_rejects_unknown_impact_text_band() -> None:
    """Impact block fails fast when an action has an unknown impact_text band."""
    actions = [
        Action(
            action_id="A1",
            action_name="Unknown impact text action",
            implementation_timeline="<5 years",
            mitigation_impact={
                "emissions": {
                    "gpc_reference_number": ["I.1.1"],
                    "impact_text": "extreme",
                }
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
            mitigation_impact={
                "emissions": {
                    "gpc_reference_number": ["I.1.1"],
                    "impact_text": "medium",
                }
            },
        ),
        Action(
            action_id="A_low",
            action_name="Targets low emissions",
            implementation_timeline="<5 years",
            mitigation_impact={
                "emissions": {
                    "gpc_reference_number": ["II.1.1"],
                    "impact_text": "medium",
                }
            },
        ),
    ]

    result = impact.run(
        actions=actions,
        city_emissions_by_gpc_ref={"I.1.1": 1_000.0, "II.1.1": 100.0},
    )

    assert result.score_by_action_id["A_high"] > result.score_by_action_id["A_low"]
    assert result.score_by_action_id["A_high"] == pytest.approx(1.0)


@pytest.mark.unit
def test_impact_block_accepts_gpc_reference_number_list_shape() -> None:
    """Impact block accepts the mock schema where gpc_reference_number is a list."""
    action = Action(
        action_id="A_refs",
        action_name="Action with repeated refs",
        implementation_timeline="5-10 years",
        mitigation_impact={
            "emissions": {
                "gpc_reference_number": ["I.1.1", "I.1.1", "I.1.2"],
                "impact_text": "low",
            }
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
            mitigation_impact={
                "emissions": {
                    "gpc_reference_number": ["I.1.1"],
                    "impact_text": "high",
                }
            },
        ),
        Action(
            action_id="A_slow",
            action_name="Slow timeline",
            implementation_timeline=">10 years",
            mitigation_impact={
                "emissions": {
                    "gpc_reference_number": ["I.1.1"],
                    "impact_text": "high",
                }
            },
        ),
    ]

    result = impact.run(
        actions=actions,
        city_emissions_by_gpc_ref={"I.1.1": 100.0},
    )
    assert (
        result.evidence_by_action_id["A_fast"]["timeline_score"]
        > result.evidence_by_action_id["A_slow"]["timeline_score"]
    )
    assert result.score_by_action_id["A_fast"] > result.score_by_action_id["A_slow"]


@pytest.mark.unit
def test_alignment_block_with_mock_api_data() -> None:
    """Alignment block returns zero scores with attribute-presence evidence."""
    actions = _load_mock_actions()
    city = _load_mock_city()

    result = alignment.run(actions=actions, city=city)

    assert len(result.score_by_action_id) == len(actions)
    assert all(score == 0.0 for score in result.score_by_action_id.values())
    assert result.evidence_by_action_id is not None

    first_action_evidence = result.evidence_by_action_id["c40_0010"]
    assert first_action_evidence["has_action_type"] is False
    assert first_action_evidence["has_action_category"] is True
    assert first_action_evidence["has_action_subcategory"] is True


@pytest.mark.unit
def test_feasibility_block_with_mock_api_data() -> None:
    """Feasibility block returns zero scores (stub)."""
    actions = _load_mock_actions()
    city = _load_mock_city()

    result = feasibility.run(actions=actions, city=city)

    assert len(result.score_by_action_id) == len(actions)
    assert all(score == 0.0 for score in result.score_by_action_id.values())
    assert result.evidence_by_action_id is None


@pytest.mark.unit
def test_final_scoring_block_with_mock_api_data() -> None:
    """Final scoring applies weights, tie-break sorting, and top_n truncation."""
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
    assert [item.rank for item in scored_actions] == [1, 2]
    assert scored_actions[0].final_score == pytest.approx(scored_actions[1].final_score)
