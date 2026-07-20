"""Shared object builders for Concept Note Builder research tests."""

from app.models.cnb_research import (
    FieldEvidence,
    FunderProfileResearchResult,
    FundingOpportunityResearchAgentDraft,
    FundingOpportunityResearchRequest,
    FundingOpportunityResearchResult,
)


def build_request(*, max_turns: int = 3) -> FundingOpportunityResearchRequest:
    """Create a valid no-template request for tests."""
    return FundingOpportunityResearchRequest(
        funder_name="Example Funder",
        funder_url="https://funder.example/",
        program_name="Example Program",
        program_url="https://funder.example/program",
        application_template_url=None,
        max_turns=max_turns,
    )


def build_result() -> FundingOpportunityResearchResult:
    """Create a small fully typed model result."""
    return FundingOpportunityResearchResult(
        opportunity=FundingOpportunityResearchAgentDraft(
            funder_name="Example Funder",
            funder_url="https://funder.example/",
            funder_profile=FunderProfileResearchResult(),
            program_name="Example Program",
            program_url="https://funder.example/program",
            live_status="open",
        ),
        evidence=[
            FieldEvidence(
                evidence_ref="evidence-001",
                target_path="opportunity.live_status",
                source_ref="source-002",
                source_location="Status",
                quote_or_summary=(
                    "The official program page says applications are open."
                ),
            )
        ],
    )
