"""Tests for validated CNB reviewed-reference imports."""

from datetime import datetime, timezone
from uuid import UUID

import pytest

from app.models.cnb_research import (
    FieldEvidence,
    FunderDraft,
    FunderIdentityCandidate,
    FunderProfileDraft,
    FundingOpportunityResearchBundle,
    FundingRecordDraft,
    ResearchRunMetadata,
    ReviewState,
    SourceDocumentDraft,
)
from app.services.cnb_review_import import (
    ReviewFieldDecision,
    ReviewedReferenceData,
    ReviewedReferenceDataArtifact,
    prepare_reviewed_reference_import,
)
from tests.cnb_research_helpers import build_request

FUNDER_ID = UUID("11111111-1111-4111-8111-111111111111")
NOW = datetime(2026, 1, 1, tzinfo=timezone.utc)


def _build_pair(
    *,
    reviewed_project_name: str,
    reviewed_summary: str | None = None,
    reviewed_city: str | None = None,
) -> tuple[FundingOpportunityResearchBundle, ReviewedReferenceDataArtifact]:
    """Build a paired approved artifact with one evidence-backed funded project."""
    funder = FunderDraft(
        funder_ref="funder-001",
        name="Example Funder",
        profile=FunderProfileDraft(),
    )
    opportunity = FundingRecordDraft(
        funding_record_ref="opportunity-001",
        funder_ref=funder.funder_ref,
        is_opportunity=True,
        name="Example Program",
    )
    candidate = FunderIdentityCandidate(
        funder_id=FUNDER_ID,
        name=funder.name,
        match_reason="The reported and canonical funder names match.",
    )
    researched_project = FundingRecordDraft(
        funding_record_ref="project-001",
        funder_ref=funder.funder_ref,
        is_opportunity=False,
        name="Evidence-backed name",
        candidate_funders=[candidate],
    )
    evidence = FieldEvidence(
        evidence_ref="evidence-project-name",
        funding_record_ref=researched_project.funding_record_ref,
        target_path="funding_records[project-001].name",
        source_ref="source-project",
        quote_or_summary="Example Funder supported Evidence-backed name.",
    )
    research = FundingOpportunityResearchBundle(
        schema_version="2.0",
        run_id="run-001",
        run_metadata=ResearchRunMetadata(
            pipeline_version="2.0",
            model_name="test-model",
            reasoning_effort="medium",
            prompt_sha256="prompt-hash",
            started_at=NOW,
            completed_at=NOW,
            duration_seconds=1,
            max_turns=1,
            turns_used=1,
            termination_reason="coverage_complete",
        ),
        request=build_request(max_turns=1),
        funder=funder,
        funding_records=[opportunity, researched_project],
        sources=[
            SourceDocumentDraft(
                source_ref="source-project",
                source_type="official_project_page",
                url="https://funder.example/project",
                title="Evidence-backed project",
                content_hash="source-hash",
                fetched_at=NOW,
                local_snapshot_path="sources/source-project.md",
            )
        ],
        evidence=[evidence],
        review=ReviewState(status="pending_review"),
    )
    reviewed_project = researched_project.model_copy(
        update={
            "name": reviewed_project_name,
            "summary": reviewed_summary,
            "city": reviewed_city,
            "candidate_funders": [],
            "selected_funder_id": FUNDER_ID,
        }
    )
    review = ReviewedReferenceDataArtifact(
        schema_version="2.0",
        update_type="cnb_reference_data_review",
        run_id=research.run_id,
        saved_at=NOW,
        review=ReviewState(status="approved"),
        decisions=[
            ReviewFieldDecision(
                target_path="funding_records[project-001].name",
                selected=True,
                original_value=researched_project.name,
                reviewed_value=researched_project.name,
                evidence_refs=[evidence.evidence_ref],
            ),
            ReviewFieldDecision(
                target_path="funding_records[project-001].selected_funder_id",
                selected=True,
                original_value=None,
                reviewed_value=str(FUNDER_ID),
            ),
            ReviewFieldDecision(
                target_path="funding_records[project-001].summary",
                selected=False,
                original_value=None,
                reviewed_value=None,
            ),
        ],
        reviewed_reference_data=ReviewedReferenceData(
            funder=funder,
            funding_records=[opportunity, reviewed_project],
        ),
    )
    return research, review


def test_import_accepts_reviewed_data_that_matches_selected_decisions() -> None:
    research, review = _build_pair(reviewed_project_name="Evidence-backed name")

    payload = prepare_reviewed_reference_import(
        research=research,
        review=review,
        known_funder_ids={FUNDER_ID},
    )

    assert payload.projects[0].record.name == "Evidence-backed name"


def test_import_rejects_data_that_disagrees_with_selected_decision() -> None:
    research, review = _build_pair(reviewed_project_name="Different unreviewed name")

    with pytest.raises(
        ValueError,
        match="reviewed_reference_data does not match selected decision",
    ):
        prepare_reviewed_reference_import(
            research=research,
            review=review,
            known_funder_ids={FUNDER_ID},
        )


def test_import_rejects_data_for_an_unselected_decision() -> None:
    research, review = _build_pair(
        reviewed_project_name="Evidence-backed name",
        reviewed_summary="Unselected summary",
    )

    with pytest.raises(
        ValueError,
        match="reviewed_reference_data includes an unselected decision",
    ):
        prepare_reviewed_reference_import(
            research=research,
            review=review,
            known_funder_ids={FUNDER_ID},
        )


def test_import_rejects_populated_data_without_a_decision() -> None:
    research, review = _build_pair(
        reviewed_project_name="Evidence-backed name",
        reviewed_city="Unreviewed city",
    )

    with pytest.raises(
        ValueError,
        match="reviewed_reference_data field has no selected decision",
    ):
        prepare_reviewed_reference_import(
            research=research,
            review=review,
            known_funder_ids={FUNDER_ID},
        )
