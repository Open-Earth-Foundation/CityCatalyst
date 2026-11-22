"""Tests for Concept Note Builder research request and result models."""

from collections.abc import Iterator

from openai.lib._pydantic import to_strict_json_schema
from pydantic import ValidationError
import pytest

from app.models.cnb.research import (
    FieldEvidence,
    FunderTemplateResearchResult,
    FundingOpportunityResearchRequest,
    FundingOpportunityResearchResult,
    FundedProjectResearchResult,
    ResearchConflictResult,
)
from tests.cnb.helpers import build_request, build_result


def _nested_keys(value: object) -> Iterator[str]:
    """Yield every key in a nested JSON-schema value."""
    if isinstance(value, dict):
        for key, child in value.items():
            yield key
            yield from _nested_keys(child)
    elif isinstance(value, list):
        for child in value:
            yield from _nested_keys(child)


def test_resumed_manifest_round_trips_the_filled_object() -> None:
    """A resumed manifest carries the earlier partial result back in."""
    resumed_manifest = build_request().model_dump(mode="json")
    resumed_manifest["current_filled_object"] = build_result().model_dump(mode="json")
    resumed_request = FundingOpportunityResearchRequest.model_validate(resumed_manifest)
    assert resumed_request.current_filled_object == build_result()


def test_model_output_schema_avoids_unsupported_strict_json_features() -> None:
    """Keep the pinned OpenAI strict schema free of formats and regex patterns."""
    schema = to_strict_json_schema(FundingOpportunityResearchResult)
    schema_keys = set(_nested_keys(schema))

    assert "format" not in schema_keys
    assert "pattern" not in schema_keys


def test_result_requires_one_opportunity_and_valid_table_references() -> None:
    """The offline schema preserves one opportunity and its table relationships."""
    base = build_result().model_dump(mode="json")
    opportunity = base["funding_opportunities"][0]

    with pytest.raises(ValidationError, match="values must be unique"):
        FundingOpportunityResearchResult.model_validate(
            {**base, "funding_opportunities": [opportunity, opportunity]}
        )

    with pytest.raises(ValidationError, match="exactly one opportunity"):
        FundingOpportunityResearchResult.model_validate(
            {
                **base,
                "funding_opportunities": [],
            }
        )

    funded_project = FundedProjectResearchResult(
        funded_project_ref="project-001",
        funder_ref="funder-001",
        name="Funded project",
    )
    with pytest.raises(
        ValidationError,
        match="must reference a funding opportunity",
    ):
        FundingOpportunityResearchResult.model_validate(
            {
                **base,
                "funded_projects": [funded_project],
                "funder_templates": [
                    FunderTemplateResearchResult(
                        template_ref="template-001",
                        funding_opportunity_ref="project-001",
                        template_name="Application",
                    )
                ],
            }
        )


def test_research_result_rejects_unknown_parent_and_evidence_refs() -> None:
    """Evidence must link to an entity and conflicts cannot cite missing evidence."""
    base = build_result().model_dump(mode="json")
    unknown_record_evidence = FieldEvidence(
        evidence_ref="evidence-002",
        funded_project_ref="missing-project",
        target_path="funded_projects[missing-project].status",
        source_ref="source-003",
        quote_or_summary="A claim for a missing record.",
    )
    with pytest.raises(
        ValidationError,
        match="must reference a funded project",
    ):
        FundingOpportunityResearchResult.model_validate(
            {**base, "evidence": [unknown_record_evidence]}
        )

    conflict = ResearchConflictResult(
        target_path="funding_opportunities[opportunity-001].status",
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
