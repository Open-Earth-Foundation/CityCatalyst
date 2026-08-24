"""Tests for CNB funder research bundle conversion and material paths."""

from datetime import datetime, timezone

from app.models.cnb.research import (
    FieldEvidence,
    FunderCriterionResearchResult,
    FunderTemplateResearchResult,
    FundedProjectResearchResult,
    ResearchConflictResult,
    ResearchRunMetadata,
    TemplateChapterDraft,
)
from app.services.cnb.research_bundle import (
    build_research_bundle,
    convert_agent_result,
    material_paths,
)
from app.tools.firecrawl import CapturedSource
from tests.cnb.helpers import build_request, build_result


def test_material_paths_use_funded_project_reference() -> None:
    base = build_result()
    project = FundedProjectResearchResult(
        funded_project_ref="project-001",
        funder_ref="funder-001",
        name="Project",
        interventions=["Prepare the project"],
        award_amount=125000,
        currency="USD",
        award_year=2026,
        status="approved",
        summary="Project-preparation assistance.",
    )
    result = base.model_copy(
        update={"funded_projects": [*base.funded_projects, project]}
    )
    funder, opportunities, projects, templates, criteria = convert_agent_result(result)

    paths = set(
        material_paths(
            funder=funder,
            funding_opportunities=opportunities,
            funded_projects=projects,
            funder_templates=templates,
            funder_criteria=criteria,
        )
    )

    assert "funded_projects[project-001].interventions" in paths
    assert "funded_projects[project-001].award_amount" in paths
    assert "funded_projects[project-001].award_year" in paths


def test_material_paths_use_criterion_template_and_chapter_references() -> None:
    result = build_result().model_copy(
        update={
            "funder_templates": [
                FunderTemplateResearchResult(
                    template_ref="template-001",
                    funding_opportunity_ref="opportunity-001",
                    template_name="Application form",
                    chapter_schema=[
                        TemplateChapterDraft(
                            chapter_ref="chapter-001",
                            title="Project summary",
                        )
                    ],
                )
            ],
            "funder_criteria": [
                FunderCriterionResearchResult(
                    criterion_ref="selection-002",
                    funding_opportunity_ref="opportunity-001",
                    criterion_type="evaluation",
                    label="Project quality",
                    requirement_text="Describe the proposed investment concept.",
                )
            ],
        }
    )
    funder, opportunities, projects, templates, criteria = convert_agent_result(result)

    paths = set(
        material_paths(
            funder=funder,
            funding_opportunities=opportunities,
            funded_projects=projects,
            funder_templates=templates,
            funder_criteria=criteria,
        )
    )

    assert "funder_templates[template-001].template_name" in paths
    assert (
        "funder_templates[template-001].chapter_schema[chapter-001].title" in paths
    )
    assert "funder_criteria[selection-002].label" in paths
    assert not any("funder_criteria[opportunity-001]" in path for path in paths)


def test_bundle_drops_prior_run_evidence_and_its_conflict_links() -> None:
    evidence = FieldEvidence(
        evidence_ref="prior-evidence",
        funding_opportunity_ref="opportunity-001",
        target_path="funding_opportunities[opportunity-001].status",
        source_ref="source-prior-content",
        quote_or_summary="Claim captured during an earlier run.",
    )
    conflict = ResearchConflictResult(
        target_path="funding_opportunities[opportunity-001].status",
        candidate_values=["open", "closed"],
        evidence_refs=[evidence.evidence_ref],
        explanation="Earlier sources disagreed.",
    )
    result = build_result().model_copy(
        update={"evidence": [evidence], "conflicts": [conflict]}
    )
    now = datetime.now(timezone.utc)
    metadata = ResearchRunMetadata(
        pipeline_version="3.0",
        model_name="test-model",
        reasoning_effort="medium",
        prompt_sha256="prompt-hash",
        started_at=now,
        completed_at=now,
        duration_seconds=1,
        max_turns=1,
        turns_used=1,
        termination_reason="coverage_complete",
    )
    captured = CapturedSource(
        source_ref="source-current-content",
        url="https://unrelated.example/current",
        title="Current source",
        content_hash="current-hash",
        fetched_at=now,
        local_snapshot_path="sources/source-current-content.md",
    )

    bundle = build_research_bundle(
        run_id="current-run",
        run_metadata=metadata,
        request=build_request(max_turns=1),
        result=result,
        captured_sources=[captured],
        trace=[],
        bootstrap_gaps=[],
    )

    assert bundle.evidence == []
    assert bundle.conflicts[0].evidence_refs == []
    assert any(
        "referenced unknown source" in gap
        for gap in bundle.funding_opportunities[0].known_gaps
    )
    assert any("referenced unknown source" in gap.reason for gap in bundle.gaps)
    assert any(
        "Conflict evidence was not retained" in gap.reason for gap in bundle.gaps
    )
