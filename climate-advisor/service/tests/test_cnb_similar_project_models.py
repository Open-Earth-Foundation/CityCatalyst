"""Tests for the CNB similar-project data contract."""

from uuid import uuid4

from openai.lib._pydantic import to_strict_json_schema
from pydantic import ValidationError
import pytest

from app.models.cnb_similar_projects import (
    CnbSimilarProjectLlmDecision,
    CnbSimilarProjectLlmDecisionSet,
    CnbSimilarProjectSearchRequest,
    CnbSimilarProjectSearchRunResult,
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
    assert "score" not in str(to_strict_json_schema(CnbSimilarProjectLlmDecisionSet))

    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        CnbSimilarProjectLlmDecision.model_validate(
            {
                "funding_record_id": str(uuid4()),
                "decision": "selected",
                "fit_rationale": "Relevant project.",
                "matched_tags": ["stormwater"],
                "evidence_refs": ["evidence-001"],
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
