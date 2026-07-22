"""Tests for internal Concept Note Builder similar-project matching service."""

from __future__ import annotations

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
from app.services.cnb_reference_data_client import UnavailableCnbReferenceDataClient
from app.services.cnb_similar_project_search import (
    ProjectMatchingService,
    rebuild_similar_projects_section,
)


class FakeWorkflowStore:
    """Minimal in-memory workflow store for unit tests."""

    def __init__(self, *, ingested: bool) -> None:
        self.ingested = ingested
        self.checked_run_ids: list[UUID] = []
        self.replaced: list[tuple[UUID, list[CnbSimilarProjectMatch]]] = []
        self.rebuilt: list[
            tuple[UUID, list[CnbSimilarProjectMatch], list[str]]
        ] = []

    def has_ingested_project_upload(self, *, run_id: UUID) -> bool:
        """Record and return the configured ingestion state."""
        self.checked_run_ids.append(run_id)
        return self.ingested

    def replace_selected_similar_project_matches(
        self,
        *,
        run_id: UUID,
        matches: list[CnbSimilarProjectMatch],
    ) -> None:
        """Capture the replace call for assertions."""
        self.replaced.append((run_id, matches))

    def rebuild_similar_projects_context(
        self,
        *,
        run_id: UUID,
        matches: list[CnbSimilarProjectMatch],
        caveats: list[str],
    ) -> None:
        """Capture the context rebuild call for assertions."""
        self.rebuilt.append((run_id, matches, caveats))


class FakeReferenceDataClient:
    """Return a configured candidate list and record request parameters."""

    def __init__(self, candidates: list[CnbSimilarProjectCandidate]) -> None:
        self.candidates = candidates
        self.calls: list[dict[str, object]] = []

    def list_funded_project_candidates(
        self,
        *,
        funder_id: UUID | None,
        limit: int,
    ) -> list[CnbSimilarProjectCandidate]:
        """Store each retrieval call for later assertions."""
        self.calls.append({"funder_id": funder_id, "limit": limit})
        return self.candidates


class FakeResponses:
    """Return one prepared structured result and record parse requests."""

    def __init__(self, parsed_output: CnbSimilarProjectLlmDecisionSet | None) -> None:
        self.parsed_output = parsed_output
        self.calls: list[dict[str, object]] = []

    def parse(self, **kwargs: object) -> SimpleNamespace:
        """Match the small Responses API surface used by the service."""
        self.calls.append(kwargs)
        return SimpleNamespace(
            id="response-001",
            output=[],
            output_parsed=self.parsed_output,
        )


class FakeOpenAI:
    """Expose only the ``responses.parse`` surface used by the service."""

    def __init__(self, parsed_output: CnbSimilarProjectLlmDecisionSet | None) -> None:
        self.responses = FakeResponses(parsed_output)


def build_request(
    *,
    limit: int = 2,
    funder_scope: str = "same_funder",
) -> CnbSimilarProjectSearchRequest:
    """Create one valid internal matching request."""
    return CnbSimilarProjectSearchRequest(
        run_id=uuid4(),
        funder_id=uuid4(),
        funder_scope=funder_scope,
        category="Stormwater",
        sector="Adaptation",
        region="MN",
        country="USA",
        finance_route="grant",
        instrument_type="capital grant",
        applicant_type="city",
        hazards=["Flood", "Heat"],
        interventions=["Green Infrastructure"],
        project_tags=["Stormwater", "Flood", "Green Infrastructure", "City Led"],
        known_gaps=["beneficiary group"],
        limit=limit,
    )


