"""Tests for run-ID pairing and reviewed CNB reference-data import validation."""

from datetime import datetime, timezone
from uuid import UUID

from pydantic import ValidationError
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
    PostgresReviewedReferenceDataWriter,
    ReviewFieldDecision,
    ReviewedReferenceData,
    ReviewedReferenceDataArtifact,
    prepare_reviewed_reference_import,
)
from tests.cnb_research_helpers import build_request

FUNDER_ID = UUID("11111111-1111-4111-8111-111111111111")
OTHER_FUNDER_ID = UUID("22222222-2222-4222-8222-222222222222")
SOURCE_DOCUMENT_ID = UUID("33333333-3333-4333-8333-333333333333")
FUNDING_RECORD_ID = UUID("44444444-4444-4444-8444-444444444444")


def build_pair() -> tuple[
    FundingOpportunityResearchBundle,
    ReviewedReferenceDataArtifact,
]:
    """Create one approved, source-grounded funded-project review pair."""
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
                funder_id=FUNDER_ID,
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
    research = FundingOpportunityResearchBundle(
        schema_version="2.0",
        run_id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        run_metadata=ResearchRunMetadata(
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
        ),
        request=build_request(max_turns=1),
        funder=FunderDraft(
            funder_ref="funder-001",
            name="Example Funder",
            profile=FunderProfileDraft(),
        ),
        funding_records=[opportunity, project],
        sources=[source],
        evidence=[evidence],
        review=ReviewState(status="pending_review"),
    )
    reviewed_project = project.model_copy(
        update={
            "selected_funder_id": FUNDER_ID,
            "project_tags": [" Flood Risk ", "flood_risk", "CITY LED"],
        }
    )
    review = ReviewedReferenceDataArtifact(
        schema_version="2.0",
        update_type="cnb_reference_data_review",
        run_id=research.run_id,
        saved_at=now,
        review=ReviewState(
            status="approved",
            reviewer="Data reviewer",
            reviewed_at=now,
        ),
        decisions=[
            ReviewFieldDecision(
                target_path="funding_records[project-001].status",
                selected=True,
                original_value="awarded",
                reviewed_value="awarded",
                evidence_refs=["evidence-001"],
            )
        ],
        reviewed_reference_data=ReviewedReferenceData(
            funder=research.funder,
            funding_records=[opportunity, reviewed_project],
        ),
    )
    return research, review


def test_import_pairs_only_by_run_id_and_normalizes_reviewed_tags() -> None:
    """An approved equal-run pair produces only the funded project payload."""
    research, review = build_pair()

    payload = prepare_reviewed_reference_import(
        research=research,
        review=review,
        known_funder_ids={FUNDER_ID},
    )

    assert payload.run_id == research.run_id
    assert len(payload.projects) == 1
    assert payload.projects[0].record.is_opportunity is False
    assert payload.projects[0].record.project_tags == ["flood-risk", "city-led"]
    assert payload.projects[0].evidence[0].evidence.evidence_ref == "evidence-001"


def test_import_rejects_mismatched_run_ids() -> None:
    """Pairing never falls back to a file hash or filename."""
    research, review = build_pair()
    review = review.model_copy(update={"run_id": "different-run"})

    with pytest.raises(ValueError, match="research.run_id must equal review.run_id"):
        prepare_reviewed_reference_import(
            research=research,
            review=review,
            known_funder_ids={FUNDER_ID},
        )


def test_review_artifact_rejects_duplicate_record_or_decision_identity() -> None:
    """Hand-edited review files cannot make project or field identity ambiguous."""
    _, review = build_pair()
    reviewed_payload = review.reviewed_reference_data.model_dump(mode="json")
    reviewed_payload["funding_records"].append(
        reviewed_payload["funding_records"][1]
    )
    with pytest.raises(ValidationError, match="funding_record_ref values"):
        ReviewedReferenceData.model_validate(reviewed_payload)

    payload = review.model_dump(mode="json")
    payload["decisions"].append(payload["decisions"][0])
    with pytest.raises(ValidationError, match="decision target_path values"):
        ReviewedReferenceDataArtifact.model_validate(payload)


@pytest.mark.parametrize("failure", ["missing", "unproposed", "unknown"])
def test_import_rejects_invalid_canonical_funder_selection(failure: str) -> None:
    """The reviewer must choose one proposed ID that still exists."""
    research, review = build_pair()
    records = list(review.reviewed_reference_data.funding_records)
    selected_id = None if failure == "missing" else OTHER_FUNDER_ID
    records[1] = records[1].model_copy(update={"selected_funder_id": selected_id})
    if failure == "unknown":
        research_project = research.funding_records[1].model_copy(
            update={
                "candidate_funders": [
                    FunderIdentityCandidate(
                        funder_id=OTHER_FUNDER_ID,
                        name="Other Funder",
                        match_reason="Normalized name match",
                    )
                ]
            }
        )
        research = research.model_copy(
            update={"funding_records": [research.funding_records[0], research_project]}
        )
    review = review.model_copy(
        update={
            "reviewed_reference_data": review.reviewed_reference_data.model_copy(
                update={"funding_records": records}
            )
        }
    )

    expected = {
        "missing": "requires selected_funder_id",
        "unproposed": "was not proposed",
        "unknown": "selected funder does not exist",
    }[failure]
    with pytest.raises(ValueError, match=expected):
        prepare_reviewed_reference_import(
            research=research,
            review=review,
            known_funder_ids={FUNDER_ID},
        )


