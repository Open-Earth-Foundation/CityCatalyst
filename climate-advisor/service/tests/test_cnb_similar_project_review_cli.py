"""Tests for the local CNB similar-project review runner adapters."""

from argparse import Namespace
from datetime import datetime, timezone
from decimal import Decimal
import json
from pathlib import Path
import sys
from uuid import UUID, uuid4

import pytest

from app.models.cnb_similar_projects import (
    CnbSimilarProjectCandidate,
    CnbSimilarProjectMatch,
    CnbSimilarProjectReviewRunInput,
    CnbSimilarProjectSearchRequest,
)
from app.models.cnb_research import (
    FieldEvidence,
    FunderDraft,
    FunderIdentityCandidate,
    FunderProfileDraft,
    FundingOpportunityResearchBundle,
    FundingRecordDraft,
    ResearchGap,
    ResearchRunMetadata,
    ReviewState,
    SourceDocumentDraft,
)
from app.services.cnb_review_import import (
    ReviewFieldDecision,
    ReviewedReferenceData,
    ReviewedReferenceDataArtifact,
)
from tests.cnb_research_helpers import build_request

CLIMATE_ADVISOR_ROOT = Path(__file__).resolve().parents[2]
if str(CLIMATE_ADVISOR_ROOT) not in sys.path:
    sys.path.insert(0, str(CLIMATE_ADVISOR_ROOT))

from scripts.cnb_research.run_similar_project_matching import (  # noqa: E402
    LocalReviewReferenceDataClient,
    LocalReviewWorkflowStore,
    build_run_input_from_reviewed_pairs,
    build_run_metadata,
    load_run_input_from_args,
)

SEARCH_FUNDER_ID = UUID("11111111-1111-4111-8111-111111111111")
PROJECT_FUNDER_ID = UUID("22222222-2222-4222-8222-222222222222")


def _candidate(*, funding_record_id, funder_id) -> CnbSimilarProjectCandidate:
    """Build the smallest eligible local candidate needed by adapter tests."""
    return CnbSimilarProjectCandidate(
        funding_record_id=funding_record_id,
        funder_id=funder_id,
        is_opportunity=False,
        is_funded_award=True,
        name="Reviewed example",
    )


def test_local_reference_client_filters_by_funder_and_limit() -> None:
    """Local snapshots should obey the same bounded same-funder read contract."""
    selected_funder_id = uuid4()
    expected = _candidate(
        funding_record_id=uuid4(),
        funder_id=selected_funder_id,
    )
    extra = _candidate(
        funding_record_id=uuid4(),
        funder_id=selected_funder_id,
    )
    foreign = _candidate(
        funding_record_id=uuid4(),
        funder_id=uuid4(),
    )
    client = LocalReviewReferenceDataClient([expected, extra, foreign])

    candidates = client.list_funded_project_candidates(
        funder_id=selected_funder_id,
        limit=1,
    )

    assert candidates == [expected]


def test_local_reference_client_can_read_across_funders() -> None:
    """Cross-funder snapshots should retain candidates' real funder identities."""
    first = _candidate(funding_record_id=uuid4(), funder_id=uuid4())
    second = _candidate(funding_record_id=uuid4(), funder_id=uuid4())
    client = LocalReviewReferenceDataClient([first, second])

    candidates = client.list_funded_project_candidates(
        funder_id=None,
        limit=2,
    )

    assert candidates == [first, second]


def test_local_workflow_store_captures_only_similar_project_context() -> None:
    """The local store should expose the exact section a production store rebuilds."""
    run_id = uuid4()
    match = CnbSimilarProjectMatch(
        funding_record_id=uuid4(),
        fit_rationale="The reviewed evidence supports a useful comparison.",
    )
    store = LocalReviewWorkflowStore()

    assert store.has_ingested_project_upload(run_id=run_id) is True
    store.replace_selected_similar_project_matches(
        run_id=run_id,
        matches=[match],
    )
    store.rebuild_similar_projects_context(
        run_id=run_id,
        matches=[match],
        caveats=["Local review snapshot only."],
    )

    assert store.matches == [match]
    assert store.context_bundle == {
        "similar_projects": [match.model_dump(mode="json")],
        "similar_project_caveats": ["Local review snapshot only."],
    }


def _build_search_request(*, funder_scope: str = "cross_funder") -> CnbSimilarProjectSearchRequest:
    """Create the current-project search request used by reviewed-pair mode."""
    return CnbSimilarProjectSearchRequest(
        run_id=uuid4(),
        funder_id=SEARCH_FUNDER_ID,
        funder_scope=funder_scope,
        category="Resilience",
        hazards=["flood"],
        interventions=["levees"],
        project_tags=["flood-risk"],
        limit=5,
    )