def build_candidate(
    *,
    funding_record_id: UUID,
    funder_id: UUID,
    name: str,
    is_opportunity: bool = False,
    is_funded_award: bool = True,
    with_evidence: bool = True,
    award_status: str | None = "awarded",
    category: str | None = "stormwater",
    sector: str | None = "adaptation",
    state_region: str | None = "MN",
    country: str | None = "USA",
    finance_route: str | None = "grant",
    instrument_type: str | None = "capital grant",
    applicant_type: str | None = "city",
    hazards: list[str] | None = None,
    interventions: list[str] | None = None,
    project_tags: list[str] | None = None,
    known_gaps: list[str] | None = None,
) -> CnbSimilarProjectCandidate:
    """Create one candidate record with optional eligibility toggles."""
    evidence = (
        [
            CnbSimilarProjectEvidence(
                evidence_ref=f"ev-{name}-1",
                source_ref=f"source-{name}-1",
                target_path=f"funding_records[{funding_record_id}].summary",
                source_location="Project summary",
                quote_or_summary=f"{name} evidence",
            )
        ]
        if with_evidence
        else []
    )
    return CnbSimilarProjectCandidate(
        funding_record_id=funding_record_id,
        funder_id=funder_id,
        funder_name="Example Funder",
        is_opportunity=is_opportunity,
        is_funded_award=is_funded_award,
        award_status=award_status,
        name=name,
        applicant_name="Example City",
        applicant_type=applicant_type,
        city="Exampleville",
        state_region=state_region,
        country=country,
        category=category,
        sector=sector,
        hazards=hazards or ["flood"],
        interventions=interventions or ["green infrastructure"],
        finance_route=finance_route,
        instrument_type=instrument_type,
        summary=f"{name} summary",
        project_tags=project_tags or ["stormwater", "flood", "green infrastructure"],
        known_gaps=known_gaps or [],
        evidence=evidence,
    )


def test_service_skips_before_upload_ingestion() -> None:
    """No reads or writes should happen before any project upload is ingested."""
    request = build_request()
    store = FakeWorkflowStore(ingested=False)
    reference_data_client = FakeReferenceDataClient([])
    openai_client = FakeOpenAI(parsed_output=None)
    service = ProjectMatchingService(
        openai_client=openai_client,
        workflow_store=store,
        reference_data_client=reference_data_client,
        model_name="gpt-5.6-terra",
        prompt="Match shortlisted projects.",
    )

    result = service.run(request)

    assert result.completion_signal is None
    assert result.result.status == "skipped_upload_not_ingested"
    assert reference_data_client.calls == []
    assert openai_client.responses.calls == []
    assert store.replaced == []
    assert store.rebuilt == []


