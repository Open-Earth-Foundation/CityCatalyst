"""Tests for the CNB funder research agent loop and coverage checks."""

import json
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.models.cnb_research import (
    FieldEvidence,
    FundingOpportunityResearchResult,
    FundingRecordResearchResult,
    ResearchGap,
    SourceDocumentAssessment,
)
from app.models.cnb_similar_projects import CnbSimilarProjectSearchRequest
from app.services.cnb_research_agent import (
    find_missing_data,
    preserve_evidence_qualified_funded_projects,
    run_agent_loop,
)
from tests.cnb_research_helpers import build_request, build_result


def build_invalid_research_result_error() -> ValidationError:
    """Build the cross-reference validation failure seen in provider output."""
    result_data = build_result().model_dump(mode="python")
    result_data["conflicts"] = [
        {
            "target_path": "funding_records[opportunity-001].status",
            "candidate_values": ["open", "closed"],
            "evidence_refs": ["evidence-070"],
            "explanation": "Two source pages report different states.",
        }
    ]
    with pytest.raises(ValidationError) as exc_info:
        FundingOpportunityResearchResult.model_validate(result_data)
    return exc_info.value


def build_supported_project_result(
    *,
    parent_path_evidence: bool = False,
    evidence_ref: str = "project-evidence",
) -> FundingOpportunityResearchResult:
    """Build one sparse project whose populated facts have current-run evidence."""
    base = build_result()
    project = FundingRecordResearchResult(
        funding_record_ref="project-001",
        funder_ref="funder-001",
        is_opportunity=False,
        name="Retained solar project",
        reported_funder_name="Example Funder",
        city="Nicosia",
        interventions=["Municipal rooftop solar"],
        award_amount=250000,
        currency="EUR",
        summary="The project installs solar generation on municipal buildings.",
    )
    project_path = "funding_records[project-001]"
    if parent_path_evidence:
        project_evidence = [
            FieldEvidence(
                evidence_ref=evidence_ref,
                funding_record_ref="project-001",
                target_path=project_path,
                source_ref="source-current",
                quote_or_summary="The official award page identifies the project.",
            )
        ]
    else:
        project_evidence = [
            FieldEvidence(
                evidence_ref=f"{evidence_ref}-name",
                funding_record_ref="project-001",
                target_path=f"{project_path}.name",
                source_ref="source-current",
                quote_or_summary="The official award page names the project.",
            ),
            FieldEvidence(
                evidence_ref=f"{evidence_ref}-funder",
                funding_record_ref="project-001",
                target_path=f"{project_path}.reported_funder_name",
                source_ref="source-current",
                quote_or_summary="The award page attributes it to Example Funder.",
            ),
        ]
    result_data = base.model_dump(mode="python")
    result_data["funding_records"].append(project.model_dump(mode="python"))
    result_data["evidence"].extend(
        item.model_dump(mode="python") for item in project_evidence
    )
    result_data["source_assessments"] = [
        SourceDocumentAssessment(
            source_ref="source-current",
            source_type="award_portfolio",
        ).model_dump(mode="python")
    ]
    return FundingOpportunityResearchResult.model_validate(
        result_data
    )


def test_agent_retries_schema_invalid_output_within_the_same_turn() -> None:
    """A model cross-reference error gets one tool-free correction attempt."""
    validation_error = build_invalid_research_result_error()

    class FakeResponses:
        def __init__(self) -> None:
            self.calls: list[dict[str, object]] = []

        def parse(self, **kwargs: object) -> SimpleNamespace:
            self.calls.append(kwargs)
            if len(self.calls) == 1:
                raise validation_error
            return SimpleNamespace(
                id="response-002",
                output=[],
                output_parsed=build_result(),
            )

    responses = FakeResponses()
    trace = []
    outcome = run_agent_loop(
        request=build_request(max_turns=1),
        seed_sources=[],
        firecrawl=SimpleNamespace(captured_sources=[]),
        trace=trace,
        openai_client=SimpleNamespace(responses=responses),
        model_name="gpt-5.6-terra",
        reasoning_effort="medium",
        prompt="Research prompt",
    )

    assert len(responses.calls) == 2
    assert outcome.turns_used == 1
    assert trace[0].turn == 1
    assert trace[0].action == "structured_output_retry"
    retry_input = responses.calls[1]["input"]
    assert isinstance(retry_input, str)
    assert "evidence-070" in retry_input
    assert "does not consume another agent turn" in retry_input
    assert "tools" not in responses.calls[1]