def test_import_requires_approved_review_and_retained_evidence() -> None:
    """Pending reviews and unsupported funded projects never reach persistence."""
    research, review = build_pair()
    pending = review.model_copy(update={"review": ReviewState(status="pending_review")})
    with pytest.raises(ValueError, match="must be approved"):
        prepare_reviewed_reference_import(
            research=research,
            review=pending,
            known_funder_ids={FUNDER_ID},
        )

    research = research.model_copy(update={"evidence": []})
    review = review.model_copy(
        update={
            "decisions": [
                review.decisions[0].model_copy(update={"evidence_refs": []})
            ]
        }
    )
    with pytest.raises(ValueError, match="requires retained evidence"):
        prepare_reviewed_reference_import(
            research=research,
            review=review,
            known_funder_ids={FUNDER_ID},
        )


def test_import_respects_reviewed_evidence_selection() -> None:
    """Deselected evidence is not silently persisted by the importer."""
    research, review = build_pair()
    decision = review.decisions[0].model_copy(update={"selected": False})
    review = review.model_copy(update={"decisions": [decision]})

    with pytest.raises(ValueError, match="requires retained evidence"):
        prepare_reviewed_reference_import(
            research=research,
            review=review,
            known_funder_ids={FUNDER_ID},
        )


def test_import_rejects_evidence_attached_to_an_unrelated_decision() -> None:
    """A tampered review cannot retain evidence through an unrelated field."""
    research, review = build_pair()
    decision = review.decisions[0].model_copy(
        update={"target_path": "funder.name"}
    )
    review = review.model_copy(update={"decisions": [decision]})

    with pytest.raises(ValueError, match="references unrelated evidence"):
        prepare_reviewed_reference_import(
            research=research,
            review=review,
            known_funder_ids={FUNDER_ID},
        )


def test_postgres_funder_lookup_casts_input_array_to_uuid(monkeypatch) -> None:
    """The managed-table lookup should not compare a UUID column with text[]."""

    class FakeCursor:
        def __init__(self) -> None:
            self.query = ""
            self.parameters: tuple[list[str]] | None = None

        def __enter__(self) -> "FakeCursor":
            return self

        def __exit__(self, *args: object) -> None:
            return None

        def execute(self, query: str, parameters: tuple[list[str]]) -> None:
            self.query = query
            self.parameters = parameters

        def fetchall(self) -> list[tuple[UUID]]:
            return [(FUNDER_ID,)]

    class FakeConnection:
        def __init__(self, cursor: FakeCursor) -> None:
            self._cursor = cursor

        def __enter__(self) -> "FakeConnection":
            return self

        def __exit__(self, *args: object) -> None:
            return None

        def cursor(self) -> FakeCursor:
            return self._cursor

    cursor = FakeCursor()
    connection = FakeConnection(cursor)
    writer = PostgresReviewedReferenceDataWriter("postgresql://unused")
    monkeypatch.setattr(writer, "_connect", lambda: connection)

    existing_ids = writer.find_existing_funder_ids({FUNDER_ID})

    assert existing_ids == {FUNDER_ID}
    assert "ANY(%s::uuid[])" in cursor.query
    assert cursor.parameters == ([str(FUNDER_ID)],)


def test_postgres_import_keeps_source_identity_and_human_readable_claim(
    monkeypatch,
) -> None:
    """Persistence should distinguish source URLs and keep paths in source_map."""
    research, review = build_pair()
    payload = prepare_reviewed_reference_import(
        research=research,
        review=review,
        known_funder_ids={FUNDER_ID},
    )

    class FakeCursor:
        def __init__(self) -> None:
            self.calls: list[tuple[str, tuple[object, ...]]] = []

        def __enter__(self) -> "FakeCursor":
            return self

        def __exit__(self, *args: object) -> None:
            return None

        def execute(self, query: str, parameters: tuple[object, ...]) -> None:
            self.calls.append((query, parameters))

        def fetchone(self) -> tuple[UUID] | None:
            query = self.calls[-1][0]
            if "SELECT source_document_id" in query:
                return None
            if "INSERT INTO source_documents" in query:
                return (SOURCE_DOCUMENT_ID,)
            if "INSERT INTO funding_records" in query:
                return (FUNDING_RECORD_ID,)
            return None

    class FakeConnection:
        def __init__(self, cursor: FakeCursor) -> None:
            self._cursor = cursor

        def __enter__(self) -> "FakeConnection":
            return self

        def __exit__(self, *args: object) -> None:
            return None

        def cursor(self) -> FakeCursor:
            return self._cursor

    cursor = FakeCursor()
    writer = PostgresReviewedReferenceDataWriter("postgresql://unused")
    monkeypatch.setattr(writer, "_connect", lambda: FakeConnection(cursor))

    imported_ids = writer.import_projects(payload)

    assert imported_ids == [FUNDING_RECORD_ID]
    source_lookup = next(
        call for call in cursor.calls if "SELECT source_document_id" in call[0]
    )
    assert "content_hash = %s AND url = %s" in source_lookup[0]
    assert source_lookup[1] == (
        "source-hash",
        "https://funder.example/award",
    )
    evidence_insert = next(
        call for call in cursor.calls if "INSERT INTO funding_record_evidence" in call[0]
    )
    assert evidence_insert[1][2] == (
        "The official page identifies the project as awarded."
    )
    assert evidence_insert[1][3] == evidence_insert[1][2]
    assert evidence_insert[1][4].adapted["target_path"] == (
        "funding_records[project-001].status"
    )
