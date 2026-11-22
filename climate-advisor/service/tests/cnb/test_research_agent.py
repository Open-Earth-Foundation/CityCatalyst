"""Tests for the CNB funder research agent loop and coverage checks."""

import json
from types import SimpleNamespace

import pytest
from app.models.cnb.research import (
    FieldEvidence,
    FundedProjectResearchResult,
    FundingOpportunityResearchResult,
    ResearchGap,
)
from app.services.cnb.research_agent import (
    TARGET_FUNDED_PROJECTS_GAP_PATH,
    find_missing_data,
    preserve_evidence_qualified_funded_projects,
    run_agent_loop,
)
from app.services.cnb.research_prompt import model_research_state
from tests.cnb.helpers import RecordingResponses, build_request, build_result


def test_missing_data_allows_multinational_funder_country_to_remain_null() -> None:
    result = build_result()

    missing = find_missing_data(
        result,
        request=build_request(),
        captured_source_refs={item.source_ref for item in result.evidence},
    )

    assert not any("funder.country" in item for item in missing)


def test_agent_reopens_an_incomplete_structured_checkpoint_for_next_turn() -> None:
    client = SimpleNamespace(
        responses=RecordingResponses(model_research_state(build_result(), []))
    )
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
    # The next turn resumes from the object filled so far.
    assert "Example Program" in client.responses.calls[1]["input"][-1]["content"]


def test_resumed_prior_evidence_cannot_report_coverage_complete() -> None:
    base = build_result()
    covered_result = base.model_copy(
        update={
            "gaps": [
                ResearchGap(target_path=target_path, reason="Not publicly available.")
                for target_path in (
                    "funder.funder_type",
                    "funder.region",
                    "funding_opportunities[opportunity-001].finance_route",
                    "funding_opportunities[opportunity-001].instrument_type",
                    "funding_opportunities[opportunity-001].region_scope",
                    "funder_templates",
                    "funder_criteria.eligibility",
                    "funder_criteria.selection",
                    "funded_projects[funded-project]",
                    "funded_projects.deep_funded_project",
                    "funding_opportunities.financial_coverage",
                    "sources.guidance_or_eligibility",
                    "sources.funded_project_evidence",
                )
            ]
        }
    )
    request = build_request(max_turns=2).model_copy(
        update={"current_filled_object": covered_result}
    )
    responses = RecordingResponses(model_research_state(covered_result, []))
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
    assert not any(
        "funding_opportunities[opportunity-001].status" in item for item in missing
    )


def _result_with_evidenced_project(
    **project_fields: object,
) -> FundingOpportunityResearchResult:
    """Add one funded project whose row evidence came from a captured source."""
    base = build_result()
    project = FundedProjectResearchResult(
        funded_project_ref="project-001",
        funder_ref="funder-001",
        name="Evidence-backed project",
        **project_fields,
    )
    row_evidence = FieldEvidence(
        evidence_ref="evidence-project-row",
        funded_project_ref=project.funded_project_ref,
        target_path="funded_projects[project-001]",
        source_ref="source-project",
        quote_or_summary="The program supported Evidence-backed project.",
    )
    return base.model_copy(
        update={
            "funded_projects": [*base.funded_projects, project],
            "evidence": [*base.evidence, row_evidence],
        }
    )


def test_restored_project_parent_evidence_does_not_restore_optional_facts() -> None:
    restored = preserve_evidence_qualified_funded_projects(
        previous_result=_result_with_evidenced_project(award_amount=999, currency="USD"),
        candidate_result=build_result(),
        captured_source_refs={"source-project"},
        target_funded_projects=1,
    )

    restored_project = next(
        item
        for item in restored.funded_projects
        if item.funded_project_ref == "project-001"
    )
    assert restored_project.name == "Evidence-backed project"
    assert restored_project.award_amount is None
    assert restored_project.currency is None
    assert [item.evidence_ref for item in restored.evidence] == [
        "evidence-001",
        "evidence-project-row",
    ]


@pytest.mark.parametrize(("target", "gap_cleared"), [(2, False), (1, True)])
def test_restored_project_only_clears_a_satisfied_target_gap(
    target: int, gap_cleared: bool
) -> None:
    candidate_result = build_result().model_copy(
        update={
            "gaps": [
                ResearchGap(
                    target_path=TARGET_FUNDED_PROJECTS_GAP_PATH,
                    reason="Only one funded project was documented.",
                )
            ]
        }
    )

    restored = preserve_evidence_qualified_funded_projects(
        previous_result=_result_with_evidenced_project(),
        candidate_result=candidate_result,
        captured_source_refs={"source-project"},
        target_funded_projects=target,
    )

    has_gap = any(gap.target_path == TARGET_FUNDED_PROJECTS_GAP_PATH for gap in restored.gaps)
    assert has_gap is not gap_cleared