def test_agent_reraises_schema_error_after_bounded_retries() -> None:
    """Persistent schema-invalid output fails after two correction retries."""
    validation_error = build_invalid_research_result_error()

    class FakeResponses:
        def __init__(self) -> None:
            self.calls: list[dict[str, object]] = []

        def parse(self, **kwargs: object) -> SimpleNamespace:
            self.calls.append(kwargs)
            raise validation_error

    responses = FakeResponses()
    with pytest.raises(ValidationError, match="evidence-070"):
        run_agent_loop(
            request=build_request(max_turns=1),
            seed_sources=[],
            firecrawl=SimpleNamespace(captured_sources=[]),
            trace=[],
            openai_client=SimpleNamespace(responses=responses),
            model_name="gpt-5.6-terra",
            reasoning_effort="medium",
            prompt="Research prompt",
        )

    assert len(responses.calls) == 3


def test_agent_does_not_retry_unrelated_parse_exception() -> None:
    """Provider and transport errors retain their original fail-fast behavior."""

    class FakeResponses:
        def __init__(self) -> None:
            self.calls = 0

        def parse(self, **kwargs: object) -> SimpleNamespace:
            self.calls += 1
            raise RuntimeError("provider unavailable")

    responses = FakeResponses()
    with pytest.raises(RuntimeError, match="provider unavailable"):
        run_agent_loop(
            request=build_request(max_turns=1),
            seed_sources=[],
            firecrawl=SimpleNamespace(captured_sources=[]),
            trace=[],
            openai_client=SimpleNamespace(responses=responses),
            model_name="gpt-5.6-terra",
            reasoning_effort="medium",
            prompt="Research prompt",
        )

    assert responses.calls == 1


def test_missing_data_allows_multinational_funder_country_to_remain_null() -> None:
    """Coverage does not equate an institution's headquarters with its country."""
    result = build_result()
    missing = find_missing_data(
        result,
        request=build_request(),
        captured_source_refs={item.source_ref for item in result.evidence},
    )

    assert not any("funder.country" in item for item in missing)


def test_missing_data_requires_source_reported_funder_for_each_project() -> None:
    """Canonical matching cannot start from an absent source-reported name."""
    result = build_result().model_copy(
        update={
            "funding_records": [
                *build_result().funding_records,
                FundingRecordResearchResult(
                    funding_record_ref="project-001",
                    funder_ref="funder-001",
                    is_opportunity=False,
                    name="Funded project",
                ),
            ]
        }
    )

    missing = find_missing_data(
        result,
        request=build_request(),
        captured_source_refs=set(),
    )

    assert any(
        "funding_records[project-001].reported_funder_name" in item
        for item in missing
    )


def test_missing_data_requires_target_number_of_distinct_projects() -> None:
    """Breadth discovery should continue until the requested project count exists."""
    result = build_result().model_copy(
        update={
            "funding_records": [
                *build_result().funding_records,
                FundingRecordResearchResult(
                    funding_record_ref="project-001",
                    funder_ref="funder-001",
                    is_opportunity=False,
                    name="Funded project",
                    reported_funder_name="Example Funder",
                ),
            ]
        }
    )

    missing = find_missing_data(
        result,
        request=build_request(target_funded_projects=2),
        captured_source_refs=set(),
    )

    assert any("target of 2 is met" in item for item in missing)


def test_missing_data_allows_explicit_target_gap_to_end_breadth_discovery() -> None:
    """A precise target-count gap can explain why the requested breadth was missed."""
    result = build_result().model_copy(
        update={
            "funding_records": [
                *build_result().funding_records,
                FundingRecordResearchResult(
                    funding_record_ref="project-001",
                    funder_ref="funder-001",
                    is_opportunity=False,
                    name="Funded project",
                    reported_funder_name="Example Funder",
                ),
            ],
            "gaps": [
                ResearchGap(
                    target_path="funding_records.target_funded_projects",
                    reason="Only one official project could be confirmed.",
                )
            ],
        }
    )

    missing = find_missing_data(
        result,
        request=build_request(target_funded_projects=2),
        captured_source_refs=set(),
    )

    assert not any("target of 2 is met" in item for item in missing)