def _build_review_pair(
    *,
    run_id: str,
    selected_funder_id: UUID = PROJECT_FUNDER_ID,
    selected_funder_name: str = "Reviewed Example Funder",
    project_name: str = "Flood resilience project",
    project_ref: str = "project-001",
    evidence_ref: str = "evidence-001",
    source_ref: str = "source-001",
    award_amount: Decimal = Decimal("125000.00"),
    gaps: list[ResearchGap] | None = None,
) -> tuple[FundingOpportunityResearchBundle, ReviewedReferenceDataArtifact]:
    """Build one approved research/review pair for local candidate snapshots."""
    now = datetime.now(timezone.utc)
    opportunity = FundingRecordDraft(
        funding_record_ref="opportunity-001",
        funder_ref="funder-001",
        is_opportunity=True,
        name="Example Program",
    )
    project = FundingRecordDraft(
        funding_record_ref=project_ref,
        funder_ref="funder-001",
        is_opportunity=False,
        name=project_name,
        applicant_name="Example City",
        reported_funder_name=selected_funder_name,
        city="Springfield",
        state_region="Illinois",
        country="United States",
        category="Resilience",
        hazards=["flood"],
        interventions=["levees"],
        finance_route="grant",
        instrument_type="capital",
        region_scope="municipal",
        award_amount=award_amount,
        currency="USD",
        award_year=2024,
        status="awarded",
        summary="A reviewed flood resilience award.",
        candidate_funders=[
            FunderIdentityCandidate(
                funder_id=selected_funder_id,
                name=selected_funder_name,
                match_reason="Exact reviewed match",
            )
        ],
    )
    source = SourceDocumentDraft(
        source_ref=source_ref,
        source_type="award_page",
        url=f"https://example.org/{source_ref}",
        title=f"Evidence source {source_ref}",
        content_hash=f"hash-{source_ref}",
        fetched_at=now,
        local_snapshot_path=f"sources/{source_ref}.md",
    )
    evidence = FieldEvidence(
        evidence_ref=evidence_ref,
        funding_record_ref=project_ref,
        target_path=f"funding_records[{project_ref}].status",
        source_ref=source_ref,
        source_location="Awards",
        quote_or_summary="The official page identifies this project as awarded.",
    )
    research = FundingOpportunityResearchBundle(
        schema_version="2.0",
        run_id=run_id,
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
            name=selected_funder_name,
            profile=FunderProfileDraft(),
        ),
        funding_records=[opportunity, project],
        sources=[source],
        evidence=[evidence],
        gaps=list(gaps or []),
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
                target_path=f"funding_records[{project_ref}].status",
                selected=True,
                original_value="awarded",
                reviewed_value="awarded",
                evidence_refs=[evidence_ref],
            )
        ],
        reviewed_reference_data=ReviewedReferenceData(
            funder=research.funder,
            funding_records=[
                opportunity,
                project.model_copy(
                    update={
                        "selected_funder_id": selected_funder_id,
                        "project_tags": [" Flood Risk ", "CITY LED"],
                    }
                ),
            ],
        ),
    )
    return research, review


def test_reviewed_pairs_build_cross_funder_snapshot_with_local_ids() -> None:
    """Reviewed-pair mode should preserve real funder IDs with namespaced evidence."""
    research, review = _build_review_pair(
        run_id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        gaps=[
            ResearchGap(
                target_path="funding_records[project-001].currency",
                reason="Currency was not stated directly.",
            )
        ],
    )

    run_input = build_run_input_from_reviewed_pairs(
        search_request=_build_search_request(),
        research_review_pairs=[(research, review)],
        known_funder_ids={PROJECT_FUNDER_ID},
    )

    assert len(run_input.candidates) == 1
    candidate = run_input.candidates[0]
    assert candidate.funder_id == PROJECT_FUNDER_ID
    assert candidate.funder_name == "Reviewed Example Funder"
    assert candidate.project_tags == ["flood-risk", "city-led"]
    assert candidate.known_gaps == ["Currency: Currency was not stated directly."]
    assert candidate.evidence[0].evidence_ref == (
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:evidence-001"
    )
    assert candidate.evidence[0].source_ref == (
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:source-001"
    )
    assert run_input.sources[0].source_ref == candidate.evidence[0].source_ref


def test_reviewed_pairs_deduplicate_equivalent_projects_across_runs() -> None:
    """Equivalent reviewed projects should merge into one deterministic candidate."""
    first_pair = _build_review_pair(
        run_id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        project_ref="project-001",
        evidence_ref="evidence-001",
        source_ref="source-001",
        award_amount=Decimal("125000.00"),
        gaps=[
            ResearchGap(
                target_path="funding_records[project-001].currency",
                reason="Currency was not stated directly.",
            )
        ],
    )
    second_pair = _build_review_pair(
        run_id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        project_ref="project-009",
        evidence_ref="evidence-009",
        source_ref="source-009",
        award_amount=Decimal("125000"),
        gaps=[
            ResearchGap(
                target_path="funding_records[project-009].summary",
                reason="A concise summary could not be confirmed.",
            )
        ],
    )

    run_input = build_run_input_from_reviewed_pairs(
        search_request=_build_search_request(),
        research_review_pairs=[first_pair, second_pair],
        known_funder_ids={PROJECT_FUNDER_ID},
    )

    assert len(run_input.candidates) == 1
    candidate = run_input.candidates[0]
    assert candidate.project_tags == ["flood-risk", "city-led"]
    assert candidate.known_gaps == [
        "Currency: Currency was not stated directly.",
        "Summary: A concise summary could not be confirmed.",
    ]
    assert [item.evidence_ref for item in candidate.evidence] == [
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:evidence-001",
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb:evidence-009",
    ]
    assert [item.source_ref for item in run_input.sources] == [
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:source-001",
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb:source-009",
    ]


