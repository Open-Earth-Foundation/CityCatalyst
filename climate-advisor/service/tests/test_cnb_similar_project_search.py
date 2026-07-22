"""Tests for internal Concept Note Builder similar-project matching."""

import json
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest

from app.models.cnb_similar_projects import (
    CnbSimilarProjectCandidate,
    CnbSimilarProjectEvidence,
    CnbSimilarProjectLlmDecision,
    CnbSimilarProjectLlmDecisionSet,
    CnbSimilarProjectMatch,
    CnbSimilarProjectSearchRequest,
)
from app.services.cnb_similar_project_search import (
    ProjectMatchingService,
    rebuild_similar_projects_section,
)


class FakeStore:
    def __init__(self, *, ingested: bool = True) -> None:
        self.ingested = ingested
        self.matches: list[CnbSimilarProjectMatch] | None = None
        self.context: tuple[list[CnbSimilarProjectMatch], list[str]] | None = None

    def has_ingested_project_upload(self, *, run_id: UUID) -> bool:
        return self.ingested

    def replace_selected_similar_project_matches(
        self,
        *,
        run_id: UUID,
        matches: list[CnbSimilarProjectMatch],
    ) -> None:
        self.matches = matches

    def rebuild_similar_projects_context(
        self,
        *,
        run_id: UUID,
        matches: list[CnbSimilarProjectMatch],
        caveats: list[str],
    ) -> None:
        self.context = (matches, caveats)


class FakeReferenceData:
    def __init__(self, candidates: list[CnbSimilarProjectCandidate]) -> None:
        self.candidates = candidates
        self.calls: list[tuple[UUID | None, int]] = []

    def list_funded_project_candidates(
        self,
        *,
        funder_id: UUID | None,
        limit: int,
    ) -> list[CnbSimilarProjectCandidate]:
        self.calls.append((funder_id, limit))
        return self.candidates


class FakeResponses:
    def __init__(self, decisions: CnbSimilarProjectLlmDecisionSet | None) -> None:
        self.decisions = decisions
        self.calls: list[dict[str, object]] = []

    def parse(self, **kwargs: object) -> SimpleNamespace:
        self.calls.append(kwargs)
        return SimpleNamespace(output=[], output_parsed=self.decisions)


def _request(*, funder_scope: str = "same_funder") -> CnbSimilarProjectSearchRequest:
    return CnbSimilarProjectSearchRequest(
        run_id=uuid4(),
        funder_id=uuid4(),
        funder_scope=funder_scope,
        category="Stormwater",
        project_tags=["Stormwater", "Flood", "City Led"],
        limit=1,
    )


def _candidate(
    request: CnbSimilarProjectSearchRequest,
    *,
    name: str = "Comparable",
    funder_id: UUID | None = None,
) -> CnbSimilarProjectCandidate:
    record_id = uuid4()
    return CnbSimilarProjectCandidate(
        funding_record_id=record_id,
        funder_id=funder_id or request.funder_id,
        is_opportunity=False,
        is_funded_award=True,
        name=name,
        category="stormwater",
        project_tags=["stormwater", "flood", "city-led"],
        evidence=[
            CnbSimilarProjectEvidence(
                evidence_ref=f"evidence-{name}",
                source_ref=f"source-{name}",
                target_path=f"funding_records[{record_id}].summary",
                quote_or_summary=f"{name} evidence",
            )
        ],
    )


def _service(
    *,
    store: FakeStore,
    reference_data: FakeReferenceData,
    decisions: CnbSimilarProjectLlmDecisionSet | None,
) -> tuple[ProjectMatchingService, FakeResponses]:
    responses = FakeResponses(decisions)
    return (
        ProjectMatchingService(
            openai_client=SimpleNamespace(responses=responses),
            workflow_store=store,
            reference_data_client=reference_data,
            model_name="test-model",
            prompt="Match shortlisted projects.",
        ),
        responses,
    )


def test_service_skips_until_the_project_upload_is_ingested() -> None:
    store = FakeStore(ingested=False)
    reference_data = FakeReferenceData([])
    service, responses = _service(
        store=store,
        reference_data=reference_data,
        decisions=None,
    )

    result = service.run(_request())

    assert result.result.status == "skipped_upload_not_ingested"
    assert result.completion_signal is None
    assert reference_data.calls == []
    assert responses.calls == []


