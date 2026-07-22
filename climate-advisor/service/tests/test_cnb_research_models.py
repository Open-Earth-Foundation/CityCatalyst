"""Tests for Concept Note Builder research request and result models."""

from collections.abc import Iterator
from uuid import UUID, uuid4

from openai.lib._pydantic import to_strict_json_schema
from pydantic import ValidationError
import pytest

from app.models.cnb_research import (
    CanonicalFunder,
    FieldEvidence,
    FundingRecordDraft,
    FunderTemplateResearchResult,
    FunderIdentityCandidate,
    FundingOpportunityResearchRequest,
    FundingOpportunityResearchResult,
    FundingRecordResearchResult,
    ResearchConflictResult,
)
from app.models.cnb_similar_projects import CnbSimilarProjectSearchRequest
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
    assert build_request().target_funded_projects == 1

    resumed_manifest = build_request().model_dump(mode="json")
    resumed_manifest["current_filled_object"] = build_result().model_dump(mode="json")
    resumed_request = FundingOpportunityResearchRequest.model_validate(resumed_manifest)
    assert resumed_request.current_filled_object == build_result()

    with pytest.raises(ValidationError):
        build_request(max_turns=0)
    with pytest.raises(ValidationError):
        build_request(target_funded_projects=0)
    with pytest.raises(ValidationError):
        build_request(target_funded_projects=51)


def test_request_defaults_to_fifteen_turns() -> None:
    """A manifest without overrides should receive the production defaults."""
    request = FundingOpportunityResearchRequest(
        funder_name="Example Funder",
        funder_url="https://funder.example/",
        program_name="Example Program",
        program_url="https://funder.example/program",
    )

    assert request.max_turns == 15
    assert request.target_funded_projects == 1
    assert request.target_project is None


def test_request_accepts_cross_funder_target_project_without_funder_id() -> None:
    """A project profile can guide research without canonical funder data."""
    manifest = build_request().model_dump(mode="json")
    manifest["target_project"] = CnbSimilarProjectSearchRequest(
        run_id=uuid4(),
        funder_scope="cross_funder",
        project_name="Nicosia municipal energy and mobility project",
        project_summary="Solar, storage, and charging on municipal sites.",
        category="Renewable energy and sustainable urban mobility",
        country="Cyprus",
        interventions=["Municipal solar", "Battery storage"],
        project_tags=["municipal-solar", "battery-storage"],
        limit=50,
    ).model_dump(mode="json")

    request = FundingOpportunityResearchRequest.model_validate(manifest)

    assert request.target_project is not None
    assert request.target_project.funder_id is None
    assert request.target_project.project_name == (
        "Nicosia municipal energy and mobility project"
    )
    assert request.target_project.country == "Cyprus"
    assert request.target_project.interventions == [
        "Municipal solar",
        "Battery storage",
    ]


def test_model_output_schema_avoids_unsupported_strict_json_features() -> None:
    """Keep the pinned OpenAI strict schema free of formats and regex patterns."""
    schema = to_strict_json_schema(FundingOpportunityResearchResult)
    schema_keys = set(_nested_keys(schema))

    assert "format" not in schema_keys
    assert "pattern" not in schema_keys


def test_funding_record_matches_architecture_year_and_award_shape() -> None:
    """A funded project keeps action and award information in one record."""
    record = FundingRecordResearchResult(
        funding_record_ref="project-001",
        funder_ref="funder-001",
        is_opportunity=False,
        name="Funded project",
        applicant_name="Example City",
        reported_funder_name="Minnesota Pollution Control Agency",
        interventions=["Prepare a retrofit investment concept"],
        award_amount=125000,
        currency="USD",
        award_year=2026,
        status="awarded",
        summary="The award funded project preparation.",
    )

    assert record.award_year == 2026
    assert record.reported_funder_name == "Minnesota Pollution Control Agency"
    assert "calendar_year" not in record.model_fields
    assert "opportunity" not in FundingOpportunityResearchResult.model_fields
    assert {
        "funder",
        "funding_records",
        "funder_templates",
        "funder_criteria",
    }.issubset(FundingOpportunityResearchResult.model_fields)
    for removed_collection in (
        "funded_projects",
        "funded_project_actions",
        "funding_links",
        "financial_amounts",
        "pipeline_entries",
    ):
        assert removed_collection not in FundingRecordResearchResult.model_fields
    for reviewer_only_field in (
        "project_tags",
        "candidate_funders",
        "selected_funder_id",
    ):
        assert reviewer_only_field not in FundingRecordResearchResult.model_fields