def test_final_audit_preserves_supported_project_removed_by_candidate() -> None:
    """A final audit cannot discard a project grounded in current-run evidence."""
    supported_result = build_supported_project_result()
    shrunk_result = build_result().model_copy(
        update={
            "gaps": [
                ResearchGap(
                    target_path="funding_records.target_funded_projects",
                    reason="Only the opportunity could be confirmed.",
                )
            ]
        }
    )

    class FakeResponses:
        def __init__(self) -> None:
            self.calls: list[dict[str, object]] = []
            self.results = [supported_result, shrunk_result]

        def parse(self, **kwargs: object) -> SimpleNamespace:
            self.calls.append(kwargs)
            return SimpleNamespace(
                id=f"response-{len(self.calls):03d}",
                output=[],
                output_parsed=self.results[len(self.calls) - 1],
            )

    outcome = run_agent_loop(
        request=build_request(max_turns=2),
        seed_sources=[],
        firecrawl=SimpleNamespace(
            captured_sources=[
                SimpleNamespace(source_ref="source-002"),
                SimpleNamespace(source_ref="source-current"),
            ]
        ),
        trace=[],
        openai_client=SimpleNamespace(responses=FakeResponses()),
        model_name="gpt-5.6-terra",
        reasoning_effort="medium",
        prompt="Research prompt",
    )

    assert {item.funding_record_ref for item in outcome.result.funding_records} == {
        "opportunity-001",
        "project-001",
    }
    assert {
        item.source_ref for item in outcome.result.source_assessments
    } == {"source-current"}
    assert not any(
        gap.target_path == "funding_records.target_funded_projects"
        for gap in outcome.result.gaps
    )
    assert {
        item.evidence_ref
        for item in outcome.result.evidence
        if item.funding_record_ref == "project-001"
    } == {"project-evidence-name", "project-evidence-funder"}
    restored = next(
        item
        for item in outcome.result.funding_records
        if item.funding_record_ref == "project-001"
    )
    assert restored.reported_funder_name == "Example Funder"
    assert restored.city is None
    assert restored.interventions == []
    assert restored.award_amount is None


def test_checkpoint_does_not_restore_project_from_stale_source() -> None:
    """Evidence from a source not captured in this run cannot retain a row."""
    merged = preserve_evidence_qualified_funded_projects(
        previous_result=build_supported_project_result(),
        candidate_result=build_result(),
        captured_source_refs={"source-002"},
    )

    assert [item.funding_record_ref for item in merged.funding_records] == [
        "opportunity-001"
    ]


def test_checkpoint_sanitizes_partially_evidenced_project_to_name_only() -> None:
    """A trusted project name survives while unsupported optional facts are reset."""
    previous = build_supported_project_result()
    previous_data = previous.model_dump(mode="python")
    for evidence in previous_data["evidence"]:
        if evidence["target_path"].endswith(".reported_funder_name"):
            evidence["quote_or_summary"] = "   "
    previous = FundingOpportunityResearchResult.model_validate(previous_data)

    merged = preserve_evidence_qualified_funded_projects(
        previous_result=previous,
        candidate_result=build_result(),
        captured_source_refs={"source-002", "source-current"},
    )

    restored = next(
        item
        for item in merged.funding_records
        if item.funding_record_ref == "project-001"
    )
    assert restored.name == "Retained solar project"
    assert restored.reported_funder_name is None
    assert restored.city is None
    assert restored.interventions == []
    assert restored.award_amount is None
    assert restored.currency is None
    assert restored.summary is None
    assert [
        item.target_path
        for item in merged.evidence
        if item.funding_record_ref == "project-001"
    ] == ["funding_records[project-001].name"]


def test_checkpoint_accepts_parent_row_path_evidence() -> None:
    """Parent-row evidence preserves all populated project detail."""
    merged = preserve_evidence_qualified_funded_projects(
        previous_result=build_supported_project_result(parent_path_evidence=True),
        candidate_result=build_result(),
        captured_source_refs={"source-002", "source-current"},
    )

    assert {item.funding_record_ref for item in merged.funding_records} == {
        "opportunity-001",
        "project-001",
    }
    restored = next(
        item
        for item in merged.funding_records
        if item.funding_record_ref == "project-001"
    )
    assert restored.reported_funder_name == "Example Funder"
    assert restored.city == "Nicosia"
    assert restored.interventions == ["Municipal rooftop solar"]
    assert restored.award_amount == 250000
    assert restored.currency == "EUR"
    assert restored.summary == (
        "The project installs solar generation on municipal buildings."
    )


