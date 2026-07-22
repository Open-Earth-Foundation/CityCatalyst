"""Tests for CNB funder research bundle conversion and material paths."""

from datetime import datetime, timezone

from app.models.cnb_research import (
    FieldEvidence,
    FunderCriterionResearchResult,
    FunderTemplateResearchResult,
    FundingRecordResearchResult,
    ResearchGap,
    ResearchConflictResult,
    ResearchRunMetadata,
    SourceDocumentAssessment,
    TemplateChapterDraft,
)
from app.models.cnb_similar_projects import CnbSimilarProjectSearchRequest
from app.services.cnb_research_bundle import (
    build_research_bundle,
    convert_agent_result,
    exclude_target_project_self_matches,
    material_paths,
)
from app.tools.firecrawl import CapturedSource
from tests.cnb_research_helpers import build_request, build_result


def test_material_paths_use_funding_record_reference() -> None:
    """Evidence paths use the shared funding-record identity."""
    base = build_result()
    project = FundingRecordResearchResult(
        funding_record_ref="project-001",
        funder_ref="funder-001",
        is_opportunity=False,
        name="Project",
        reported_funder_name="Minnesota Pollution Control Agency",
        interventions=["Prepare the project"],
        award_amount=125000,
        currency="USD",
        award_year=2026,
        status="approved",
        summary="Project-preparation assistance.",
    )
    result = base.model_copy(
        update={"funding_records": [*base.funding_records, project]}
    )
    funder, records, templates, criteria = convert_agent_result(result)

    paths = set(
        material_paths(
            funder=funder,
            funding_records=records,
            funder_templates=templates,
            funder_criteria=criteria,
        )
    )

    assert "funding_records[project-001].interventions" in paths
    assert "funding_records[project-001].award_amount" in paths
    assert "funding_records[project-001].award_year" in paths
    assert "funding_records[project-001].reported_funder_name" in paths


def test_convert_agent_result_preserves_reported_funder_name_and_empty_review_fields() -> None:
    """Review-only funded-project fields stay empty until a human edits them."""
    base = build_result()
    project = FundingRecordResearchResult(
        funding_record_ref="project-001",
        funder_ref="funder-001",
        is_opportunity=False,
        name="Project",
        reported_funder_name="Minnesota Pollution Control Agency",
    )
    _, records, _, _ = convert_agent_result(
        base.model_copy(update={"funding_records": [*base.funding_records, project]})
    )

    opportunity = next(item for item in records if item.is_opportunity)
    funded_project = next(item for item in records if not item.is_opportunity)

    assert funded_project.reported_funder_name == "Minnesota Pollution Control Agency"
    assert funded_project.project_tags == []
    assert funded_project.candidate_funders == []
    assert funded_project.selected_funder_id is None
    assert opportunity.project_tags == []
    assert opportunity.candidate_funders == []
    assert opportunity.selected_funder_id is None


