"""Tests for strict Concept Note Builder similar-project matching models."""

from collections.abc import Iterator
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from openai.lib._pydantic import to_strict_json_schema
from pydantic import ValidationError
import pytest

from app.models.cnb_similar_projects import (
    CnbSimilarProjectCandidate,
    CnbSimilarProjectEvidence,
    CnbSimilarProjectLlmDecision,
    CnbSimilarProjectLlmDecisionSet,
    CnbSimilarProjectMatch,
    CnbSimilarProjectReviewedArtifactPair,
    CnbSimilarProjectReviewedArtifactProvenance,
    CnbSimilarProjectReviewRunArtifact,
    CnbSimilarProjectReviewRunInput,
    CnbSimilarProjectReviewRunMetadata,
    CnbSimilarProjectReviewSource,
    CnbSimilarProjectReviewState,
    CnbSimilarProjectSearchResult,
    CnbSimilarProjectSearchRequest,
    CnbSimilarProjectSearchRunResult,
)


def _nested_keys(value: object) -> Iterator[str]:
    """Yield every key in a nested JSON-schema value."""
    if isinstance(value, dict):
        for key, child in value.items():
            yield key
            yield from _nested_keys(child)
    elif isinstance(value, list):
        for child in value:
            yield from _nested_keys(child)


def _build_search_request() -> CnbSimilarProjectSearchRequest:
    """Create one valid search request for review-artifact tests."""
    return CnbSimilarProjectSearchRequest(
        run_id=uuid4(),
        funder_id=uuid4(),
        category="Stormwater",
        project_tags=["stormwater", "flood"],
        limit=2,
    )


def _build_candidate(
    *,
    funding_record_id=None,
    funder_id=None,
) -> CnbSimilarProjectCandidate:
    """Create one candidate with a single retained evidence row."""
    record_id = funding_record_id or uuid4()
    source_funder_id = funder_id or uuid4()
    return CnbSimilarProjectCandidate(
        funding_record_id=record_id,
        funder_id=source_funder_id,
        is_opportunity=False,
        is_funded_award=True,
        name="Comparable project",
        project_tags=["stormwater"],
        evidence=[
            CnbSimilarProjectEvidence(
                evidence_ref="evidence-001",
                source_ref="source-001",
                target_path=f"funding_records[{record_id}].summary",
                quote_or_summary="Official summary.",
            )
        ],
    )


def _build_review_source(
    *,
    source_ref: str = "source-001",
) -> CnbSimilarProjectReviewSource:
    """Create one lightweight retained source reference."""
    return CnbSimilarProjectReviewSource(
        source_ref=source_ref,
        url="https://example.com/source",
        title="Source title",
    )


def test_strict_schema_contains_no_score_field() -> None:
    """The matching contract should not expose a numeric score anywhere."""
    schema_keys = set(
        _nested_keys(to_strict_json_schema(CnbSimilarProjectLlmDecisionSet))
    )
    assert "score" not in schema_keys


def test_search_request_allows_broad_but_bounded_results() -> None:
    """Broad discovery may request fifty reviewable matches, but no more."""
    request = CnbSimilarProjectSearchRequest(
        run_id=uuid4(),
        funder_id=uuid4(),
        funder_scope="cross_funder",
        category="Renewable energy",
        limit=50,
    )
    assert request.limit == 50

    with pytest.raises(ValidationError):
        CnbSimilarProjectSearchRequest(
            run_id=uuid4(),
            funder_id=uuid4(),
            funder_scope="cross_funder",
            limit=51,
        )


def test_search_request_only_requires_funder_for_same_funder_scope() -> None:
    """Cross-funder discovery accepts a project profile without funder data."""
    cross_funder_request = CnbSimilarProjectSearchRequest(
        run_id=uuid4(),
        funder_scope="cross_funder",
        interventions=["Municipal solar", "Battery storage"],
    )

    assert cross_funder_request.funder_id is None

    with pytest.raises(
        ValidationError,
        match="funder_id is required when funder_scope=same_funder",
    ):
        CnbSimilarProjectSearchRequest(run_id=uuid4())


def test_search_request_rejects_metadata_only_and_blank_project_profiles() -> None:
    """A project file must carry real semantic search context."""
    with pytest.raises(
        ValidationError,
        match="at least one material semantic project field is required",
    ):
        CnbSimilarProjectSearchRequest(
            run_id=uuid4(),
            funder_scope="cross_funder",
            known_gaps=["Project detail is pending."],
            limit=50,
        )

    with pytest.raises(
        ValidationError,
        match="at least one material semantic project field is required",
    ):
        CnbSimilarProjectSearchRequest(
            run_id=uuid4(),
            funder_scope="cross_funder",
            project_name="   ",
            hazards=["", "  "],
            interventions=["   "],
            project_tags=[""],
        )