def test_review_only_funder_fields_live_on_draft_records() -> None:
    """Reviewer-only funder fields stay off model output but exist on drafts."""
    draft = FundingRecordDraft(
        funding_record_ref="project-001",
        funder_ref="funder-001",
        is_opportunity=False,
        name="Funded project",
        reported_funder_name="Minnesota Pollution Control Agency",
    )

    assert draft.project_tags == []
    assert draft.candidate_funders == []
    assert draft.selected_funder_id is None
    assert draft.reported_funder_name == "Minnesota Pollution Control Agency"


def test_canonical_funder_candidates_require_uuid_ids() -> None:
    """Canonical funder identities use UUIDs in review-facing models."""
    canonical = CanonicalFunder(
        funder_id="7eb0df43-db16-4eb7-88f9-92b5884b617f",
        name="Minnesota Pollution Control Agency",
    )
    candidate = FunderIdentityCandidate(
        funder_id="7eb0df43-db16-4eb7-88f9-92b5884b617f",
        name="Minnesota Pollution Control Agency",
        match_reason="Exact reported name match",
    )

    assert canonical.funder_id == UUID("7eb0df43-db16-4eb7-88f9-92b5884b617f")
    assert candidate.funder_id == UUID("7eb0df43-db16-4eb7-88f9-92b5884b617f")

    with pytest.raises(ValidationError):
        CanonicalFunder(name="Invalid UUID", funder_id="not-a-uuid")


def test_result_requires_one_opportunity_and_valid_table_references() -> None:
    """The offline schema preserves one opportunity and its table relationships."""
    base = build_result().model_dump(mode="json")
    opportunity = base["funding_records"][0]

    with pytest.raises(ValidationError, match="values must be unique"):
        FundingOpportunityResearchResult.model_validate(
            {**base, "funding_records": [opportunity, opportunity]}
        )

    with pytest.raises(ValidationError, match="exactly one opportunity"):
        FundingOpportunityResearchResult.model_validate(
            {
                **base,
                "funding_records": [{**opportunity, "is_opportunity": False}],
            }
        )

    funded_project = FundingRecordResearchResult(
        funding_record_ref="project-001",
        funder_ref="funder-001",
        is_opportunity=False,
        name="Funded project",
    )
    with pytest.raises(
        ValidationError,
        match="must reference the opportunity record",
    ):
        FundingOpportunityResearchResult.model_validate(
            {
                **base,
                "funding_records": [opportunity, funded_project],
                "funder_templates": [
                    FunderTemplateResearchResult(
                        template_ref="template-001",
                        funding_record_ref="project-001",
                        template_name="Application",
                    )
                ],
            }
        )


def test_research_result_rejects_unknown_record_and_evidence_refs() -> None:
    """Evidence must link to a record and conflicts cannot cite missing evidence."""
    base = build_result().model_dump(mode="json")
    unknown_record_evidence = FieldEvidence(
        evidence_ref="evidence-002",
        funding_record_ref="missing-record",
        target_path="funding_records[missing-record].status",
        source_ref="source-003",
        quote_or_summary="A claim for a missing record.",
    )
    with pytest.raises(
        ValidationError,
        match="must reference a funding record",
    ):
        FundingOpportunityResearchResult.model_validate(
            {**base, "evidence": [unknown_record_evidence]}
        )

    conflict = ResearchConflictResult(
        target_path="funding_records[opportunity-001].status",
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