def test_service_filters_shortlists_and_persists_selected_matches() -> None:
    """The service should shortlist deterministically and persist selected matches."""
    request = build_request(limit=2)
    selected_candidate_id = uuid4()
    secondary_candidate_id = uuid4()
    filtered_out_id = uuid4()
    candidates = [
        build_candidate(
            funding_record_id=secondary_candidate_id,
            funder_id=request.funder_id,
            name="Secondary",
            instrument_type=None,
            project_tags=["stormwater", "city-led"],
        ),
        build_candidate(
            funding_record_id=selected_candidate_id,
            funder_id=request.funder_id,
            name="Primary",
            project_tags=["stormwater", "flood", "city-led"],
            known_gaps=["award recipient type"],
        ),
        build_candidate(
            funding_record_id=filtered_out_id,
            funder_id=uuid4(),
            name="WrongFunder",
        ),
        build_candidate(
            funding_record_id=uuid4(),
            funder_id=request.funder_id,
            name="OpportunityRow",
            is_opportunity=True,
        ),
        build_candidate(
            funding_record_id=uuid4(),
            funder_id=request.funder_id,
            name="NoEvidence",
            with_evidence=False,
        ),
    ]
    parsed_output = CnbSimilarProjectLlmDecisionSet(
        decisions=[
            CnbSimilarProjectLlmDecision(
                funding_record_id=selected_candidate_id,
                decision="selected",
                fit_rationale="Comparable city-led flood resilience project.",
                matched_tags=["stormwater", "flood", "city-led"],
                evidence_refs=["ev-Primary-1"],
                caveats=["Award year is not published."],
            ),
            CnbSimilarProjectLlmDecision(
                funding_record_id=secondary_candidate_id,
                decision="rejected",
                fit_rationale="Too little overlap with the current project.",
                matched_tags=["stormwater", "city-led"],
                evidence_refs=["ev-Secondary-1"],
                caveats=[],
            ),
        ]
    )
    store = FakeWorkflowStore(ingested=True)
    reference_data_client = FakeReferenceDataClient(candidates)
    openai_client = FakeOpenAI(parsed_output=parsed_output)
    service = ProjectMatchingService(
        openai_client=openai_client,
        workflow_store=store,
        reference_data_client=reference_data_client,
        model_name="gpt-5.6-terra",
        prompt="Match shortlisted projects.",
    )

    result = service.run(request)

    assert result.completion_signal == "concept_note_context_bundle_ready"
    assert result.result.status == "completed"
    assert result.result.caveats == []
    assert reference_data_client.calls == [
        {"funder_id": request.funder_id, "limit": 10}
    ]
    assert len(store.replaced) == 1
    assert len(store.rebuilt) == 1
    persisted_run_id, persisted_matches = store.replaced[0]
    assert persisted_run_id == request.run_id
    assert [match.funding_record_id for match in persisted_matches] == [
        selected_candidate_id
    ]
    assert persisted_matches[0].matched_tags == ["stormwater", "flood", "city-led"]
    assert persisted_matches[0].caveats == [
        "Current project gap: beneficiary group",
        "Candidate gap: award recipient type",
        "Award year is not published.",
    ]
    assert [item.evidence_ref for item in persisted_matches[0].evidence] == [
        "ev-Primary-1"
    ]

    parse_call = openai_client.responses.calls[0]
    assert parse_call["model"] == "gpt-5.6-terra"
    assert parse_call["reasoning"] == {"effort": "medium"}
    assert parse_call["instructions"] == "Match shortlisted projects."
    assert parse_call["text_format"] is CnbSimilarProjectLlmDecisionSet
    assert parse_call["store"] is True
    llm_payload = json.loads(parse_call["input"])
    assert set(llm_payload) == {
        "current_project", "selection_limit", "candidates"
    }
    assert llm_payload["selection_limit"] == request.limit
    assert "run_id" not in llm_payload["current_project"]
    assert llm_payload["current_project"]["project_tags"] == [
        "stormwater", "flood", "green-infrastructure", "city-led"
    ]
    shortlist_payload = llm_payload["candidates"]
    assert [item["name"] for item in shortlist_payload] == ["Primary", "Secondary"]
    assert shortlist_payload[0]["project_tags"] == [
        "stormwater", "flood", "city-led"
    ]
    assert shortlist_payload[0]["candidate_caveats"] == [
        "Current project gap: beneficiary group",
        "Candidate gap: award recipient type",
    ]
    assert shortlist_payload[1]["candidate_caveats"] == [
        "Candidate is missing instrument_type for direct comparison.",
        "Current project gap: beneficiary group",
    ]


def test_service_filters_cross_funder_candidates_by_default() -> None:
    """Default matching mode should exclude different-funder candidates."""
    request = build_request(limit=1)
    cross_funder_candidate_id = uuid4()
    same_funder_candidate_id = uuid4()
    candidates = [
        build_candidate(
            funding_record_id=cross_funder_candidate_id,
            funder_id=uuid4(),
            name="OtherFunderProject",
            project_tags=["stormwater", "flood"],
        ),
        build_candidate(
            funding_record_id=same_funder_candidate_id,
            funder_id=request.funder_id,
            name="SameFunderProject",
            project_tags=["stormwater", "flood"],
        ),
    ]
    parsed_output = CnbSimilarProjectLlmDecisionSet(
        decisions=[
            CnbSimilarProjectLlmDecision(
                funding_record_id=same_funder_candidate_id,
                decision="selected",
                fit_rationale="Comparable same-funder project.",
                matched_tags=["stormwater", "flood"],
                evidence_refs=["ev-SameFunderProject-1"],
                caveats=[],
            )
        ]
    )
    service = ProjectMatchingService(
        openai_client=FakeOpenAI(parsed_output=parsed_output),
        workflow_store=FakeWorkflowStore(ingested=True),
        reference_data_client=FakeReferenceDataClient(candidates),
        model_name="gpt-5.6-terra",
        prompt="Match shortlisted projects.",
    )

    result = service.run(request)

    assert [match.funding_record_id for match in result.result.matches] == [
        same_funder_candidate_id
    ]
    llm_payload = json.loads(
        service.openai_client.responses.calls[0]["input"]
    )
    assert [item["funding_record_id"] for item in llm_payload["candidates"]] == [
        str(same_funder_candidate_id)
    ]


