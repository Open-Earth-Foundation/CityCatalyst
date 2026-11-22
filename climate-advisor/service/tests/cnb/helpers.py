"""Shared object builders for Concept Note Builder research tests."""

from types import SimpleNamespace

from app.models.cnb.research import (
    FieldEvidence,
    FunderProfileResearchResult,
    FunderResearchResult,
    FundingOpportunityResearchRequest,
    FundingOpportunityResearchResult,
    FundingOpportunityResearchResultRow,
)


class RecordingResponses:
    """Fake OpenAI Responses API that records parse() calls and returns one result."""

    def __init__(self, parsed: object) -> None:
        self.parsed = parsed
        self.calls: list[dict[str, object]] = []

    def parse(self, **kwargs: object) -> SimpleNamespace:
        self.calls.append(kwargs)
        return SimpleNamespace(
            id=f"response-{len(self.calls):03d}", output=[], output_parsed=self.parsed
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
        funder=FunderResearchResult(
            funder_ref="funder-001",
            name="Example Funder",
            profile=FunderProfileResearchResult(),
        ),
        funding_opportunities=[
            FundingOpportunityResearchResultRow(
                funding_opportunity_ref="opportunity-001",
                funder_ref="funder-001",
                name="Example Program",
                status="open",
            )
        ],
        funded_projects=[],
        evidence=[
            FieldEvidence(
                evidence_ref="evidence-001",
                funding_opportunity_ref="opportunity-001",
                target_path="funding_opportunities[opportunity-001].status",
                source_ref="source-002",
                source_location="Status",
                quote_or_summary=(
                    "The official program page says applications are open."
                ),
            )
        ],
    )