def test_service_filters_orders_selects_and_persists_a_grounded_match() -> None:
    request = _request()
    selected = _candidate(request)
    less_related = _candidate(request, name="Less related").model_copy(
        update={"project_tags": ["stormwater"]}
    )
    wrong_funder = _candidate(request, name="Wrong funder", funder_id=uuid4())
    opportunity = _candidate(request, name="Opportunity").model_copy(
        update={"is_opportunity": True}
    )
    unfunded = _candidate(request, name="Unfunded").model_copy(
        update={"is_funded_award": False}
    )
    unsupported = _candidate(request, name="Unsupported").model_copy(
        update={"evidence": []}
    )
    decisions = CnbSimilarProjectLlmDecisionSet(
        decisions=[
            CnbSimilarProjectLlmDecision(
                funding_record_id=selected.funding_record_id,
                decision="selected",
                fit_rationale="Comparable city-led flood project.",
                matched_tags=["stormwater", "flood", "city-led"],
                evidence_refs=[selected.evidence[0].evidence_ref],
            ),
            CnbSimilarProjectLlmDecision(
                funding_record_id=less_related.funding_record_id,
                decision="rejected",
                fit_rationale="Fewer curated tags overlap.",
                matched_tags=["stormwater"],
                evidence_refs=[less_related.evidence[0].evidence_ref],
            ),
        ]
    )
    store = FakeStore()
    reference_data = FakeReferenceData(
        [
            wrong_funder,
            opportunity,
            unfunded,
            unsupported,
            less_related,
            selected,
        ]
    )
    service, responses = _service(
        store=store,
        reference_data=reference_data,
        decisions=decisions,
    )

    result = service.run(request)

    assert result.completion_signal == "concept_note_context_bundle_ready"
    assert [match.funding_record_id for match in result.result.matches] == [
        selected.funding_record_id
    ]
    assert store.matches == result.result.matches
    assert store.context == (result.result.matches, [])
    assert reference_data.calls == [(request.funder_id, 5)]
    payload = json.loads(responses.calls[0]["input"])
    assert [item["funding_record_id"] for item in payload["candidates"]] == [
        str(selected.funding_record_id),
        str(less_related.funding_record_id),
    ]


def test_cross_funder_mode_reads_all_funders() -> None:
    request = _request(funder_scope="cross_funder")
    candidate = _candidate(request, funder_id=uuid4())
    decisions = CnbSimilarProjectLlmDecisionSet(
        decisions=[
            CnbSimilarProjectLlmDecision(
                funding_record_id=candidate.funding_record_id,
                decision="rejected",
                fit_rationale="Not sufficiently comparable.",
                matched_tags=["stormwater"],
                evidence_refs=[candidate.evidence[0].evidence_ref],
            )
        ]
    )
    reference_data = FakeReferenceData([candidate])
    service, _ = _service(
        store=FakeStore(),
        reference_data=reference_data,
        decisions=decisions,
    )

    service.run(request)

    assert reference_data.calls == [(None, 5)]


@pytest.mark.parametrize(
    ("case", "message"),
    [
        ("missing_decision", "must cover every shortlist candidate"),
        ("invented_tag", "matched_tags must stay within"),
        ("missing_evidence", "must cite candidate evidence"),
    ],
)
def test_service_rejects_ungrounded_model_decisions(
    case: str,
    message: str,
) -> None:
    request = _request()
    candidate = _candidate(request)
    if case == "missing_decision":
        decisions = CnbSimilarProjectLlmDecisionSet(decisions=[])
    else:
        decisions = CnbSimilarProjectLlmDecisionSet(
            decisions=[
                CnbSimilarProjectLlmDecision(
                    funding_record_id=candidate.funding_record_id,
                    decision="selected",
                    fit_rationale="Comparable project.",
                    matched_tags=(
                        ["invented-tag"] if case == "invented_tag" else ["stormwater"]
                    ),
                    evidence_refs=(
                        []
                        if case == "missing_evidence"
                        else [candidate.evidence[0].evidence_ref]
                    ),
                )
            ]
        )
    service, _ = _service(
        store=FakeStore(),
        reference_data=FakeReferenceData([candidate]),
        decisions=decisions,
    )

    with pytest.raises(ValueError, match=message):
        service.run(request)


def test_no_candidates_completes_with_an_explicit_caveat() -> None:
    request = _request()
    store = FakeStore()
    service, responses = _service(
        store=store,
        reference_data=FakeReferenceData([]),
        decisions=None,
    )

    result = service.run(request)

    assert result.completion_signal == "concept_note_context_bundle_ready"
    assert result.result.matches == []
    assert result.result.caveats == [
        "No eligible funded-project candidates were available for matching."
    ]
    assert store.matches == []
    assert responses.calls == []


def test_context_rebuild_changes_only_similar_projects() -> None:
    match = CnbSimilarProjectMatch(
        funding_record_id=uuid4(),
        fit_rationale="Comparable funded project.",
    )
    original = {
        "cc_context": {"city": "Exampleville"},
        "similar_projects": [],
        "document_context": {"chapters": ["Summary"]},
    }

    rebuilt = rebuild_similar_projects_section(original, [match])

    assert rebuilt["similar_projects"][0]["funding_record_id"] == str(
        match.funding_record_id
    )
    assert rebuilt["cc_context"] == original["cc_context"]
    assert rebuilt["document_context"] == original["document_context"]