def test_service_allows_opt_in_cross_funder_matching() -> None:
    """Cross-funder mode should keep real candidate funder identities."""
    request = build_request(limit=1, funder_scope="cross_funder")
    cross_funder_id = uuid4()
    cross_funder_candidate_id = uuid4()
    candidates = [
        build_candidate(
            funding_record_id=cross_funder_candidate_id,
            funder_id=cross_funder_id,
            name="OtherFunderProject",
            project_tags=["stormwater", "flood", "city-led"],
        )
    ]
    parsed_output = CnbSimilarProjectLlmDecisionSet(
        decisions=[
            CnbSimilarProjectLlmDecision(
                funding_record_id=cross_funder_candidate_id,
                decision="selected",
                fit_rationale="Comparable cross-funder project.",
                matched_tags=["stormwater", "flood", "city-led"],
                evidence_refs=["ev-OtherFunderProject-1"],
                caveats=[],
            )
        ]
    )
    openai_client = FakeOpenAI(parsed_output=parsed_output)
    service = ProjectMatchingService(
        openai_client=openai_client,
        workflow_store=FakeWorkflowStore(ingested=True),
        reference_data_client=FakeReferenceDataClient(candidates),
        model_name="gpt-5.6-terra",
        prompt="Match shortlisted projects.",
    )

    result = service.run(request)

    assert service.reference_data_client.calls == [
        {"funder_id": None, "limit": 5}
    ]
    assert [match.funding_record_id for match in result.result.matches] == [
        cross_funder_candidate_id
    ]
    llm_payload = json.loads(openai_client.responses.calls[0]["input"])
    assert "funder_scope" not in llm_payload["current_project"]
    assert llm_payload["candidates"][0]["funding_record_id"] == str(
        cross_funder_candidate_id
    )
    assert llm_payload["candidates"][0]["funder_id"] == str(cross_funder_id)


def test_service_rejects_missing_decisions_for_shortlist_items() -> None:
    """The LLM must return exactly one selected/rejected decision per shortlist item."""
    request = build_request(limit=1)
    candidate = build_candidate(
        funding_record_id=uuid4(),
        funder_id=request.funder_id,
        name="OnlyCandidate",
    )
    parsed_output = CnbSimilarProjectLlmDecisionSet(decisions=[])
    service = ProjectMatchingService(
        openai_client=FakeOpenAI(parsed_output=parsed_output),
        workflow_store=FakeWorkflowStore(ingested=True),
        reference_data_client=FakeReferenceDataClient([candidate]),
        model_name="gpt-5.6-terra",
        prompt="Match shortlisted projects.",
    )

    with pytest.raises(ValueError, match="must cover every shortlist candidate"):
        service.run(request)


def test_service_can_disable_provider_response_storage() -> None:
    """Local QA runs can avoid retaining request and candidate data at the provider."""
    request = build_request(limit=1)
    candidate = build_candidate(
        funding_record_id=uuid4(),
        funder_id=request.funder_id,
        name="LocalReviewCandidate",
    )
    parsed_output = CnbSimilarProjectLlmDecisionSet(
        decisions=[
            CnbSimilarProjectLlmDecision(
                funding_record_id=candidate.funding_record_id,
                decision="rejected",
                fit_rationale="The candidate is not sufficiently comparable.",
                matched_tags=["stormwater", "flood", "green-infrastructure"],
                evidence_refs=[candidate.evidence[0].evidence_ref],
                caveats=[],
            )
        ]
    )
    openai_client = FakeOpenAI(parsed_output=parsed_output)
    service = ProjectMatchingService(
        openai_client=openai_client,
        workflow_store=FakeWorkflowStore(ingested=True),
        reference_data_client=FakeReferenceDataClient([candidate]),
        model_name="gpt-5.6-terra",
        prompt="Match shortlisted projects.",
        store_responses=False,
    )

    service.run(request)

    assert openai_client.responses.calls[0]["store"] is False


