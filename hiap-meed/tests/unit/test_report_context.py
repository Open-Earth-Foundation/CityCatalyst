"""Unit tests for output-plan report context builders."""

from __future__ import annotations

import json

import pytest

from app.modules.prioritizer.internal_models import (
    Action,
    ActionMitigationFeasibilityScoreRecord,
    CityData,
)
from app.modules.prioritizer.models import CityActionReportApiRequest
from app.modules.prioritizer.report_context import (
    build_chapter_inputs,
    build_report_context,
    validate_report_snapshot,
)


def _report_request(
    *,
    action_id: str = "A_1",
    language: str = "en",
    locode: str = "CL-SCL",
    response_results: list[dict[str, object]] | None = None,
) -> CityActionReportApiRequest:
    """Build a valid output-plan request with a one-city prioritization snapshot."""
    if response_results is None:
        response_results = [
            {
                "locode": "CL-SCL",
                "ranked_action_ids": ["A_1"],
                "ranked_actions": [_ranked_action_payload("A_1")],
                "removed_actions": [],
                "metadata": {
                    "locode": "CL-SCL",
                    "internal_request_id": "internal-1",
                    "frontend_request_id": "prioritize-req-1",
                    "counts": {
                        "total_actions": 1,
                        "valid_actions": 1,
                        "discarded_excluded": 0,
                        "discarded_legal": 0,
                        "ranked_actions": 1,
                    },
                    "weights": {
                        "impact": 0.34,
                        "alignment": 0.33,
                        "feasibility": 0.33,
                    },
                    "timings": {},
                    "explanations": {
                        "requested": True,
                        "generated": 1,
                        "requested_languages": ["en"],
                        "canonical_language": "en",
                        "generated_languages": ["en"],
                        "translation_warnings": [],
                    },
                    "hard_filter_evidence_by_action_id": {},
                },
                "warnings": [],
            }
        ]

    return CityActionReportApiRequest.model_validate(
        {
            "meta": {
                "requestId": "report-req-1",
                "generatedAtUtc": "2026-07-14T00:00:00Z",
                "backendConsumer": "hiap-meed",
                "upstreamProvider": "test",
                "apiContext": {"endpoint": "POST /v1/reports/output-plan"},
                "totalRecords": 1,
            },
            "requestData": {
                "locode": locode,
                "actionId": action_id,
                "language": language,
                "debugContextOnly": True,
                "prioritizationSnapshot": {
                    "request": {
                        "meta": {
                            "requestId": "prioritize-req-1",
                            "generatedAtUtc": "2026-07-14T00:00:00Z",
                            "backendConsumer": "hiap-meed",
                            "upstreamProvider": "test",
                            "apiContext": {
                                "endpoint": "POST /v1/prioritize",
                                "locodes": ["CL-SCL"],
                            },
                            "totalRecords": 1,
                        },
                        "requestData": {
                            "requestedLanguages": ["en"],
                            "topN": 1,
                            "createExplanations": True,
                            "cityDataList": [
                                {
                                    "locode": "CL-SCL",
                                    "countryCode": "CL",
                                    "cityEmissionsData": {"gpcData": {}},
                                }
                            ],
                        },
                    },
                    "response": {
                        "results": response_results,
                    },
                    "storedAtUtc": "2026-07-14T00:00:01Z",
                },
            },
        }
    )


def _ranked_action_payload(action_id: str) -> dict[str, object]:
    """Build a compact ranked-action payload for report tests."""
    return {
        "action_id": action_id,
        "rank": 1,
        "final_score": 0.8,
        "impact_score": 0.9,
        "alignment_score": 0.7,
        "feasibility_score": 0.6,
        "evidence_summary": {
            "impact": {
                "impact_block_score": 0.9,
                "matched_city_subsector_keys_count": 1,
                "emissions_reduction_component_score": 0.8,
                "timeline_component_score": 0.6,
            },
            "alignment": {
                "alignment_score": 0.7,
                "policy_component_score": 0.8,
                "sector_component_score": 0.6,
                "co_benefit_component_score": 0.5,
                "timeframe_component_score": 0.4,
            },
            "feasibility": {
                "feasibility_score": 0.6,
                "legal": {
                    "assessment_present": True,
                    "assessment_missing": False,
                    "verdict_category": "conditional",
                    "component_score": 0.7,
                },
                "mitigation_feasibility": {
                    "component_score": 0.6,
                    "score_present": True,
                    "score_missing": False,
                },
                "financial_feasibility": {
                    "component_score": 0.5,
                    "score_present": True,
                    "score_missing": False,
                    "route": "grant",
                    "reason": "Eligible for external funding.",
                },
            },
        },
        "explanations": {"en": "Strong local fit."},
    }


def test_validate_report_snapshot_returns_selected_city_action_and_country() -> None:
    """Snapshot validation should find the requested city/action pair."""
    city_result, ranked_action, country_code = validate_report_snapshot(_report_request())

    assert city_result.locode == "CL-SCL"
    assert ranked_action.action_id == "A_1"
    assert country_code == "CL"


