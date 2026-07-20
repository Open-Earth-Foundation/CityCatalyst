"""Tests for CNB funder research bundle conversion and material paths."""

from datetime import datetime, timezone

from app.models.cnb_research import (
    FieldEvidence,
    FinancialAmountResearchResult,
    FundedProjectActionDraft,
    FundedProjectDraft,
    FundingLinkResearchResult,
    ResearchConflictResult,
    ResearchRunMetadata,
)
from app.services.cnb_research_bundle import (
    build_research_bundle,
    convert_agent_opportunity,
    material_paths,
)
from app.tools.firecrawl import CapturedSource
from tests.cnb_research_helpers import build_request, build_result


def test_material_paths_use_each_record_own_reference() -> None:
    """Evidence paths do not use a foreign project ref as a child identity."""
    base = build_result()
    opportunity = base.opportunity.model_copy(
        update={
            "funded_projects": [
                FundedProjectDraft(project_ref="project-001", title="Project")
            ],
            "funded_project_actions": [
                FundedProjectActionDraft(
                    action_ref="action-001",
                    project_ref="project-001",
                    description="Prepare the project.",
                )
            ],
            "funding_links": [
                FundingLinkResearchResult(
                    funding_link_ref="link-001",
                    project_ref="project-001",
                    action_ref="action-001",
                    program_name="Example Program",
                    status="completed",
                )
            ],
            "financial_amounts": [
                FinancialAmountResearchResult(
                    amount_ref="amount-001",
                    project_ref="project-001",
                    action_ref="action-001",
                    program_name="Example Program",
                    amount=125000,
                    currency="USD",
                    amount_kind="individual_technical_assistance",
                    status="approved",
                    description="Project-preparation assistance.",
                )
            ],
        }
    )
    result = base.model_copy(update={"opportunity": opportunity})

    paths = set(material_paths(convert_agent_opportunity(result)))

    assert "opportunity.funded_project_actions[action-001].description" in paths
    assert "opportunity.funding_links[link-001].status" in paths
    assert "opportunity.financial_amounts[amount-001].amount_kind" in paths


def test_bundle_drops_prior_run_evidence_and_its_conflict_links() -> None:
    """Evidence cannot attach to a different current-run source by ordinal ID."""
    evidence = FieldEvidence(
        evidence_ref="prior-evidence",
        target_path="opportunity.live_status",
        source_ref="source-prior-content",
        quote_or_summary="Claim captured during an earlier run.",
    )
    conflict = ResearchConflictResult(
        target_path="opportunity.live_status",
        candidate_values=["open", "closed"],
        evidence_refs=[evidence.evidence_ref],
        explanation="Earlier sources disagreed.",
    )
    result = build_result().model_copy(
        update={"evidence": [evidence], "conflicts": [conflict]}
    )
    now = datetime.now(timezone.utc)
    metadata = ResearchRunMetadata(
        pipeline_version="1.2",
        model_name="gpt-5.6-terra",
        reasoning_effort="medium",
        prompt_sha256="prompt-hash",
        started_at=now,
        completed_at=now,
        duration_seconds=1,
        max_turns=1,
        turns_used=1,
        termination_reason="model_completed",
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
    assert any("Conflict evidence was not retained" in gap.reason for gap in bundle.gaps)