def test_service_rejects_more_selected_matches_than_requested() -> None:
    """Structured output cannot exceed the caller-owned selection limit."""
    request = build_request(limit=1)
    candidates = [
        build_candidate(
            funding_record_id=uuid4(),
            funder_id=request.funder_id,
            name=name,
        )
        for name in ("CandidateOne", "CandidateTwo")
    ]
    parsed_output = CnbSimilarProjectLlmDecisionSet(
        decisions=[
            CnbSimilarProjectLlmDecision(
                funding_record_id=candidate.funding_record_id,
                decision="selected",
                fit_rationale="The supplied fields support a comparison.",
                matched_tags=["stormwater"],
                evidence_refs=[candidate.evidence[0].evidence_ref],
                caveats=[],
            )
            for candidate in candidates
        ]
    )
    service = ProjectMatchingService(
        openai_client=FakeOpenAI(parsed_output=parsed_output),
        workflow_store=FakeWorkflowStore(ingested=True),
        reference_data_client=FakeReferenceDataClient(candidates),
        model_name="gpt-5.6-terra",
        prompt="Match shortlisted projects.",
    )

    with pytest.raises(ValueError, match="selection_limit"):
        service.run(request)


def test_service_rejects_tags_outside_the_exact_overlap() -> None:
    """The LLM cannot claim matched tags that the request and candidate do not share."""
    request = build_request(limit=1)
    candidate_id = uuid4()
    candidate = build_candidate(
        funding_record_id=candidate_id,
        funder_id=request.funder_id,
        name="OnlyCandidate",
        project_tags=["stormwater", "flood"],
    )
    parsed_output = CnbSimilarProjectLlmDecisionSet(
        decisions=[
            CnbSimilarProjectLlmDecision(
                funding_record_id=candidate_id,
                decision="selected",
                fit_rationale="Looks similar.",
                matched_tags=["stormwater", "invented-tag"],
                evidence_refs=["ev-OnlyCandidate-1"],
                caveats=[],
            )
        ]
    )
    service = ProjectMatchingService(
        openai_client=FakeOpenAI(parsed_output=parsed_output),
        workflow_store=FakeWorkflowStore(ingested=True),
        reference_data_client=FakeReferenceDataClient([candidate]),
        model_name="gpt-5.6-terra",
        prompt="Match shortlisted projects.",
    )

    with pytest.raises(ValueError, match="matched_tags must stay within"):
        service.run(request)


def test_service_rejects_evidence_refs_outside_candidate() -> None:
    """The LLM cannot cite evidence that does not belong to the shortlisted candidate."""
    request = build_request(limit=1)
    candidate_id = uuid4()
    candidate = build_candidate(
        funding_record_id=candidate_id,
        funder_id=request.funder_id,
        name="OnlyCandidate",
    )
    parsed_output = CnbSimilarProjectLlmDecisionSet(
        decisions=[
            CnbSimilarProjectLlmDecision(
                funding_record_id=candidate_id,
                decision="selected",
                fit_rationale="Looks similar.",
                matched_tags=["stormwater", "flood", "green-infrastructure"],
                evidence_refs=["missing-evidence"],
                caveats=[],
            )
        ]
    )
    service = ProjectMatchingService(
        openai_client=FakeOpenAI(parsed_output=parsed_output),
        workflow_store=FakeWorkflowStore(ingested=True),
        reference_data_client=FakeReferenceDataClient([candidate]),
        model_name="gpt-5.6-terra",
        prompt="Match shortlisted projects.",
    )

    with pytest.raises(ValueError, match="must reference candidate evidence"):
        service.run(request)


def test_service_rejects_selected_match_without_evidence() -> None:
    """A selected example must retain source-grounded support."""
    request = build_request(limit=1)
    candidate_id = uuid4()
    candidate = build_candidate(
        funding_record_id=candidate_id,
        funder_id=request.funder_id,
        name="OnlyCandidate",
    )
    parsed_output = CnbSimilarProjectLlmDecisionSet(
        decisions=[
            CnbSimilarProjectLlmDecision(
                funding_record_id=candidate_id,
                decision="selected",
                fit_rationale="Looks similar.",
                matched_tags=["stormwater"],
                evidence_refs=[],
                caveats=[],
            )
        ]
    )
    service = ProjectMatchingService(
        openai_client=FakeOpenAI(parsed_output=parsed_output),
        workflow_store=FakeWorkflowStore(ingested=True),
        reference_data_client=FakeReferenceDataClient([candidate]),
        model_name="gpt-5.6-terra",
        prompt="Match shortlisted projects.",
    )

    with pytest.raises(ValueError, match="must cite candidate evidence"):
        service.run(request)