def test_checkpoint_rekeys_colliding_retained_evidence_deterministically() -> None:
    """Retained evidence cannot reuse an evidence ID returned by the candidate."""
    candidate_data = build_result().model_dump(mode="python")
    candidate_data["evidence"][0]["evidence_ref"] = "project-evidence"
    candidate = FundingOpportunityResearchResult.model_validate(candidate_data)

    merged = preserve_evidence_qualified_funded_projects(
        previous_result=build_supported_project_result(
            parent_path_evidence=True,
            evidence_ref="project-evidence",
        ),
        candidate_result=candidate,
        captured_source_refs={"source-002", "source-current"},
    )

    assert [item.evidence_ref for item in merged.evidence] == [
        "project-evidence",
        "project-evidence-retained-1",
    ]


def test_agent_reopens_an_incomplete_structured_checkpoint_for_next_turn() -> None:
    """An early partial object is followed by missing-data and turn context."""
    parsed_result = build_result()

    class FakeResponses:
        def __init__(self) -> None:
            self.calls: list[dict[str, object]] = []

        def parse(self, **kwargs: object) -> SimpleNamespace:
            self.calls.append(kwargs)
            return SimpleNamespace(
                id=f"response-{len(self.calls):03d}",
                output=[],
                output_parsed=parsed_result,
            )

    client = SimpleNamespace(responses=FakeResponses())
    trace = []
    outcome = run_agent_loop(
        request=build_request(max_turns=2),
        seed_sources=[],
        firecrawl=SimpleNamespace(captured_sources=[]),
        trace=trace,
        openai_client=client,
        model_name="gpt-5.6-terra",
        reasoning_effort="medium",
        prompt="Research prompt",
    )

    assert outcome.turns_used == 2
    assert outcome.termination_reason == "turn_limit"
    assert len(client.responses.calls) == 2
    assert "tools" in client.responses.calls[0]
    assert "tools" not in client.responses.calls[1]
    second_input = client.responses.calls[1]["input"]
    assert isinstance(second_input, list)
    progress_message = second_input[-1]["content"]
    assert "<current_filled_object>" in progress_message
    assert "<missing_data>" in progress_message
    assert "turns_remaining_after_this: 0" in progress_message
    assert "<final_gap_audit>" in progress_message


def test_agent_input_includes_target_project_search_profile() -> None:
    """The model receives the project fields that must drive discovery."""
    target_project = CnbSimilarProjectSearchRequest(
        run_id="eee75fe1-30e7-5fc1-9bf8-d2a72fca00dd",
        funder_scope="cross_funder",
        project_name="Nicosia municipal energy and mobility project",
        project_summary="Solar, storage, and charging on municipal sites.",
        country="Cyprus",
        interventions=["Municipal solar", "Battery storage"],
        project_tags=["municipal-solar", "battery-storage"],
        limit=50,
    )
    request = build_request(max_turns=1).model_copy(
        update={"target_project": target_project}
    )

    class FakeResponses:
        def __init__(self) -> None:
            self.calls: list[dict[str, object]] = []

        def parse(self, **kwargs: object) -> SimpleNamespace:
            self.calls.append(kwargs)
            return SimpleNamespace(
                id="response-001",
                output=[],
                output_parsed=build_result(),
            )

    responses = FakeResponses()
    run_agent_loop(
        request=request,
        seed_sources=[],
        firecrawl=SimpleNamespace(captured_sources=[]),
        trace=[],
        openai_client=SimpleNamespace(responses=responses),
        model_name="gpt-5.6-terra",
        reasoning_effort="medium",
        prompt="Research prompt",
    )

    initial_input = json.loads(responses.calls[0]["input"])
    serialized_target = initial_input["research_request"]["target_project"]
    assert serialized_target["funder_id"] is None
    assert serialized_target["funder_scope"] == "cross_funder"
    assert serialized_target["project_name"] == (
        "Nicosia municipal energy and mobility project"
    )
    assert serialized_target["project_summary"] == (
        "Solar, storage, and charging on municipal sites."
    )
    assert serialized_target["country"] == "Cyprus"
    assert serialized_target["interventions"] == [
        "Municipal solar",
        "Battery storage",
    ]
    assert serialized_target["project_tags"] == [
        "municipal-solar",
        "battery-storage",
    ]


