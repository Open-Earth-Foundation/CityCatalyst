"""Tests for the CNB funder research agent loop and coverage checks."""

import json
from types import SimpleNamespace

from app.models.cnb_research import (
    FieldEvidence,
    FundingRecordResearchResult,
    ResearchGap,
)
from app.services.cnb_research_agent import (
    TARGET_FUNDED_PROJECTS_GAP_PATH,
    find_missing_data,
    preserve_evidence_qualified_funded_projects,
    run_agent_loop,
)
from tests.cnb_research_helpers import build_request, build_result


def test_missing_data_allows_multinational_funder_country_to_remain_null() -> None:
    result = build_result()

    missing = find_missing_data(
        result,
        request=build_request(),
        captured_source_refs={item.source_ref for item in result.evidence},
    )

    assert not any("funder.country" in item for item in missing)


def test_agent_reopens_an_incomplete_structured_checkpoint_for_next_turn() -> None:
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
    outcome = run_agent_loop(
        request=build_request(max_turns=2),
        seed_sources=[],
        firecrawl=SimpleNamespace(captured_sources=[]),
        trace=[],
        openai_client=client,
        model_name="test-model",
        reasoning_effort="medium",
        prompt="Research prompt",
    )

    assert outcome.turns_used == 2
    assert outcome.termination_reason == "turn_limit"
    assert "tools" in client.responses.calls[0]
    assert "tools" not in client.responses.calls[1]
    progress_message = client.responses.calls[1]["input"][-1]["content"]
    assert "<current_filled_object>" in progress_message
    assert "<missing_data>" in progress_message
    assert "<final_gap_audit>" in progress_message


def test_resumed_prior_evidence_cannot_report_coverage_complete() -> None:
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
        model_name="test-model",
        reasoning_effort="medium",
        prompt="Research prompt",
    )

    initial_input = json.loads(responses.calls[0]["input"])
    assert any("prior-run" in item for item in initial_input["missing_data"])
    assert outcome.termination_reason == "turn_limit"


def test_recaptured_resume_evidence_can_satisfy_coverage() -> None:
    result = build_result()

    missing = find_missing_data(
        result,
        request=build_request(),
        captured_source_refs={"source-002"},
    )

    assert not any("prior-run" in item for item in missing)
    assert not any("funding_records[opportunity-001].status" in item for item in missing)


def test_restored_project_parent_evidence_does_not_restore_optional_facts() -> None:
    base = build_result()
    project = FundingRecordResearchResult(
        funding_record_ref="project-001",
        funder_ref="funder-001",
        is_opportunity=False,
        name="Evidence-backed project",
        award_amount=999,
        currency="USD",
    )
    row_evidence = FieldEvidence(
        evidence_ref="evidence-project-row",
        funding_record_ref=project.funding_record_ref,
        target_path="funding_records[project-001]",
        source_ref="source-project",
        quote_or_summary="The program supported Evidence-backed project.",
    )
    previous_result = base.model_copy(
        update={
            "funding_records": [*base.funding_records, project],
            "evidence": [*base.evidence, row_evidence],
        }
    )

    restored = preserve_evidence_qualified_funded_projects(
        previous_result=previous_result,
        candidate_result=base,
        captured_source_refs={"source-project"},
        target_funded_projects=1,
    )

    restored_project = next(
        record
        for record in restored.funding_records
        if record.funding_record_ref == project.funding_record_ref
    )
    assert restored_project.name == project.name
    assert restored_project.award_amount is None
    assert restored_project.currency is None
    assert [item.evidence_ref for item in restored.evidence] == [
        "evidence-001",
        "evidence-project-row",
    ]


def test_restored_project_only_clears_a_satisfied_target_gap() -> None:
    base = build_result()
    project = FundingRecordResearchResult(
        funding_record_ref="project-001",
        funder_ref="funder-001",
        is_opportunity=False,
        name="Evidence-backed project",
    )
    row_evidence = FieldEvidence(
        evidence_ref="evidence-project-row",
        funding_record_ref=project.funding_record_ref,
        target_path="funding_records[project-001]",
        source_ref="source-project",
        quote_or_summary="The program supported Evidence-backed project.",
    )
    previous_result = base.model_copy(
        update={
            "funding_records": [*base.funding_records, project],
            "evidence": [*base.evidence, row_evidence],
        }
    )
    candidate_result = base.model_copy(
        update={
            "gaps": [
                ResearchGap(
                    target_path=TARGET_FUNDED_PROJECTS_GAP_PATH,
                    reason="Only one funded project was documented.",
                )
            ]
        }
    )

    still_short = preserve_evidence_qualified_funded_projects(
        previous_result=previous_result,
        candidate_result=candidate_result,
        captured_source_refs={"source-project"},
        target_funded_projects=2,
    )
    target_met = preserve_evidence_qualified_funded_projects(
        previous_result=previous_result,
        candidate_result=candidate_result,
        captured_source_refs={"source-project"},
        target_funded_projects=1,
    )

    assert any(
        gap.target_path == TARGET_FUNDED_PROJECTS_GAP_PATH
        for gap in still_short.gaps
    )
    assert all(
        gap.target_path != TARGET_FUNDED_PROJECTS_GAP_PATH for gap in target_met.gaps
    )