def test_llm_decision_rejects_extra_fields_and_duplicate_tags() -> None:
    """Structured decisions must stay strict and deduplicated."""
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        CnbSimilarProjectLlmDecision.model_validate(
            {
                "funding_record_id": str(uuid4()),
                "decision": "selected",
                "fit_rationale": "Relevant project.",
                "matched_tags": ["stormwater"],
                "evidence_refs": ["ev-1"],
                "caveats": [],
                "score": 0.91,
            }
        )

    with pytest.raises(ValidationError, match="decision.matched_tags"):
        CnbSimilarProjectLlmDecision.model_validate(
            {
                "funding_record_id": str(uuid4()),
                "decision": "selected",
                "fit_rationale": "Relevant project.",
                "matched_tags": ["stormwater", "stormwater"],
                "evidence_refs": ["ev-1"],
                "caveats": [],
            }
        )


def test_run_result_requires_completion_signal_only_for_completed_runs() -> None:
    """The workflow wrapper should emit the generic signal only on completion."""
    with pytest.raises(ValidationError, match="must emit completion_signal"):
        CnbSimilarProjectSearchRunResult.model_validate(
            {
                "result": {
                    "status": "completed",
                    "matches": [],
                    "caveats": [],
                }
            }
        )

    with pytest.raises(ValidationError, match="must not emit a completion_signal"):
        CnbSimilarProjectSearchRunResult.model_validate(
            {
                "completion_signal": "concept_note_context_bundle_ready",
                "result": {
                    "status": "skipped_upload_not_ingested",
                    "matches": [],
                    "caveats": [],
                },
            }
        )

    run_result = CnbSimilarProjectSearchRunResult(
        completion_signal="concept_note_context_bundle_ready",
        result=CnbSimilarProjectSearchResult(
            status="completed",
            matches=[],
            caveats=[],
        ),
    )
    assert run_result.completion_signal == "concept_note_context_bundle_ready"


def test_review_run_input_requires_candidate_funder_and_source_consistency() -> None:
    """Review inputs keep candidate funders and source identities aligned."""
    request = _build_search_request()
    matching_candidate = _build_candidate(funder_id=request.funder_id)

    review_input = CnbSimilarProjectReviewRunInput(
        search_request=request,
        candidates=[matching_candidate],
        sources=[_build_review_source()],
    )
    assert review_input.candidates[0].funder_id == request.funder_id

    with pytest.raises(
        ValidationError,
        match="candidates.funder_id must match search_request.funder_id "
        "when funder_scope=same_funder",
    ):
        CnbSimilarProjectReviewRunInput(
            search_request=request,
            candidates=[_build_candidate()],
        )

    with pytest.raises(
        ValidationError,
        match="sources.source_ref values must be unique",
    ):
        CnbSimilarProjectReviewRunInput(
            search_request=request,
            candidates=[matching_candidate],
            sources=[
                _build_review_source(source_ref="source-001"),
                _build_review_source(source_ref="source-001"),
            ],
        )

    cross_funder_request = CnbSimilarProjectSearchRequest(
        **{
            **request.model_dump(mode="json"),
            "funder_scope": "cross_funder",
        }
    )
    cross_funder_input = CnbSimilarProjectReviewRunInput(
        search_request=cross_funder_request,
        candidates=[_build_candidate()],
    )
    assert cross_funder_input.search_request.funder_scope == "cross_funder"


def test_review_run_artifact_validates_runner_state_and_candidate_links() -> None:
    """The local review artifact must stay UTC, pending, and source-grounded."""
    request = _build_search_request()
    candidate = _build_candidate(funder_id=request.funder_id)
    artifact = CnbSimilarProjectReviewRunArtifact(
        run_id=request.run_id,
        generated_at=datetime.now(timezone.utc),
        run_metadata=CnbSimilarProjectReviewRunMetadata(
            model_name="gpt-5.6-terra",
            reasoning_effort="medium",
            prompt_sha256="abc123",
        ),
        search_request=request,
        candidates=[candidate],
        completion_signal="concept_note_context_bundle_ready",
        result=CnbSimilarProjectSearchResult(
            status="completed",
            matches=[
                CnbSimilarProjectMatch(
                    funding_record_id=candidate.funding_record_id,
                    fit_rationale="Comparable example.",
                    evidence=candidate.evidence,
                )
            ],
            caveats=[],
        ),
        sources=[_build_review_source()],
        review=CnbSimilarProjectReviewState(status="pending_review"),
    )
    assert artifact.review.status == "pending_review"
    assert artifact.run_metadata.input_mode == "local_review_snapshot"

    with pytest.raises(
        ValidationError,
        match="run_id must match search_request.run_id",
    ):
        CnbSimilarProjectReviewRunArtifact(
            **{
                **artifact.model_dump(mode="json"),
                "run_id": str(uuid4()),
            }
        )

    with pytest.raises(
        ValidationError,
        match="runner-generated review artifacts must start pending_review",
    ):
        CnbSimilarProjectReviewRunArtifact(
            **{
                **artifact.model_dump(mode="json"),
                "review": {"status": "approved"},
            }
        )

    with pytest.raises(
        ValidationError,
        match="generated_at must be a UTC datetime",
    ):
        CnbSimilarProjectReviewRunArtifact(
            **{
                **artifact.model_dump(mode="json"),
                "generated_at": (
                    datetime.now(timezone.utc) + timedelta(hours=1)
                ).astimezone(timezone(timedelta(hours=1))).isoformat(),
            }
        )


