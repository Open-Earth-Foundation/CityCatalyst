"""Tests for Concept Note Builder research request and result models."""

from collections.abc import Iterator

from openai.lib._pydantic import to_strict_json_schema
from pydantic import ValidationError
import pytest

from app.models.cnb_research import (
    FieldEvidence,
    FinancialAmountResearchResult,
    FundedProjectActionDraft,
    FundedProjectDraft,
    FundingLinkResearchResult,
    FundingOpportunityResearchAgentDraft,
    FundingOpportunityResearchRequest,
    FundingOpportunityResearchResult,
    FundingPipelineEntryResearchResult,
    ResearchConflictResult,
)
from tests.cnb_research_helpers import build_request, build_result


def _nested_keys(value: object) -> Iterator[str]:
    """Yield every key in a nested JSON-schema value."""
    if isinstance(value, dict):
        for key, child in value.items():
            yield key
            yield from _nested_keys(child)
    elif isinstance(value, list):
        for child in value:
            yield from _nested_keys(child)


def test_request_accepts_missing_template_and_rejects_zero_turns() -> None:
    """The optional template stays optional while max_turns remains positive."""
    assert build_request().application_template_url is None
    assert build_request().current_filled_object is None

    resumed_manifest = build_request().model_dump(mode="json")
    resumed_manifest["current_filled_object"] = build_result().model_dump(
        mode="json"
    )
    resumed_request = FundingOpportunityResearchRequest.model_validate(
        resumed_manifest
    )
    assert resumed_request.current_filled_object == build_result()

    with pytest.raises(ValidationError):
        build_request(max_turns=0)


def test_model_output_schema_avoids_unsupported_strict_json_features() -> None:
    """Keep the pinned OpenAI strict schema free of formats and regex patterns."""
    schema = to_strict_json_schema(FundingOpportunityResearchResult)
    schema_keys = set(_nested_keys(schema))

    assert "format" not in schema_keys
    assert "pattern" not in schema_keys


def test_financial_amount_requires_explicit_meaning() -> None:
    """Monetary facts distinguish assistance from downstream financing."""
    amount = FinancialAmountResearchResult(
        amount_ref="amount-001",
        project_ref="project-001",
        action_ref=None,
        program_name="Example Program",
        amount=125000,
        currency="USD",
        amount_kind="individual_technical_assistance",
        calendar_year=2026,
        status="approved",
        description="Technical assistance approved for project preparation.",
    )

    assert amount.amount_kind == "individual_technical_assistance"
    assert amount.calendar_year == 2026
    with pytest.raises(ValidationError):
        FinancialAmountResearchResult(
            **{
                **amount.model_dump(),
                "amount_kind": "unspecified_money",
            }
        )


def test_funding_records_use_calendar_year_only() -> None:
    """All funding record types expose one consistent year field."""
    for model in (
        FundingLinkResearchResult,
        FinancialAmountResearchResult,
        FundingPipelineEntryResearchResult,
    ):
        assert "calendar_year" in model.model_fields
        assert "fiscal_year" not in model.model_fields
        assert "award_year" not in model.model_fields


def test_agent_opportunity_rejects_duplicate_and_orphan_references() -> None:
    """Model-generated record keys must be unique and internally connected."""
    base = build_result().opportunity.model_dump(mode="json")

    with pytest.raises(ValidationError, match="project_ref values must be unique"):
        FundingOpportunityResearchAgentDraft.model_validate(
            {
                **base,
                "funded_projects": [
                    FundedProjectDraft(project_ref="duplicate", title="First"),
                    FundedProjectDraft(project_ref="duplicate", title="Second"),
                ],
            }
        )

    with pytest.raises(
        ValidationError,
        match="project_ref must reference a funded project",
    ):
        FundingOpportunityResearchAgentDraft.model_validate(
            {
                **base,
                "funded_project_actions": [
                    FundedProjectActionDraft(
                        action_ref="action-001",
                        project_ref="missing-project",
                        description="Prepare the project.",
                    )
                ],
            }
        )


def test_research_result_rejects_duplicate_and_unknown_evidence_refs() -> None:
    """Evidence identifiers remain unique and conflicts cannot cite missing rows."""
    base = build_result().model_dump(mode="json")
    duplicate = FieldEvidence(
        evidence_ref="evidence-001",
        target_path="opportunity.status",
        source_ref="source-003",
        quote_or_summary="A second claim with the same identifier.",
    )

    with pytest.raises(ValidationError, match="evidence_ref values must be unique"):
        FundingOpportunityResearchResult.model_validate(
            {**base, "evidence": [*base["evidence"], duplicate]}
        )

    conflict = ResearchConflictResult(
        target_path="opportunity.status",
        candidate_values=["open", "closed"],
        evidence_refs=["missing-evidence"],
        explanation="Sources disagree.",
    )
    with pytest.raises(
        ValidationError,
        match="must reference retained evidence",
    ):
        FundingOpportunityResearchResult.model_validate(
            {**base, "conflicts": [conflict]}
        )