def test_service_completes_with_caveat_when_no_eligible_candidates_exist() -> None:
    """An empty eligible set should clear matches and continue the workflow."""
    request = build_request()
    store = FakeWorkflowStore(ingested=True)
    service = ProjectMatchingService(
        openai_client=FakeOpenAI(parsed_output=None),
        workflow_store=store,
        reference_data_client=FakeReferenceDataClient([]),
        model_name="gpt-5.6-terra",
        prompt="Match shortlisted projects.",
    )

    result = service.run(request)

    assert result.completion_signal == "concept_note_context_bundle_ready"
    assert result.result.matches == []
    assert result.result.caveats == [
        "No eligible funded-project candidates were available for matching."
    ]
    assert store.replaced == [(request.run_id, [])]
    assert store.rebuilt == [
        (
            request.run_id,
            [],
            ["No eligible funded-project candidates were available for matching."],
        )
    ]


def test_service_completes_with_caveat_when_all_candidates_are_rejected() -> None:
    """All-rejected shortlist results should still rebuild the context bundle."""
    request = build_request(limit=1)
    candidate_id = uuid4()
    candidate = build_candidate(
        funding_record_id=candidate_id,
        funder_id=request.funder_id,
        name="OnlyCandidate",
    )
    parsed_output = CnbSimilarProjectLlmDecisionSet(
        decisions=[
            CnbSimilarProjectLlmDecision(
                funding_record_id=candidate_id,
                decision="rejected",
                fit_rationale="Not close enough.",
                matched_tags=["stormwater"],
                evidence_refs=["ev-OnlyCandidate-1"],
                caveats=[],
            )
        ]
    )
    store = FakeWorkflowStore(ingested=True)
    service = ProjectMatchingService(
        openai_client=FakeOpenAI(parsed_output=parsed_output),
        workflow_store=store,
        reference_data_client=FakeReferenceDataClient([candidate]),
        model_name="gpt-5.6-terra",
        prompt="Match shortlisted projects.",
    )

    result = service.run(request)

    assert result.completion_signal == "concept_note_context_bundle_ready"
    assert result.result.matches == []
    assert result.result.caveats == [
        "All shortlisted funded-project candidates were rejected."
    ]
    assert store.replaced == [(request.run_id, [])]
    assert store.rebuilt == [
        (
            request.run_id,
            [],
            ["All shortlisted funded-project candidates were rejected."],
        )
    ]


def test_unavailable_reference_data_client_is_a_safe_default() -> None:
    """The temporary unavailable client should return an empty candidate list."""
    assert UnavailableCnbReferenceDataClient().list_funded_project_candidates(
        funder_id=uuid4(),
        limit=5,
    ) == []
    assert UnavailableCnbReferenceDataClient().list_funded_project_candidates(
        funder_id=None,
        limit=5,
    ) == []


def test_context_rebuild_preserves_every_other_bundle_section() -> None:
    """Targeted rebuilds do not replace the assembled context around matches."""
    match = CnbSimilarProjectMatch(
        funding_record_id=uuid4(),
        fit_rationale="Comparable funded project.",
    )
    original = {
        "cc_context": {"city": {"name": "Exampleville"}},
        "selected_sources": [{"label": "CAP"}],
        "funder_context": {"template": {"name": "Application"}},
        "similar_projects": [],
        "document_context": {"chapters": [{"title": "Summary"}]},
    }

    rebuilt = rebuild_similar_projects_section(original, [match])

    assert rebuilt["similar_projects"][0]["funding_record_id"] == str(
        match.funding_record_id
    )
    for section in (
        "cc_context", "selected_sources", "funder_context", "document_context"
    ):
        assert rebuilt[section] == original[section]
    assert original["similar_projects"] == []