def test_report_context_warns_when_language_was_not_in_source_request() -> None:
    """Report language can differ from the prioritization explanation languages."""
    context = build_report_context(
        request=_report_request(language="es"),
        action=Action(action_id="A_1", action_name="Bus electrification"),
        city=CityData(
            city_name="Santiago",
            locode="CL-SCL",
            country_code="CL",
            region_name="Metropolitana",
            region_code="RM",
        ),
        policy_score=None,
        legal_assessment=None,
        mitigation_feasibility=None,
        financial_feasibility=None,
        source_metadata={"city": {"source": "test"}},
    )

    assert context.language == "es"
    assert any(
        "requested report language was not part of the source prioritization" in item
        for item in context.limitations
    )


def test_report_context_limitations_are_reader_safe() -> None:
    """Report limitations should avoid backend implementation details."""
    context = build_report_context(
        request=_report_request(),
        action=Action(action_id="A_1", action_name="Bus electrification"),
        city=CityData(
            city_name="Santiago",
            locode="CL-SCL",
            country_code="CL",
            region_name="Metropolitana",
            region_code="RM",
        ),
        policy_score=None,
        legal_assessment=None,
        mitigation_feasibility=None,
        financial_feasibility=None,
        source_metadata={"city": {"source": "test"}},
    )

    limitations_text = " ".join(context.limitations)

    assert "dedicated endpoint" not in limitations_text
    assert "first implementation" not in limitations_text
    assert "product must define" not in limitations_text
    assert "Comparable project evidence is not available" in limitations_text


def test_report_request_normalizes_boundary_values() -> None:
    """Request DTO validation should normalize simple report boundary values."""
    request = _report_request(action_id=" A_1 ", language=" EN ", locode=" cl-scl ")

    assert request.requestData.locode == "CL-SCL"
    assert request.requestData.actionId == "A_1"
    assert request.requestData.language == "en"


def test_report_request_rejects_blank_boundary_values() -> None:
    """Request DTO validation should reject blank report boundary values."""
    with pytest.raises(ValueError, match="actionId must not be blank"):
        _report_request(action_id="   ")


def test_report_request_rejects_empty_snapshot_response() -> None:
    """Request DTO validation should require a non-empty prioritization response snapshot."""
    with pytest.raises(
        ValueError,
        match="prioritizationSnapshot.response.results must not be empty",
    ):
        _report_request(response_results=[])


def test_build_chapter_inputs_returns_one_input_per_report_chapter() -> None:
    """Chapter builders should isolate one curated input per Notion section."""
    context = build_report_context(
        request=_report_request(),
        action=Action(action_id="A_1", action_name="Bus electrification"),
        city=CityData(
            city_name="Santiago",
            locode="CL-SCL",
            country_code="CL",
            region_name="Metropolitana",
            region_code="RM",
        ),
        policy_score=None,
        legal_assessment=None,
        mitigation_feasibility=None,
        financial_feasibility=None,
        source_metadata={"city": {"source": "test"}},
    )

    chapters = build_chapter_inputs(context)

    assert [chapter.key for chapter in chapters] == [
        "snapshot",
        "the_action",
        "action_impact",
        "city_fit",
        "policy_backing",
        "legal_mandate_delivery",
        "financing_precedents_pathway",
        "sources_assumptions",
    ]
    assert all(chapter.language == "en" for chapter in chapters)


def test_city_fit_input_uses_selected_action_and_curated_feasibility() -> None:
    """City Fit input should not expose taxonomy labels as action names."""
    context = build_report_context(
        request=_report_request(),
        action=Action(action_id="A_1", action_name="Street lighting upgrade"),
        city=CityData(
            city_name="Santiago",
            locode="CL-SCL",
            country_code="CL",
            region_name="Metropolitana",
            region_code="RM",
            city_context=[
                {
                    "attribute_name": "electricity_access_rate",
                    "attribute_category": "high",
                }
            ],
        ),
        policy_score=None,
        legal_assessment=None,
        mitigation_feasibility=ActionMitigationFeasibilityScoreRecord(
            action_id="A_1",
            locode="CL-SCL",
            global_mitigation_option="Efficient appliances",
            action_mapping_strength="direct",
            option_family="buildings",
            action_score=0.91,
            rank_within_city=12,
            dimension_scores={"technological": 0.9, "socio_cultural": 0.4},
            breakdown={
                "technological": {
                    "global_indicators": [
                        {
                            "global_indicator": "technical_scalability",
                            "city_indicators": [
                                {
                                    "city_indicator": "electricity_access_rate",
                                    "category": "high",
                                    "direction": "positive",
                                    "capacity": 0.75,
                                    "contribution": 0.5,
                                }
                            ],
                        }
                    ]
                },
                "socio_cultural": {
                    "global_indicators": [
                        {
                            "global_indicator": "public_acceptance",
                            "city_indicators": [
                                {
                                    "city_indicator": "renter_share",
                                    "category": "very high",
                                    "direction": "negative",
                                    "capacity": 1.0,
                                    "contribution": -1.0,
                                }
                            ],
                        }
                    ]
                },
            },
            raw={"global_mitigation_option": "Efficient appliances"},
        ),
        financial_feasibility=None,
        source_metadata={"city": {"source": "test"}},
    )

    city_fit = next(
        chapter
        for chapter in build_chapter_inputs(context)
        if chapter.key == "city_fit"
    )

    assert city_fit.facts["action"] == {
        "action_id": "A_1",
        "name": "Street lighting upgrade",
    }
    mitigation = city_fit.facts["mitigation_feasibility"]
    assert mitigation["action_score"] == pytest.approx(0.91)
    assert mitigation["supporting_local_conditions"] == [
        {
            "dimension": "technological",
            "global_indicator": "technical_scalability",
            "city_indicator": "electricity_access_rate",
            "category": "high",
            "direction": "positive",
            "capacity": 0.75,
            "contribution": 0.5,
        }
    ]
    assert mitigation["limiting_local_conditions"] == [
        {
            "dimension": "socio_cultural",
            "global_indicator": "public_acceptance",
            "city_indicator": "renter_share",
            "category": "very high",
            "direction": "negative",
            "capacity": 1.0,
            "contribution": -1.0,
        }
    ]
    assert "global_mitigation_option" not in mitigation
    assert "option_family" not in mitigation
    assert "breakdown" not in mitigation
    assert "raw" not in mitigation