def test_review_run_metadata_enforces_mode_specific_provenance() -> None:
    """Reviewed-pair metadata must use strict pair and funder path provenance."""
    provenance = CnbSimilarProjectReviewedArtifactProvenance(
        funder_snapshot_path="C:/inputs/funders.json",
        artifact_pairs=[
            CnbSimilarProjectReviewedArtifactPair(
                research_path="C:/inputs/research.json",
                review_path="C:/inputs/review.json",
            )
        ],
    )

    metadata = CnbSimilarProjectReviewRunMetadata(
        model_name="gpt-5.6-terra",
        reasoning_effort="medium",
        prompt_sha256="abc123",
        input_mode="reviewed_artifact_pairs",
        reviewed_artifact_provenance=provenance,
    )

    assert metadata.reviewed_artifact_provenance == provenance
    with pytest.raises(
        ValidationError,
        match=(
            "reviewed_artifact_pairs metadata requires "
            "reviewed_artifact_provenance"
        ),
    ):
        CnbSimilarProjectReviewRunMetadata(
            model_name="gpt-5.6-terra",
            reasoning_effort="medium",
            prompt_sha256="abc123",
            input_mode="reviewed_artifact_pairs",
        )
    with pytest.raises(
        ValidationError,
        match="reviewed_artifact_pairs metadata must not include source_bundle",
    ):
        CnbSimilarProjectReviewRunMetadata(
            model_name="gpt-5.6-terra",
            reasoning_effort="medium",
            prompt_sha256="abc123",
            input_mode="reviewed_artifact_pairs",
            source_bundle="C:/inputs/source-bundle.json",
            reviewed_artifact_provenance=provenance,
        )
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        CnbSimilarProjectReviewedArtifactPair(
            research_path="C:/inputs/research.json",
            review_path="C:/inputs/review.json",
            unsupported_path="C:/inputs/other.json",
        )


def test_review_run_artifact_rejects_unknown_match_and_evidence_refs() -> None:
    """Persisted review artifacts may only cite shortlisted candidates and evidence."""
    request = _build_search_request()
    candidate = _build_candidate(funder_id=request.funder_id)
    metadata = CnbSimilarProjectReviewRunMetadata(
        model_name="gpt-5.6-terra",
        reasoning_effort="medium",
        prompt_sha256="abc123",
    )

    with pytest.raises(
        ValidationError,
        match="result.matches.funding_record_id must reference a candidate",
    ):
        CnbSimilarProjectReviewRunArtifact(
            run_id=request.run_id,
            generated_at=datetime.now(timezone.utc),
            run_metadata=metadata,
            search_request=request,
            candidates=[candidate],
            completion_signal="concept_note_context_bundle_ready",
            result=CnbSimilarProjectSearchResult(
                status="completed",
                matches=[
                    CnbSimilarProjectMatch(
                        funding_record_id=uuid4(),
                        fit_rationale="Comparable example.",
                    )
                ],
                caveats=[],
            ),
            review=CnbSimilarProjectReviewState(status="pending_review"),
        )

    with pytest.raises(
        ValidationError,
        match="result.matches.evidence must reference candidate evidence",
    ):
        CnbSimilarProjectReviewRunArtifact(
            run_id=request.run_id,
            generated_at=datetime.now(timezone.utc),
            run_metadata=metadata,
            search_request=request,
            candidates=[candidate],
            completion_signal="concept_note_context_bundle_ready",
            result=CnbSimilarProjectSearchResult(
                status="completed",
                matches=[
                    CnbSimilarProjectMatch(
                        funding_record_id=candidate.funding_record_id,
                        fit_rationale="Comparable example.",
                        evidence=[
                            CnbSimilarProjectEvidence(
                                evidence_ref="missing-evidence",
                                source_ref="source-999",
                                target_path="funding_records[missing].summary",
                                quote_or_summary="Unsupported.",
                            )
                        ],
                    )
                ],
                caveats=[],
            ),
            review=CnbSimilarProjectReviewState(status="pending_review"),
        )
