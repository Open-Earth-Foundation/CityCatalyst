"""Tests for the local similar-project review adapters."""

from pathlib import Path
import sys
from uuid import uuid4

import pytest

from app.models.cnb_similar_projects import (
    CnbSimilarProjectCandidate,
    CnbSimilarProjectMatch,
    CnbSimilarProjectSearchRequest,
)
from tests.cnb_research_helpers import TEST_FUNDER_ID, build_review_pair

CLIMATE_ADVISOR_ROOT = Path(__file__).resolve().parents[2]
if str(CLIMATE_ADVISOR_ROOT) not in sys.path:
    sys.path.insert(0, str(CLIMATE_ADVISOR_ROOT))

from scripts.cnb_research.run_similar_project_matching import (  # noqa: E402
    LocalReviewReferenceDataClient,
    LocalReviewWorkflowStore,
    build_run_input_from_reviewed_pairs,
)


def _request() -> CnbSimilarProjectSearchRequest:
    return CnbSimilarProjectSearchRequest(
        run_id=uuid4(),
        funder_id=TEST_FUNDER_ID,
        funder_scope="cross_funder",
        category="Resilience",
        project_tags=["flood-risk"],
        limit=5,
    )


def test_local_adapters_filter_candidates_and_capture_context() -> None:
    expected = CnbSimilarProjectCandidate(
        funding_record_id=uuid4(),
        funder_id=TEST_FUNDER_ID,
        is_opportunity=False,
        is_funded_award=True,
        name="Reviewed example",
    )
    extra = expected.model_copy(update={"funding_record_id": uuid4()})
    foreign = expected.model_copy(
        update={"funding_record_id": uuid4(), "funder_id": uuid4()}
    )
    client = LocalReviewReferenceDataClient([expected, extra, foreign])
    store = LocalReviewWorkflowStore()
    match = CnbSimilarProjectMatch(
        funding_record_id=expected.funding_record_id,
        fit_rationale="Comparable project.",
    )

    assert client.list_funded_project_candidates(
        funder_id=TEST_FUNDER_ID,
        limit=1,
    ) == [expected]
    store.replace_selected_similar_project_matches(
        run_id=uuid4(),
        matches=[match],
    )
    store.rebuild_similar_projects_context(
        run_id=uuid4(),
        matches=[match],
        caveats=["Local review only."],
    )
    assert store.matches == [match]
    assert store.context_bundle["similar_project_caveats"] == ["Local review only."]


def test_reviewed_pair_becomes_one_grounded_candidate() -> None:
    research, review = build_review_pair()

    run_input = build_run_input_from_reviewed_pairs(
        search_request=_request(),
        research_review_pairs=[(research, review)],
        known_funder_ids={TEST_FUNDER_ID},
    )

    [candidate] = run_input.candidates
    assert candidate.funder_id == TEST_FUNDER_ID
    assert candidate.project_tags == ["flood-risk", "city-led"]
    assert candidate.evidence[0].evidence_ref == (
        f"{research.run_id}:evidence-001"
    )
    assert run_input.sources[0].source_ref == f"{research.run_id}:source-001"


def test_reviewed_pair_rejects_an_unknown_funder() -> None:
    unknown_funder = uuid4()
    research, review = build_review_pair(selected_funder_id=unknown_funder)

    with pytest.raises(ValueError, match="selected funder does not exist"):
        build_run_input_from_reviewed_pairs(
            search_request=_request(),
            research_review_pairs=[(research, review)],
            known_funder_ids={TEST_FUNDER_ID},
        )