def test_agent_checkpoint_excludes_target_project_from_coverage() -> None:
    """A returned copy of the input project cannot satisfy discovery coverage."""
    target_name = "Nicosia Solar-Storage & E-Mobility Project"
    target_project = CnbSimilarProjectSearchRequest(
        run_id="eee75fe1-30e7-5fc1-9bf8-d2a72fca00dd",
        funder_scope="cross_funder",
        project_name=target_name,
    )
    request = build_request(max_turns=1).model_copy(
        update={"target_project": target_project}
    )
    base = build_result()
    self_match = FundingRecordResearchResult(
        funding_record_ref="project-self",
        funder_ref="funder-001",
        is_opportunity=False,
        name="nicosia solar storage e mobility project",
        reported_funder_name="Example Funder",
    )
    parsed_result = base.model_copy(
        update={"funding_records": [*base.funding_records, self_match]}
    )

    class FakeResponses:
        def parse(self, **kwargs: object) -> SimpleNamespace:
            return SimpleNamespace(
                id="response-001",
                output=[],
                output_parsed=parsed_result,
            )

    outcome = run_agent_loop(
        request=request,
        seed_sources=[],
        firecrawl=SimpleNamespace(captured_sources=[]),
        trace=[],
        openai_client=SimpleNamespace(responses=FakeResponses()),
        model_name="gpt-5.6-terra",
        reasoning_effort="medium",
        prompt="Research prompt",
    )

    assert [record.funding_record_ref for record in outcome.result.funding_records] == [
        "opportunity-001"
    ]
    assert any(
        "Find at least one officially documented funded project" in item
        for item in outcome.missing_data
    )


def test_final_audit_with_new_missing_data_reports_turn_limit() -> None:
    """A clean prior checkpoint cannot mask gaps introduced by the final audit."""
    covered_gaps = [
        ResearchGap(target_path=target_path, reason="Not publicly available.")
        for target_path in (
            "funder.funder_type",
            "funder.region",
            "funding_records[opportunity-001].finance_route",
            "funding_records[opportunity-001].instrument_type",
            "funding_records[opportunity-001].region_scope",
            "funder_templates",
            "funder_criteria",
            "funding_records.target_funded_projects",
            "funding_records.deep_funded_project",
            "funding_records.financial_coverage",
            "sources.guidance_or_eligibility",
            "sources.funded_project_evidence",
        )
    ]
    covered_result = build_result().model_copy(update={"gaps": covered_gaps})
    incomplete_result = covered_result.model_copy(
        update={
            "gaps": [
                gap for gap in covered_gaps if gap.target_path != "funder.region"
            ]
        }
    )

    class FakeResponses:
        def __init__(self) -> None:
            self.calls: list[dict[str, object]] = []
            self.results = [covered_result, incomplete_result]

        def parse(self, **kwargs: object) -> SimpleNamespace:
            self.calls.append(kwargs)
            return SimpleNamespace(
                id=f"response-{len(self.calls):03d}",
                output=[],
                output_parsed=self.results[len(self.calls) - 1],
            )

    responses = FakeResponses()
    outcome = run_agent_loop(
        request=build_request(max_turns=2),
        seed_sources=[],
        firecrawl=SimpleNamespace(
            captured_sources=[SimpleNamespace(source_ref="source-002")]
        ),
        trace=[],
        openai_client=SimpleNamespace(responses=responses),
        model_name="gpt-5.6-terra",
        reasoning_effort="medium",
        prompt="Research prompt",
    )

    assert "tools" in responses.calls[0]
    assert "tools" not in responses.calls[1]
    assert outcome.termination_reason == "turn_limit"
    assert any("funder.region" in item for item in outcome.missing_data)


