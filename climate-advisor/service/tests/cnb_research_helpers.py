"""Shared object builders for Concept Note Builder research tests."""

from datetime import datetime, timezone
from uuid import UUID

from app.models.cnb_research import (
    FieldEvidence,
    FunderDraft,
    FunderIdentityCandidate,
    FunderProfileResearchResult,
    FunderProfileDraft,
    FunderResearchResult,
    FundingOpportunityResearchBundle,
    FundingOpportunityResearchRequest,
    FundingOpportunityResearchResult,
    FundingRecordDraft,
    FundingRecordResearchResult,
    ResearchRunMetadata,
    ReviewState,
    SourceDocumentDraft,
)
from app.services.cnb_review_import import (
    ReviewFieldDecision,
    ReviewedReferenceData,
    ReviewedReferenceDataArtifact,
)

TEST_FUNDER_ID = UUID("11111111-1111-4111-8111-111111111111")


def build_request(
    *,
    max_turns: int = 3,
    target_funded_projects: int = 1,
) -> FundingOpportunityResearchRequest:
    """Create a valid no-template request for tests."""
    return FundingOpportunityResearchRequest(
        funder_name="Example Funder",
        funder_url="https://funder.example/",
        program_name="Example Program",
        program_url="https://funder.example/program",
        application_template_url=None,
        target_funded_projects=target_funded_projects,
        max_turns=max_turns,
    )


def build_result() -> FundingOpportunityResearchResult:
    """Create a small fully typed model result."""
    return FundingOpportunityResearchResult(
        funder=FunderResearchResult(
            funder_ref="funder-001",
            name="Example Funder",
            profile=FunderProfileResearchResult(),
        ),
        funding_records=[
            FundingRecordResearchResult(
                funding_record_ref="opportunity-001",
                funder_ref="funder-001",
                is_opportunity=True,
                name="Example Program",
                status="open",
            )
        ],
        evidence=[
            FieldEvidence(
                evidence_ref="evidence-001",
                funding_record_ref="opportunity-001",
                target_path="funding_records[opportunity-001].status",
                source_ref="source-002",
                source_location="Status",
                quote_or_summary=(
                    "The official program page says applications are open."
                ),
            )
        ],
    )


def build_review_pair(
    *,
    run_id: str = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    selected_funder_id: UUID = TEST_FUNDER_ID,
) -> tuple[FundingOpportunityResearchBundle, ReviewedReferenceDataArtifact]:
    """Create one approved, source-grounded project review pair."""
    now = datetime.now(timezone.utc)
    opportunity = FundingRecordDraft(
        funding_record_ref="opportunity-001",
        funder_ref="funder-001",
        is_opportunity=True,
        name="Example Program",
    )
    project = FundingRecordDraft(
        funding_record_ref="project-001",
        funder_ref="funder-001",
        is_opportunity=False,
        name="Flood resilience project",
        reported_funder_name="Example Funder",
        status="awarded",
        summary="A city flood resilience award.",
        candidate_funders=[
            FunderIdentityCandidate(
                funder_id=selected_funder_id,
                name="Example Funder",
                match_reason="Exact reported name match",
            )
        ],
    )
    source = SourceDocumentDraft(
        source_ref="source-001",
        source_type="award_page",
        url="https://funder.example/award",
        title="Award announcement",
        content_hash="source-hash",
        fetched_at=now,
        local_snapshot_path="sources/source-001.md",
    )
    evidence = FieldEvidence(
        evidence_ref="evidence-001",
        funding_record_ref="project-001",
        target_path="funding_records[project-001].status",
        source_ref="source-001",
        source_location="Awards",
        quote_or_summary="The official page identifies the project as awarded.",
    )
    funder = FunderDraft(
        funder_ref="funder-001",
        name="Example Funder",
        profile=FunderProfileDraft(),
    )
    research = FundingOpportunityResearchBundle(
        schema_version="2.0",
        run_id=run_id,
        run_metadata=ResearchRunMetadata(
            pipeline_version="2.0",
            model_name="test-model",
            reasoning_effort="medium",
            prompt_sha256="prompt-hash",
            started_at=now,
            completed_at=now,
            duration_seconds=1,
            max_turns=1,
            turns_used=1,
            termination_reason="coverage_complete",
        ),
        request=build_request(max_turns=1),
        funder=funder,
        funding_records=[opportunity, project],
        sources=[source],
        evidence=[evidence],
        review=ReviewState(status="pending_review"),
    )
    review = ReviewedReferenceDataArtifact(
        schema_version="2.0",
        update_type="cnb_reference_data_review",
        run_id=run_id,
        saved_at=now,
        review=ReviewState(
            status="approved",
            reviewer="Data reviewer",
            reviewed_at=now,
        ),
        decisions=[
            ReviewFieldDecision(
                target_path=evidence.target_path,
                selected=True,
                original_value="awarded",
                reviewed_value="awarded",
                evidence_refs=[evidence.evidence_ref],
            )
        ],
        reviewed_reference_data=ReviewedReferenceData(
            funder=funder,
            funding_records=[
                opportunity,
                project.model_copy(
                    update={
                        "selected_funder_id": selected_funder_id,
                        "project_tags": [" Flood Risk ", "flood_risk", "CITY LED"],
                    }
                ),
            ],
        ),
    )
    return research, review
