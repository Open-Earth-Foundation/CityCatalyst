"""Tests for the CNB similar-project data contract."""

from collections.abc import Iterator
from datetime import datetime, timezone
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
    CnbSimilarProjectReviewRunArtifact,
    CnbSimilarProjectReviewRunMetadata,
    CnbSimilarProjectReviewState,
    CnbSimilarProjectSearchRequest,
    CnbSimilarProjectSearchResult,
    CnbSimilarProjectSearchRunResult,
)


def _nested_keys(value: object) -> Iterator[str]:
    if isinstance(value, dict):
        for key, child in value.items():
            yield key
            yield from _nested_keys(child)
    elif isinstance(value, list):
        for child in value:
            yield from _nested_keys(child)


def _request() -> CnbSimilarProjectSearchRequest:
    return CnbSimilarProjectSearchRequest(
        run_id=uuid4(),
        funder_id=uuid4(),
        category="Stormwater",
        project_tags=["stormwater", "flood"],
        limit=2,
    )


def _candidate(request: CnbSimilarProjectSearchRequest) -> CnbSimilarProjectCandidate:
    record_id = uuid4()
    return CnbSimilarProjectCandidate(
        funding_record_id=record_id,
        funder_id=request.funder_id,
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


def test_search_request_requires_project_context_and_scoped_funder() -> None:
    cross_funder = CnbSimilarProjectSearchRequest(
        run_id=uuid4(),
        funder_scope="cross_funder",
        interventions=["Municipal solar"],
        limit=50,
    )
    assert cross_funder.funder_id is None

    with pytest.raises(ValidationError, match="funder_id is required"):
        CnbSimilarProjectSearchRequest(run_id=uuid4(), project_name="Project")
    with pytest.raises(ValidationError, match="material semantic project field"):
        CnbSimilarProjectSearchRequest(
            run_id=uuid4(),
            funder_scope="cross_funder",
            known_gaps=["Details pending"],
        )
    with pytest.raises(ValidationError):
        CnbSimilarProjectSearchRequest.model_validate(
            {**cross_funder.model_dump(), "limit": 51}
        )


def test_llm_contract_is_strict_and_has_no_score() -> None:
    schema_keys = set(
        _nested_keys(to_strict_json_schema(CnbSimilarProjectLlmDecisionSet))
    )
    assert "score" not in schema_keys

    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        CnbSimilarProjectLlmDecision.model_validate(
            {
                "funding_record_id": str(uuid4()),
                "decision": "selected",
                "fit_rationale": "Relevant project.",
                "matched_tags": ["stormwater"],
                "evidence_refs": ["evidence-001"],
                "caveats": [],
                "score": 0.9,
            }
        )


@pytest.mark.parametrize(
    ("status", "completion_signal", "is_valid"),
    [
        ("completed", "concept_note_context_bundle_ready", True),
        ("completed", None, False),
        ("skipped_upload_not_ingested", None, True),
        (
            "skipped_upload_not_ingested",
            "concept_note_context_bundle_ready",
            False,
        ),
    ],
)
def test_completion_signal_matches_run_status(
    status: str,
    completion_signal: str | None,
    is_valid: bool,
) -> None:
    payload = {
        "completion_signal": completion_signal,
        "result": {"status": status, "matches": [], "caveats": []},
    }
    if is_valid:
        CnbSimilarProjectSearchRunResult.model_validate(payload)
    else:
        with pytest.raises(ValidationError):
            CnbSimilarProjectSearchRunResult.model_validate(payload)


def test_review_artifact_links_matches_to_candidates() -> None:
    request = _request()
    candidate = _candidate(request)
    match = CnbSimilarProjectMatch(
        funding_record_id=candidate.funding_record_id,
        fit_rationale="Comparable example.",
        evidence=candidate.evidence,
    )
    payload = {
        "run_id": request.run_id,
        "generated_at": datetime.now(timezone.utc),
        "run_metadata": CnbSimilarProjectReviewRunMetadata(
            model_name="test-model",
            reasoning_effort="medium",
            prompt_sha256="prompt-hash",
        ),
        "search_request": request,
        "candidates": [candidate],
        "completion_signal": "concept_note_context_bundle_ready",
        "result": CnbSimilarProjectSearchResult(
            status="completed",
            matches=[match],
            caveats=[],
        ),
        "review": CnbSimilarProjectReviewState(status="pending_review"),
    }

    artifact = CnbSimilarProjectReviewRunArtifact.model_validate(payload)
    assert artifact.result.matches == [match]

    payload["result"] = CnbSimilarProjectSearchResult(
        status="completed",
        matches=[
            match.model_copy(update={"funding_record_id": uuid4()})
        ],
        caveats=[],
    )
    with pytest.raises(ValidationError, match="must reference a candidate"):
        CnbSimilarProjectReviewRunArtifact.model_validate(payload)
