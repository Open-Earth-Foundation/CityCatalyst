"""Tests for internal Concept Note Builder similar-project matching."""

import json
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from app.models.cnb.similar_projects import (
    CnbSimilarProjectCandidate,
    CnbSimilarProjectEvidence,
    CnbSimilarProjectLlmDecision,
    CnbSimilarProjectLlmDecisionSet,
    CnbSimilarProjectMatch,
    CnbSimilarProjectSearchRequest,
    SimilarProjectSelection,
    SimilarProjectSelections,
)
from app.services.cnb import similar_project_search
from app.services.cnb.similar_project_search import (
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
        self.calls: list[UUID | None] = []

    def list_funded_project_candidates(
        self,
        *,
        funder_id: UUID | None,
    ) -> list[CnbSimilarProjectCandidate]:
        self.calls.append(funder_id)
        return self.candidates


class FakeResponses:
    def __init__(self, decisions: CnbSimilarProjectLlmDecisionSet | None, candidates=None) -> None:
        self.decisions = decisions
        self.candidates = candidates or []
        self.calls: list[dict[str, object]] = []

    def parse(self, **kwargs: object) -> SimpleNamespace:
        self.calls.append(kwargs)
        by_id = {candidate.funded_project_id: candidate for candidate in self.candidates}
        public_decisions = []
        for item in self.decisions.decisions if self.decisions else []:
            candidate = by_id[item.funded_project_id]
            public_decisions.append(SimilarProjectSelection(
                project_name=candidate.name, decision=item.decision, fit_rationale=item.fit_rationale,
                matched_tags=item.matched_tags, caveats=item.caveats,
                evidence_positions=[
                    next(i + 1 for i, evidence in enumerate(candidate.evidence) if evidence.evidence_ref == ref)
                    for ref in item.evidence_refs
                ],
            ))
        return SimpleNamespace(output=[], output_parsed=SimilarProjectSelections(decisions=public_decisions))


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
        funded_project_id=record_id,
        funder_id=funder_id or request.funder_id,
        is_funded_award=True,
        name=name,
        category="stormwater",
        project_tags=["stormwater", "flood", "city-led"],
        evidence=[
            CnbSimilarProjectEvidence(
                evidence_ref=f"evidence-{name}",
                source_ref=f"source-{name}",
                target_path=f"funded_projects[{record_id}].summary",
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
    responses = FakeResponses(decisions, reference_data.candidates)
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


def test_service_does_not_store_provider_responses_by_default(
    monkeypatch,
) -> None:
    direct_service, _ = _service(
        store=FakeStore(),
        reference_data=FakeReferenceData([]),
        decisions=None,
    )
    fake_settings = SimpleNamespace(
        cnb_database_url=None,
        llm=SimpleNamespace(
            models=SimpleNamespace(
                funding_research=SimpleNamespace(
                    name="test-model",
                    reasoning_effort="low",
                )
            ),
            prompts=SimpleNamespace(
                get_prompt=lambda prompt_name: f"Prompt: {prompt_name}"
            ),
        )
    )
    monkeypatch.setattr(
        similar_project_search,
        "get_settings",
        lambda: fake_settings,
    )

    configured_service = ProjectMatchingService.from_settings(
        openai_client=SimpleNamespace(responses=FakeResponses(None)),
        workflow_store=FakeStore(),
    )
    opted_in_service = ProjectMatchingService.from_settings(
        openai_client=SimpleNamespace(responses=FakeResponses(None)),
        workflow_store=FakeStore(),
        store_responses=True,
    )

    assert direct_service.store_responses is False
    assert configured_service.store_responses is False
    assert opted_in_service.store_responses is True


def test_service_uses_postgres_reference_data_when_configured(monkeypatch) -> None:
    """Select the managed CNB reader when the URL is present in settings."""
    fake_settings = SimpleNamespace(
        cnb_database_url="postgresql://configured",
        llm=SimpleNamespace(
            models=SimpleNamespace(
                funding_research=SimpleNamespace(
                    name="test-model",
                    reasoning_effort="low",
                )
            ),
            prompts=SimpleNamespace(
                get_prompt=lambda prompt_name: f"Prompt: {prompt_name}"
            ),
        ),
    )
    monkeypatch.setattr(similar_project_search, "get_settings", lambda: fake_settings)

    service = ProjectMatchingService.from_settings(
        openai_client=SimpleNamespace(responses=FakeResponses(None)),
        workflow_store=FakeStore(),
    )

    assert isinstance(
        service.reference_data_client,
        similar_project_search.PostgresCnbReferenceDataClient,
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
    unfunded = _candidate(request, name="Unfunded").model_copy(
        update={"is_funded_award": False}
    )
    unsupported = _candidate(request, name="Unsupported").model_copy(
        update={"evidence": []}
    )
    decisions = CnbSimilarProjectLlmDecisionSet(
        decisions=[
            CnbSimilarProjectLlmDecision(
                funded_project_id=selected.funded_project_id,
                decision="selected",
                fit_rationale="Comparable city-led flood project.",
                matched_tags=["stormwater", "flood", "city-led"],
                evidence_refs=[selected.evidence[0].evidence_ref],
            ),
            CnbSimilarProjectLlmDecision(
                funded_project_id=less_related.funded_project_id,
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
    assert [match.funded_project_id for match in result.result.matches] == [
        selected.funded_project_id
    ]
    assert store.matches == result.result.matches
    assert store.context == (result.result.matches, [])
    assert reference_data.calls == [request.funder_id]
    payload = json.loads(responses.calls[0]["input"])
    assert responses.calls[0]["store"] is False
    assert [item["name"] for item in payload["candidates"]] == [
        selected.name,
        less_related.name,
    ]
    assert "funded_project_id" not in responses.calls[0]["input"]


def test_v1_policy_keeps_preferred_mismatches_and_unknowns_eligible() -> None:
    """Preferred-field mismatches and gaps must not become implicit hard gates."""
    request = _request().model_copy(
        update={
            "sector": "Water",
            "region": "Region A",
            "country": "Country A",
            "finance_route": "Grant",
            "instrument_type": "Capital grant",
            "applicant_type": "Municipality",
            "hazards": ["Flood"],
            "interventions": ["Green infrastructure"],
        }
    )
    mismatched = _candidate(request, name="Mismatched").model_copy(
        update={
            "category": "Transport",
            "sector": "Mobility",
            "state_region": "Region B",
            "country": "Country B",
            "finance_route": "Loan",
            "instrument_type": "Debt",
            "applicant_type": "Business",
            "hazards": ["Heat"],
            "interventions": ["Electric buses"],
            "project_tags": ["mobility"],
        }
    )
    unknown = _candidate(request, name="Unknown").model_copy(
        update={
            "category": None,
            "sector": None,
            "state_region": None,
            "country": None,
            "finance_route": None,
            "instrument_type": None,
            "applicant_type": None,
            "hazards": [],
            "interventions": [],
            "project_tags": [],
        }
    )
    service, _ = _service(
        store=FakeStore(),
        reference_data=FakeReferenceData([]),
        decisions=None,
    )

    eligible = service._filter_eligible_candidates(
        request=request,
        candidates=[mismatched, unknown],
    )
    shortlist = service._build_shortlist(request=request, candidates=eligible)
    shortlist_by_name = {item.candidate.name: item for item in shortlist}

    assert eligible == [mismatched, unknown]
    assert shortlist_by_name["Mismatched"].shortlist_caveats == ()
    assert shortlist_by_name["Unknown"].shortlist_caveats == (
        "Candidate is missing category for direct comparison.",
        "Candidate is missing sector for direct comparison.",
        "Candidate is missing region for direct comparison.",
        "Candidate is missing country for direct comparison.",
        "Candidate is missing finance_route for direct comparison.",
        "Candidate is missing instrument_type for direct comparison.",
        "Candidate is missing applicant_type for direct comparison.",
        "Candidate is missing hazards for direct comparison.",
        "Candidate is missing interventions for direct comparison.",
        "Candidate is missing curated project_tags.",
    )


def test_cross_funder_mode_reads_all_funders() -> None:
    request = _request(funder_scope="cross_funder")
    candidate = _candidate(request, funder_id=uuid4())
    decisions = CnbSimilarProjectLlmDecisionSet(
        decisions=[
            CnbSimilarProjectLlmDecision(
                funded_project_id=candidate.funded_project_id,
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

    assert reference_data.calls == [None]


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
                    funded_project_id=candidate.funded_project_id,
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
        funded_project_id=uuid4(),
        fit_rationale="Comparable funded project.",
    )
    original = {
        "cc_context": {"city": "Exampleville"},
        "similar_projects": [],
        "document_context": {"chapters": ["Summary"]},
    }

    rebuilt = rebuild_similar_projects_section(original, [match])

    assert rebuilt["similar_projects"][0]["funded_project_id"] == str(
        match.funded_project_id
    )
    assert rebuilt["cc_context"] == original["cc_context"]
    assert rebuilt["document_context"] == original["document_context"]
