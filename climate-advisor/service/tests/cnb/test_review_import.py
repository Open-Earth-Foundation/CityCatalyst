"""Tests for validated CNB reviewed-reference imports."""

from datetime import datetime, timezone
from unittest.mock import MagicMock
from uuid import UUID

import pytest

from app.models.cnb.research import (
    FieldEvidence,
    FunderDraft,
    FundedProjectDraft,
    FunderIdentityCandidate,
    FunderProfileDraft,
    FundingOpportunityResearchBundle,
    FundingOpportunityDraft,
    ResearchRunMetadata,
    ReviewState,
    SourceDocumentDraft,
)
from app.services.cnb.review_import import (
    PostgresReviewedReferenceDataWriter,
    ReviewFieldDecision,
    ReviewedReferenceData,
    ReviewedReferenceDataArtifact,
    prepare_reviewed_reference_import,
)
from tests.cnb.helpers import build_request

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
    opportunity = FundingOpportunityDraft(
        funding_opportunity_ref="opportunity-001",
        funder_ref=funder.funder_ref,
        name="Example Program",
    )
    candidate = FunderIdentityCandidate(
        funder_id=FUNDER_ID,
        name=funder.name,
        match_reason="The reported and canonical funder names match.",
    )
    researched_project = FundedProjectDraft(
        funded_project_ref="project-001",
        funder_ref=funder.funder_ref,
        name="Evidence-backed name",
        candidate_funders=[candidate],
    )
    evidence = FieldEvidence(
        evidence_ref="evidence-project-name",
        funded_project_ref=researched_project.funded_project_ref,
        target_path="funded_projects[project-001].name",
        source_ref="source-project",
        quote_or_summary="Example Funder supported Evidence-backed name.",
    )
    research = FundingOpportunityResearchBundle(
        schema_version="3.0",
        run_id="run-001",
        run_metadata=ResearchRunMetadata(
            pipeline_version="3.0",
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
        funding_opportunities=[opportunity],
        funded_projects=[researched_project],
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
        schema_version="3.0",
        update_type="cnb_reference_data_review",
        run_id=research.run_id,
        saved_at=NOW,
        review=ReviewState(status="approved"),
        decisions=[
            ReviewFieldDecision(
                target_path="funded_projects[project-001].name",
                selected=True,
                original_value=researched_project.name,
                reviewed_value=researched_project.name,
                evidence_refs=[evidence.evidence_ref],
            ),
            ReviewFieldDecision(
                target_path="funded_projects[project-001].selected_funder_id",
                selected=True,
                original_value=None,
                reviewed_value=str(FUNDER_ID),
            ),
            ReviewFieldDecision(
                target_path="funded_projects[project-001].summary",
                selected=False,
                original_value=None,
                reviewed_value=None,
            ),
        ],
        reviewed_reference_data=ReviewedReferenceData(
            funder=funder,
            funding_opportunities=[opportunity],
            funded_projects=[reviewed_project],
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


def test_postgres_writer_reuses_project_and_evidence_on_retry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    research, review = _build_pair(reviewed_project_name="Evidence-backed name")
    payload = prepare_reviewed_reference_import(
        research=research,
        review=review,
        known_funder_ids={FUNDER_ID},
    )
    record_id = UUID("22222222-2222-4222-8222-222222222222")
    source_id = UUID("33333333-3333-4333-8333-333333333333")
    connection = MagicMock()
    connection.__enter__.return_value = connection
    cursor = connection.cursor.return_value.__enter__.return_value
    cursor.fetchone.side_effect = [
        (record_id,),
        (source_id,),
        None,
        (record_id,),
    ]
    writer = PostgresReviewedReferenceDataWriter("postgresql://example.invalid/cnb")
    monkeypatch.setattr(writer, "_connect", lambda: connection)

    first_ids = writer.import_projects(payload)
    retried_ids = writer.import_projects(payload)

    assert retried_ids == first_ids
    statements = [
        " ".join(call.args[0].split()) for call in cursor.execute.call_args_list
    ]
    project_insert_calls = [
        call
        for call in cursor.execute.call_args_list
        if call.args[0].startswith("INSERT INTO funded_projects")
    ]
    assert len(project_insert_calls) == 2
    assert all(
        "ON CONFLICT (source_run_id, source_record_ref) DO NOTHING" in call.args[0]
        for call in project_insert_calls
    )
    assert all(
        call.args[0].count("%s") == len(call.args[1])
        for call in project_insert_calls
    )
    assert sum(
        statement.startswith("INSERT INTO source_documents")
        for statement in statements
    ) == 1
    assert any(
        "ON CONFLICT (content_hash, url) DO UPDATE" in statement
        for statement in statements
    )
    assert sum(
        statement.startswith("INSERT INTO funding_evidence")
        for statement in statements
    ) == 1