def test_agent_prioritizes_breadth_target_before_deep_project() -> None:
    """Multi-project runs enumerate supported rows before deepening one example."""
    shallow_result = build_result().model_copy(
        update={
            "funding_records": [
                *build_result().funding_records,
                FundingRecordResearchResult(
                    funding_record_ref="project-001",
                    funder_ref="funder-001",
                    is_opportunity=False,
                    name="Funded project",
                    reported_funder_name="Example Funder",
                ),
            ]
        }
    )
    breadth_result = build_result().model_copy(
        update={
            "funding_records": [
                *build_result().funding_records,
                FundingRecordResearchResult(
                    funding_record_ref="project-001",
                    funder_ref="funder-001",
                    is_opportunity=False,
                    name="Funded project",
                    reported_funder_name="Example Funder",
                ),
                FundingRecordResearchResult(
                    funding_record_ref="project-002",
                    funder_ref="funder-001",
                    is_opportunity=False,
                    name="Second funded project",
                    reported_funder_name="Example Funder",
                ),
            ]
        }
    )
    deep_result = breadth_result.model_copy(
        update={
            "funding_records": [
                *breadth_result.funding_records[:-2],
                breadth_result.funding_records[-2].model_copy(
                    update={
                        "interventions": ["Stormwater retrofit"],
                        "award_amount": 125000,
                        "currency": "USD",
                        "award_year": 2025,
                        "status": "awarded",
                        "summary": "The award funded implementation planning.",
                    }
                ),
                breadth_result.funding_records[-1],
            ]
        }
    )

    class FakeResponses:
        def __init__(self) -> None:
            self.calls: list[dict[str, object]] = []
            self.results = [
                shallow_result,
                breadth_result,
                deep_result,
                deep_result,
            ]

        def parse(self, **kwargs: object) -> SimpleNamespace:
            self.calls.append(kwargs)
            return SimpleNamespace(
                id=f"response-{len(self.calls):03d}",
                output=[],
                output_parsed=self.results[len(self.calls) - 1],
            )

    client = SimpleNamespace(responses=FakeResponses())
    outcome = run_agent_loop(
        request=build_request(max_turns=4, target_funded_projects=2),
        seed_sources=[],
        firecrawl=SimpleNamespace(captured_sources=[]),
        trace=[],
        openai_client=client,
        model_name="gpt-5.6-terra",
        reasoning_effort="medium",
        prompt="Research prompt",
    )

    assert len(client.responses.calls) == 4
    first_input = json.loads(client.responses.calls[0]["input"])
    second_input = client.responses.calls[1]["input"]
    third_input = client.responses.calls[2]["input"]
    fourth_input = client.responses.calls[3]["input"]
    assert isinstance(second_input, list)
    assert isinstance(third_input, list)
    assert isinstance(fourth_input, list)
    assert first_input["research_stage"] == "breadth_funded_projects"
    assert "tools" in client.responses.calls[1]
    assert "Stay in breadth discovery" in second_input[-1]["content"]
    assert "deeply evidenced funded-project chain" in third_input[-1]["content"]
    assert "<final_gap_audit>" not in second_input[-1]["content"]
    assert "<final_gap_audit>" not in third_input[-1]["content"]
    assert "<final_gap_audit>" in fourth_input[-1]["content"]
    assert outcome.termination_reason == "turn_limit"


def test_resumed_prior_evidence_cannot_report_coverage_complete() -> None:
    """A resumed dossier remains incomplete until prior evidence is recaptured."""
    base = build_result()
    covered_result = base.model_copy(
        update={
            "gaps": [
                ResearchGap(target_path=target_path, reason="Not publicly available.")
                for target_path in (
                    "funder.funder_type",
                    "funder.region",
                    "funding_records[opportunity-001].finance_route",
                    "funding_records[opportunity-001].instrument_type",
                    "funding_records[opportunity-001].region_scope",
                    "funder_templates",
                    "funder_criteria.eligibility",
                    "funder_criteria.selection",
                    "funding_records[funded-project]",
                    "funding_records.deep_funded_project",
                    "funding_records.financial_coverage",
                    "sources.guidance_or_eligibility",
                    "sources.funded_project_evidence",
                )
            ]
        }
    )
    request = build_request(max_turns=2).model_copy(
        update={"current_filled_object": covered_result}
    )

    class FakeResponses:
        def __init__(self) -> None:
            self.calls: list[dict[str, object]] = []

        def parse(self, **kwargs: object) -> SimpleNamespace:
            self.calls.append(kwargs)
            return SimpleNamespace(
                id=f"response-{len(self.calls):03d}",
                output=[],
                output_parsed=covered_result,
            )

    responses = FakeResponses()
    outcome = run_agent_loop(
        request=request,
        seed_sources=[],
        firecrawl=SimpleNamespace(captured_sources=[]),
        trace=[],
        openai_client=SimpleNamespace(responses=responses),
        model_name="gpt-5.6-terra",
        reasoning_effort="medium",
        prompt="Research prompt",
    )

    initial_input = json.loads(responses.calls[0]["input"])
    assert any("prior-run" in item for item in initial_input["missing_data"])
    assert outcome.termination_reason == "turn_limit"
    assert any("prior-run" in item for item in outcome.missing_data)


def test_recaptured_resume_evidence_can_satisfy_coverage() -> None:
    """Stable source identities allow recaptured evidence to remain valid."""
    result = build_result()

    missing = find_missing_data(
        result,
        request=build_request(),
        captured_source_refs={"source-002"},
    )

    assert not any("prior-run" in item for item in missing)
    assert not any("funding_records[opportunity-001].status" in item for item in missing)