def _write_json(path: Path, payload: object) -> None:
    """Write one JSON fixture used by the local CLI loader tests."""
    path.write_text(json.dumps(payload), encoding="utf-8")


def _write_reviewed_mode_files(
    *,
    tmp_path: Path,
    research: FundingOpportunityResearchBundle,
    review: ReviewedReferenceDataArtifact,
    snapshot_funder_id: UUID = PROJECT_FUNDER_ID,
) -> Namespace:
    """Write one reviewed-pair fixture set and return its parsed arguments."""
    search_request_path = tmp_path / "search-request.json"
    research_path = tmp_path / "research.json"
    review_path = tmp_path / "review.json"
    funder_snapshot_path = tmp_path / "funders.json"
    _write_json(
        search_request_path,
        _build_search_request().model_dump(mode="json"),
    )
    _write_json(research_path, research.model_dump(mode="json"))
    _write_json(review_path, review.model_dump(mode="json"))
    _write_json(
        funder_snapshot_path,
        {
            "funders": [
                {
                    "funder_id": str(snapshot_funder_id),
                    "name": "Reviewed Example Funder",
                }
            ]
        },
    )
    return Namespace(
        input=None,
        search_request=search_request_path,
        funders=funder_snapshot_path,
        research=[research_path],
        review=[review_path],
        output=Path("output/cnb_research"),
        source_bundle=None,
        log_level="INFO",
    )


def test_reviewed_pair_loader_accepts_snapshot_known_funder_and_tracks_paths(
    tmp_path: Path,
) -> None:
    """Reviewed mode should trust the snapshot and retain resolved provenance."""
    research, review = _build_review_pair(
        run_id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    )
    args = _write_reviewed_mode_files(
        tmp_path=tmp_path,
        research=research,
        review=review,
    )

    run_input = load_run_input_from_args(args)
    metadata = build_run_metadata(
        args,
        model_name="gpt-5.6-terra",
        reasoning_effort="medium",
        prompt_sha256="prompt-hash",
    )

    assert run_input.candidates[0].funder_id == PROJECT_FUNDER_ID
    assert metadata.input_mode == "reviewed_artifact_pairs"
    provenance = metadata.reviewed_artifact_provenance
    assert provenance is not None
    assert provenance.funder_snapshot_path == str(args.funders.resolve())
    assert provenance.artifact_pairs[0].research_path == str(
        args.research[0].resolve()
    )
    assert provenance.artifact_pairs[0].review_path == str(
        args.review[0].resolve()
    )


def test_reviewed_pair_loader_rejects_funder_missing_from_snapshot(
    tmp_path: Path,
) -> None:
    """A reviewer-selected UUID must exist in the supplied canonical snapshot."""
    unknown_funder_id = UUID("33333333-3333-4333-8333-333333333333")
    research, review = _build_review_pair(
        run_id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        selected_funder_id=unknown_funder_id,
    )
    args = _write_reviewed_mode_files(
        tmp_path=tmp_path,
        research=research,
        review=review,
    )

    with pytest.raises(
        ValueError,
        match=f"selected funder does not exist: {unknown_funder_id}",
    ):
        load_run_input_from_args(args)


def test_legacy_input_mode_rejects_funder_snapshot(tmp_path: Path) -> None:
    """Pair-only canonical-funder provenance must not leak into legacy mode."""
    input_path = tmp_path / "input.json"
    funder_snapshot_path = tmp_path / "funders.json"
    run_input = CnbSimilarProjectReviewRunInput(
        search_request=_build_search_request(),
        candidates=[
            _candidate(
                funding_record_id=uuid4(),
                funder_id=PROJECT_FUNDER_ID,
            )
        ],
    )
    _write_json(input_path, run_input.model_dump(mode="json"))
    _write_json(funder_snapshot_path, {"funders": []})
    args = Namespace(
        input=input_path,
        search_request=None,
        funders=funder_snapshot_path,
        research=[],
        review=[],
        output=Path("output/cnb_research"),
        source_bundle=None,
        log_level="INFO",
    )

    with pytest.raises(
        ValueError,
        match="--research/--review/--funders require --search-request",
    ):
        load_run_input_from_args(args)