def test_chapter_inputs_do_not_expose_full_ranking_snapshot() -> None:
    """Chapter inputs should carry selected-action ranking facts only."""
    context = build_report_context(
        request=_report_request(
            response_results=[
                {
                    "locode": "CL-SCL",
                    "ranked_action_ids": ["A_1", "A_2"],
                    "ranked_actions": [
                        _ranked_action_payload("A_1"),
                        _ranked_action_payload("A_2"),
                    ],
                    "removed_actions": [],
                    "metadata": {
                        "locode": "CL-SCL",
                        "internal_request_id": "internal-1",
                        "frontend_request_id": "prioritize-req-1",
                        "counts": {
                            "total_actions": 2,
                            "valid_actions": 2,
                            "discarded_excluded": 0,
                            "discarded_legal": 0,
                            "ranked_actions": 2,
                        },
                        "weights": {
                            "impact": 0.34,
                            "alignment": 0.33,
                            "feasibility": 0.33,
                        },
                        "timings": {},
                        "explanations": {
                            "requested": True,
                            "generated": 2,
                            "requested_languages": ["en"],
                            "canonical_language": "en",
                            "generated_languages": ["en"],
                            "translation_warnings": [],
                        },
                        "hard_filter_evidence_by_action_id": {},
                    },
                    "warnings": [],
                }
            ]
        ),
        action=Action(action_id="A_1", action_name="Bus electrification"),
        city=CityData(
            city_name="Santiago",
            locode="CL-SCL",
            country_code="CL",
            region_name="Metropolitana",
            region_code="RM",
        ),
        policy_score=None,
        legal_assessment=None,
        mitigation_feasibility=None,
        financial_feasibility=None,
        source_metadata={"city": {"source": "test"}},
    )

    chapters = build_chapter_inputs(context)

    for chapter in chapters:
        chapter_json = json.dumps(chapter.facts, sort_keys=True)
        assert "ranked_action_ids" not in chapter_json
        assert "ranked_actions" not in chapter_json
        assert "A_2" not in chapter_json

    snapshot = next(chapter for chapter in chapters if chapter.key == "snapshot")
    assert snapshot.facts["ranking"]["returned_action_count"] == 2


def test_chapter_source_refs_and_limitations_are_chapter_specific() -> None:
    """Most chapters should not see every source ref or report limitation."""
    context = build_report_context(
        request=_report_request(),
        action=Action(action_id="A_1", action_name="Bus electrification"),
        city=CityData(
            city_name="Santiago",
            locode="CL-SCL",
            country_code="CL",
            region_name="Metropolitana",
            region_code="RM",
        ),
        policy_score=None,
        legal_assessment=None,
        mitigation_feasibility=None,
        financial_feasibility=None,
        source_metadata={
            "city": {"source": "test"},
            "action_pathways": {"source": "test"},
            "policy_scores": {"source": "test"},
            "legal": {"source": "test"},
            "mitigation_feasibility": {"source": "test"},
            "financial_feasibility": {"source": "test"},
        },
    )

    chapters_by_key = {chapter.key: chapter for chapter in build_chapter_inputs(context)}

    assert chapters_by_key["the_action"].source_refs == ["action_pathways"]
    assert chapters_by_key["city_fit"].source_refs == [
        "ranking_snapshot",
        "city",
        "mitigation_feasibility",
    ]
    assert "No live policy score row" not in " ".join(
        chapters_by_key["the_action"].limitations
    )
    assert chapters_by_key["sources_assumptions"].source_refs == [
        "ranking_snapshot",
        "city",
        "action_pathways",
        "policy_scores",
        "legal",
        "mitigation_feasibility",
        "financial_feasibility",
    ]