def test_material_paths_use_criterion_template_and_chapter_references() -> None:
    """Nested records use their own identity instead of the opportunity link."""
    result = build_result().model_copy(
        update={
            "funder_templates": [
                FunderTemplateResearchResult(
                    template_ref="template-001",
                    funding_record_ref="opportunity-001",
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
                    funding_record_ref="opportunity-001",
                    criterion_type="evaluation",
                    label="Project quality",
                    requirement_text="Describe the proposed investment concept.",
                )
            ],
        }
    )
    funder, records, templates, criteria = convert_agent_result(result)

    paths = set(
        material_paths(
            funder=funder,
            funding_records=records,
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
    """Evidence cannot attach to a different current-run source by ordinal ID."""
    evidence = FieldEvidence(
        evidence_ref="prior-evidence",
        funding_record_ref="opportunity-001",
        target_path="funding_records[opportunity-001].status",
        source_ref="source-prior-content",
        quote_or_summary="Claim captured during an earlier run.",
    )
    conflict = ResearchConflictResult(
        target_path="funding_records[opportunity-001].status",
        candidate_values=["open", "closed"],
        evidence_refs=[evidence.evidence_ref],
        explanation="Earlier sources disagreed.",
    )
    result = build_result().model_copy(
        update={"evidence": [evidence], "conflicts": [conflict]}
    )
    now = datetime.now(timezone.utc)
    metadata = ResearchRunMetadata(
        pipeline_version="2.0",
        model_name="gpt-5.6-terra",
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
    assert any("referenced unknown source" in gap.reason for gap in bundle.gaps)
    assert any(
        "Conflict evidence was not retained" in gap.reason for gap in bundle.gaps
    )


def test_bundle_excludes_normalized_target_self_match_and_record_links() -> None:
    """The input project cannot reappear as a discovered funded-project row."""
    target_name = "Nicosia Solar-Storage & E-Mobility Project"
    target_project = CnbSimilarProjectSearchRequest(
        run_id="eee75fe1-30e7-5fc1-9bf8-d2a72fca00dd",
        funder_scope="cross_funder",
        project_name=target_name,
    )
    request = build_request(max_turns=1).model_copy(
        update={"target_project": target_project}
    )
    self_match = FundingRecordResearchResult(
        funding_record_ref="project-self",
        funder_ref="funder-001",
        is_opportunity=False,
        name="  NICOSIA solar storage e mobility project!! ",
        reported_funder_name="Example Funder",
    )
    comparison = FundingRecordResearchResult(
        funding_record_ref="project-comparison",
        funder_ref="funder-001",
        is_opportunity=False,
        name=f"{target_name} Phase 2",
        reported_funder_name="Example Funder",
    )
    self_evidence = FieldEvidence(
        evidence_ref="evidence-self",
        funding_record_ref="project-self",
        target_path="funding_records[project-self].name",
        source_ref="source-self",
        quote_or_summary="The page names the input project.",
    )
    comparison_evidence = FieldEvidence(
        evidence_ref="evidence-comparison",
        funding_record_ref="project-comparison",
        target_path="funding_records[project-comparison].name",
        source_ref="source-comparison",
        quote_or_summary="The page names a separate comparison project.",
    )
    cross_linked_evidence = FieldEvidence(
        evidence_ref="evidence-cross-linked",
        funding_record_ref="project-comparison",
        target_path="funding_records[project-self].status",
        source_ref="source-self",
        quote_or_summary="This path still points at the input project.",
    )
    result_data = build_result().model_dump(mode="python")
    result_data["funding_records"].extend(
        [self_match.model_dump(), comparison.model_dump()]
    )
    result_data["evidence"].extend(
        [
            self_evidence.model_dump(),
            comparison_evidence.model_dump(),
            cross_linked_evidence.model_dump(),
        ]
    )
    result_data["source_assessments"] = [
        SourceDocumentAssessment(
            source_ref="source-self",
            source_type="funded_project",
        ).model_dump(),
        SourceDocumentAssessment(
            source_ref="source-comparison",
            source_type="funded_project",
        ).model_dump(),
    ]
    result_data["gaps"] = [
        ResearchGap(
            target_path="funding_records[project-self].award_amount",
            reason="The input project's award was not published.",
        ).model_dump(),
        ResearchGap(
            target_path="funding_records[project-comparison].award_amount",
            reason="The comparison project's award was not published.",
        ).model_dump(),
    ]
    result_data["conflicts"] = [
        ResearchConflictResult(
            target_path="funding_records[project-self].status",
            candidate_values=["active", "complete"],
            evidence_refs=["evidence-self"],
            explanation="Input-project sources disagree.",
        ).model_dump(),
        ResearchConflictResult(
            target_path="funding_records[project-comparison].status",
            candidate_values=["active", "complete"],
            evidence_refs=[
                "evidence-self",
                "evidence-comparison",
                "evidence-cross-linked",
            ],
            explanation="The sources disagree.",
        ).model_dump(),
    ]
    result = build_result().model_validate(result_data)
    now = datetime.now(timezone.utc)
    metadata = ResearchRunMetadata(
        pipeline_version="2.0",
        model_name="gpt-5.6-terra",
        reasoning_effort="medium",
        prompt_sha256="prompt-hash",
        started_at=now,
        completed_at=now,
        duration_seconds=1,
        max_turns=1,
        turns_used=1,
        termination_reason="turn_limit",
    )
    captured_sources = [
        CapturedSource(
            source_ref=source_ref,
            url=f"https://example.com/{source_ref}",
            title=source_ref,
            content_hash=f"hash-{source_ref}",
            fetched_at=now,
            local_snapshot_path=f"sources/{source_ref}.md",
        )
        for source_ref in ("source-002", "source-self", "source-comparison")
    ]

    bundle = build_research_bundle(
        run_id="self-match-run",
        run_metadata=metadata,
        request=request,
        result=result,
        captured_sources=captured_sources,
        trace=[],
        bootstrap_gaps=[],
    )

    assert [record.funding_record_ref for record in bundle.funding_records] == [
        "opportunity-001",
        "project-comparison",
    ]
    assert {item.evidence_ref for item in bundle.evidence} == {
        "evidence-001",
        "evidence-comparison",
    }
    assert all("project-self" not in gap.target_path for gap in bundle.gaps)
    assert [item.target_path for item in bundle.conflicts] == [
        "funding_records[project-comparison].status"
    ]
    assert bundle.conflicts[0].evidence_refs == ["evidence-comparison"]
    assert {item.source_ref for item in bundle.sources} == {
        "source-002",
        "source-self",
        "source-comparison",
    }
    source_types = {item.source_ref: item.source_type for item in bundle.sources}
    assert source_types["source-self"] == "web_page"
    assert source_types["source-comparison"] == "funded_project"


def test_self_match_filter_preserves_generic_research_without_target() -> None:
    """Generic funder research is unchanged when no target project is supplied."""
    base = build_result()
    project = FundingRecordResearchResult(
        funding_record_ref="project-001",
        funder_ref="funder-001",
        is_opportunity=False,
        name="Nicosia Solar-Storage & E-Mobility Project",
    )
    result = base.model_copy(
        update={"funding_records": [*base.funding_records, project]}
    )

    filtered = exclude_target_project_self_matches(
        request=build_request(),
        result=result,
    )

    assert filtered is result
