"""Internal CNB similar-project retrieval, LLM selection, and persistence."""

from __future__ import annotations

from dataclasses import dataclass
import json
import logging
from typing import Protocol
from uuid import UUID

from openai import OpenAI
from pydantic import JsonValue

from app.config import get_settings
from app.models.cnb_similar_projects import (
    CnbSimilarProjectCandidate,
    CnbSimilarProjectEvidence,
    CnbSimilarProjectLlmDecision,
    CnbSimilarProjectLlmDecisionSet,
    CnbSimilarProjectMatch,
    CnbSimilarProjectSearchRequest,
    CnbSimilarProjectSearchResult,
    CnbSimilarProjectSearchRunResult,
)
from app.services.cnb_project_tag_normalizer import normalize_project_tags
from app.services.cnb_reference_data_client import (
    CnbReferenceDataClient,
    UnavailableCnbReferenceDataClient,
)

logger = logging.getLogger(__name__)
COMPLETION_SIGNAL = "concept_note_context_bundle_ready"
REFERENCE_FETCH_MULTIPLIER = 5
SHORTLIST_MULTIPLIER = 3
MAX_REFERENCE_CANDIDATES = 100
MAX_SHORTLIST_CANDIDATES = 50


class CnbSimilarProjectsWorkflowStore(Protocol):
    """Persistence contract used by the internal similar-project workflow."""

    def has_ingested_project_upload(self, *, run_id: UUID) -> bool:
        """Return whether at least one project upload finished ingestion."""

    def replace_selected_similar_project_matches(
        self,
        *,
        run_id: UUID,
        matches: list[CnbSimilarProjectMatch],
    ) -> None:
        """Atomically replace the run's selected similar-project matches."""

    def rebuild_similar_projects_context(
        self,
        *,
        run_id: UUID,
        matches: list[CnbSimilarProjectMatch],
        caveats: list[str],
    ) -> None:
        """Rebuild only ``similar_projects`` and its caveats in the context bundle."""


@dataclass(frozen=True)
class ShortlistedCandidate:
    """Code-owned shortlist state used to validate and persist LLM decisions."""

    candidate: CnbSimilarProjectCandidate
    overlap_tags: tuple[str, ...]
    shortlist_caveats: tuple[str, ...]


class ProjectMatchingService:
    """Match one ingested CNB project to curated funded-project examples."""

    def __init__(
        self,
        *,
        openai_client: OpenAI,
        workflow_store: CnbSimilarProjectsWorkflowStore,
        model_name: str,
        prompt: str,
        reasoning_effort: str = "medium",
        store_responses: bool = True,
        reference_data_client: CnbReferenceDataClient | None = None,
    ) -> None:
        """Store injected dependencies for deterministic retrieval and matching."""
        self.openai_client = openai_client
        self.workflow_store = workflow_store
        self.model_name = model_name
        self.prompt = prompt
        self.reasoning_effort = reasoning_effort
        self.store_responses = store_responses
        self.reference_data_client = (
            reference_data_client or UnavailableCnbReferenceDataClient()
        )

    @classmethod
    def from_settings(
        cls,
        *,
        openai_client: OpenAI,
        workflow_store: CnbSimilarProjectsWorkflowStore,
        reference_data_client: CnbReferenceDataClient | None = None,
        store_responses: bool = True,
    ) -> "ProjectMatchingService":
        """Build the matcher from the configured research model and matching prompt."""
        settings = get_settings()
        model_config = settings.llm.models.funding_research
        prompt = settings.llm.prompts.get_prompt("cnb_similar_project_matching")
        return cls(
            openai_client=openai_client,
            workflow_store=workflow_store,
            reference_data_client=reference_data_client,
            model_name=model_config.name,
            reasoning_effort=model_config.reasoning_effort,
            prompt=prompt,
            store_responses=store_responses,
        )

    def run(
        self,
        request: CnbSimilarProjectSearchRequest,
    ) -> CnbSimilarProjectSearchRunResult:
        """Run retrieval, selection, persistence, and context refresh for one run."""
        # Step 1: refuse early when project uploads have not completed ingestion.
        if not self.workflow_store.has_ingested_project_upload(run_id=request.run_id):
            return CnbSimilarProjectSearchRunResult(
                result=CnbSimilarProjectSearchResult(
                    status="skipped_upload_not_ingested",
                    caveats=[
                        (
                            "Similar-project matching skipped because no project "
                            "upload has finished ingestion yet."
                        )
                    ],
                )
            )

        # Step 2: retrieve bounded reviewed candidates and apply hard eligibility.
        candidates = self.reference_data_client.list_funded_project_candidates(
            funder_id=(
                request.funder_id
                if request.funder_scope == "same_funder"
                else None
            ),
            limit=self._reference_fetch_limit(request.limit),
        )
        eligible_candidates = self._filter_eligible_candidates(
            request=request,
            candidates=candidates,
        )

        # Step 3: handle empty candidate pools without blocking the CNB workflow.
        if not eligible_candidates:
            return self._persist_and_complete(
                request=request,
                matches=[],
                caveats=[
                    "No eligible funded-project candidates were available for matching."
                ],
            )

        # Step 4: build a deterministic shortlist and ask the LLM for decisions.
        shortlist = self._build_shortlist(
            request=request,
            candidates=eligible_candidates,
        )
        decision_set = self._select_candidates_with_llm(
            request=request,
            shortlist=shortlist,
        )
        matches = self._build_selected_matches(
            shortlist=shortlist,
            decision_set=decision_set,
        )

        # Step 5: continue with a caveat when the shortlist yields no selected matches.
        result_caveats = (
            ["All shortlisted funded-project candidates were rejected."]
            if not matches
            else []
        )
        return self._persist_and_complete(
            request=request,
            matches=matches,
            caveats=result_caveats,
        )

    def _reference_fetch_limit(self, result_limit: int) -> int:
        """Bound reference-data reads while still allowing a meaningful shortlist."""
        return min(
            max(result_limit * REFERENCE_FETCH_MULTIPLIER, result_limit),
            MAX_REFERENCE_CANDIDATES,
        )

    def _filter_eligible_candidates(
        self,
        *,
        request: CnbSimilarProjectSearchRequest,
        candidates: list[CnbSimilarProjectCandidate],
    ) -> list[CnbSimilarProjectCandidate]:
        """Keep eligible funded-project rows, defaulting to same-funder only."""
        eligible: list[CnbSimilarProjectCandidate] = []
        for candidate in candidates:
            if (
                request.funder_scope == "same_funder"
                and candidate.funder_id != request.funder_id
            ):
                continue
            if candidate.is_opportunity:
                continue
            if not candidate.is_funded_award:
                continue
            if not candidate.evidence:
                continue
            eligible.append(candidate)
        logger.info(
            "CNB similar-project retrieval kept %s/%s eligible candidates for run %s.",
            len(eligible),
            len(candidates),
            request.run_id,
        )
        return eligible

    def _build_shortlist(
        self,
        *,
        request: CnbSimilarProjectSearchRequest,
        candidates: list[CnbSimilarProjectCandidate],
    ) -> list[ShortlistedCandidate]:
        """Sort candidates by structured alignment and curated-tag overlap."""
        normalized_request_tags = normalize_project_tags(request.project_tags)
        ranked_candidates: list[tuple[tuple[object, ...], ShortlistedCandidate]] = []

        for candidate in candidates:
            overlap_tags = self._overlap_tags(
                normalized_request_tags=normalized_request_tags,
                candidate_tags=candidate.project_tags,
            )
            shortlist_caveats = self._missing_field_caveats(
                request=request,
                candidate=candidate,
            )
            priority = self._shortlist_priority(
                request=request,
                candidate=candidate,
                overlap_tags=overlap_tags,
            )
            ranked_candidates.append(
                (
                    priority,
                    ShortlistedCandidate(
                        candidate=candidate,
                        overlap_tags=tuple(overlap_tags),
                        shortlist_caveats=tuple(shortlist_caveats),
                    ),
                )
            )

        shortlist_size = min(
            max(request.limit * SHORTLIST_MULTIPLIER, request.limit),
            MAX_SHORTLIST_CANDIDATES,
        )
        ranked_candidates.sort(key=lambda item: item[0])
        return [item[1] for item in ranked_candidates[:shortlist_size]]

    def _shortlist_priority(
        self,
        *,
        request: CnbSimilarProjectSearchRequest,
        candidate: CnbSimilarProjectCandidate,
        overlap_tags: list[str],
    ) -> tuple[object, ...]:
        """Return a stable priority tuple without exposing any numeric score."""
        hazard_overlap = self._overlap_count(request.hazards, candidate.hazards)
        intervention_overlap = self._overlap_count(
            request.interventions,
            candidate.interventions,
        )
        return (
            -int(self._normalized_equal(request.category, candidate.category)),
            -int(self._normalized_equal(request.sector, candidate.sector)),
            -int(self._normalized_equal(request.region, candidate.state_region)),
            -int(self._normalized_equal(request.country, candidate.country)),
            -int(
                self._normalized_equal(
                    request.finance_route,
                    candidate.finance_route,
                )
            ),
            -int(
                self._normalized_equal(
                    request.instrument_type,
                    candidate.instrument_type,
                )
            ),
            -int(
                self._normalized_equal(request.applicant_type, candidate.applicant_type)
            ),
            -hazard_overlap,
            -intervention_overlap,
            -len(overlap_tags),
            candidate.name.casefold(),
            str(candidate.funding_record_id),
        )

    def _select_candidates_with_llm(
        self,
        *,
        request: CnbSimilarProjectSearchRequest,
        shortlist: list[ShortlistedCandidate],
    ) -> CnbSimilarProjectLlmDecisionSet:
        """Call the injected Responses API client with a strict decision schema."""
        current_project = request.model_dump(
            mode="json",
            exclude={"run_id", "limit", "funder_scope"},
        )
        current_project["project_tags"] = normalize_project_tags(
            request.project_tags
        )
        payload = {
            "current_project": current_project,
            "selection_limit": request.limit,
            "candidates": [
                self._shortlist_payload(item) for item in shortlist
            ],
        }
        logger.info(
            "Running CNB similar-project selection for run %s with %s shortlist items.",
            request.run_id,
            len(shortlist),
        )
        response = self.openai_client.responses.parse(
            model=self.model_name,
            reasoning={"effort": self.reasoning_effort},
            instructions=self.prompt,
            input=json.dumps(payload, ensure_ascii=False),
            text_format=CnbSimilarProjectLlmDecisionSet,
            store=self.store_responses,
        )
        if response.output_parsed is None:
            raise RuntimeError("Similar-project matcher returned no structured output")
        self._validate_decision_set(
            request=request,
            shortlist=shortlist,
            decision_set=response.output_parsed,
        )
        return response.output_parsed

    def _shortlist_payload(
        self,
        shortlisted_candidate: ShortlistedCandidate,
    ) -> dict[str, object]:
        """Render code-owned shortlist context for the model prompt contract."""
        candidate_payload = shortlisted_candidate.candidate.model_dump(mode="json")
        candidate_payload["project_tags"] = normalize_project_tags(
            shortlisted_candidate.candidate.project_tags
        )
        candidate_payload["candidate_caveats"] = list(
            shortlisted_candidate.shortlist_caveats
        )
        return candidate_payload

    def _validate_decision_set(
        self,
        *,
        request: CnbSimilarProjectSearchRequest,
        shortlist: list[ShortlistedCandidate],
        decision_set: CnbSimilarProjectLlmDecisionSet,
    ) -> None:
        """Reject invented IDs, unsupported tags, or foreign evidence references."""
        shortlist_map = {
            item.candidate.funding_record_id: item
            for item in shortlist
        }
        returned_ids = {item.funding_record_id for item in decision_set.decisions}
        expected_ids = set(shortlist_map)
        if returned_ids != expected_ids:
            missing_ids = expected_ids - returned_ids
            extra_ids = returned_ids - expected_ids
            details: list[str] = []
            if missing_ids:
                details.append(
                    f"missing decisions for {', '.join(sorted(map(str, missing_ids)))}"
                )
            if extra_ids:
                details.append(
                    f"unexpected decisions for {', '.join(sorted(map(str, extra_ids)))}"
                )
            raise ValueError(
                "LLM decisions must cover every shortlist candidate exactly once: "
                + "; ".join(details)
            )

        selected_count = sum(
            decision.decision == "selected" for decision in decision_set.decisions
        )
        if selected_count > request.limit:
            raise ValueError(
                "LLM selected more similar projects than selection_limit allows"
            )

        for decision in decision_set.decisions:
            shortlisted_candidate = shortlist_map[decision.funding_record_id]
            self._validate_decision_tags(
                decision=decision,
                shortlisted_candidate=shortlisted_candidate,
            )
            self._validate_decision_evidence(
                decision=decision,
                candidate=shortlisted_candidate.candidate,
            )

    def _validate_decision_tags(
        self,
        *,
        decision: CnbSimilarProjectLlmDecision,
        shortlisted_candidate: ShortlistedCandidate,
    ) -> None:
        """Require matched tags to stay inside the exact normalized overlap set."""
        normalized_tags = normalize_project_tags(decision.matched_tags)
        if normalized_tags != decision.matched_tags:
            raise ValueError(
                "LLM matched_tags must already use the exact normalized overlap tags"
            )
        invalid_tags = set(normalized_tags) - set(shortlisted_candidate.overlap_tags)
        if invalid_tags:
            invalid_list = ", ".join(sorted(invalid_tags))
            raise ValueError(
                "LLM matched_tags must stay within the candidate/request overlap: "
                f"{invalid_list}"
            )

    def _validate_decision_evidence(
        self,
        *,
        decision: CnbSimilarProjectLlmDecision,
        candidate: CnbSimilarProjectCandidate,
    ) -> None:
        """Require evidence references to come from the shortlisted candidate."""
        if decision.decision == "selected" and not decision.evidence_refs:
            raise ValueError("selected matches must cite candidate evidence")
        candidate_evidence_refs = {item.evidence_ref for item in candidate.evidence}
        invalid_refs = set(decision.evidence_refs) - candidate_evidence_refs
        if invalid_refs:
            invalid_list = ", ".join(sorted(invalid_refs))
            raise ValueError(
                "LLM evidence_refs must reference candidate evidence: "
                f"{invalid_list}"
            )

    def _build_selected_matches(
        self,
        *,
        shortlist: list[ShortlistedCandidate],
        decision_set: CnbSimilarProjectLlmDecisionSet,
    ) -> list[CnbSimilarProjectMatch]:
        """Persist only selected decisions and retain referenced evidence rows."""
        shortlist_map = {
            item.candidate.funding_record_id: item
            for item in shortlist
        }
        matches: list[CnbSimilarProjectMatch] = []

        for decision in decision_set.decisions:
            if decision.decision != "selected":
                continue
            shortlisted_candidate = shortlist_map[decision.funding_record_id]
            selected_evidence = self._selected_evidence(
                candidate=shortlisted_candidate.candidate,
                evidence_refs=decision.evidence_refs,
            )
            matches.append(
                CnbSimilarProjectMatch(
                    funding_record_id=decision.funding_record_id,
                    fit_rationale=decision.fit_rationale,
                    matched_tags=decision.matched_tags,
                    evidence=selected_evidence,
                    caveats=self._merge_caveats(
                        shortlist_caveats=shortlisted_candidate.shortlist_caveats,
                        llm_caveats=decision.caveats,
                    ),
                )
            )

        matches.sort(key=lambda item: str(item.funding_record_id))
        return matches

    def _selected_evidence(
        self,
        *,
        candidate: CnbSimilarProjectCandidate,
        evidence_refs: list[str],
    ) -> list[CnbSimilarProjectEvidence]:
        """Keep only the evidence rows explicitly cited by the LLM decision."""
        evidence_by_ref = {item.evidence_ref: item for item in candidate.evidence}
        return [evidence_by_ref[evidence_ref] for evidence_ref in evidence_refs]

    def _persist_and_complete(
        self,
        *,
        request: CnbSimilarProjectSearchRequest,
        matches: list[CnbSimilarProjectMatch],
        caveats: list[str],
    ) -> CnbSimilarProjectSearchRunResult:
        """Replace persisted matches, rebuild similar_projects, and emit one signal."""
        self.workflow_store.replace_selected_similar_project_matches(
            run_id=request.run_id,
            matches=matches,
        )
        self.workflow_store.rebuild_similar_projects_context(
            run_id=request.run_id,
            matches=matches,
            caveats=caveats,
        )
        return CnbSimilarProjectSearchRunResult(
            completion_signal=COMPLETION_SIGNAL,
            result=CnbSimilarProjectSearchResult(
                status="completed",
                matches=matches,
                caveats=caveats,
            ),
        )

    def _overlap_tags(
        self,
        *,
        normalized_request_tags: list[str],
        candidate_tags: list[str],
    ) -> list[str]:
        """Return normalized tag overlap in request order for deterministic reuse."""
        candidate_tag_set = set(normalize_project_tags(candidate_tags))
        return [
            tag for tag in normalized_request_tags
            if tag in candidate_tag_set
        ]

    def _missing_field_caveats(
        self,
        *,
        request: CnbSimilarProjectSearchRequest,
        candidate: CnbSimilarProjectCandidate,
    ) -> list[str]:
        """Explain request/candidate gaps instead of silently excluding records."""
        caveats: list[str] = []
        compared_fields = (
            ("category", request.category, candidate.category),
            ("sector", request.sector, candidate.sector),
            ("region", request.region, candidate.state_region),
            ("country", request.country, candidate.country),
            ("finance_route", request.finance_route, candidate.finance_route),
            ("instrument_type", request.instrument_type, candidate.instrument_type),
            ("applicant_type", request.applicant_type, candidate.applicant_type),
        )
        for field_name, request_value, candidate_value in compared_fields:
            if request_value and not candidate_value:
                caveats.append(
                    f"Candidate is missing {field_name} for direct comparison."
                )
        if request.hazards and not candidate.hazards:
            caveats.append("Candidate is missing hazards for direct comparison.")
        if request.interventions and not candidate.interventions:
            caveats.append(
                "Candidate is missing interventions for direct comparison."
            )
        if request.project_tags and not candidate.project_tags:
            caveats.append("Candidate is missing curated project_tags.")
        caveats.extend(
            f"Current project gap: {gap}" for gap in request.known_gaps
        )
        caveats.extend(
            f"Candidate gap: {gap}" for gap in candidate.known_gaps
        )
        return caveats

    def _merge_caveats(
        self,
        *,
        shortlist_caveats: tuple[str, ...],
        llm_caveats: list[str],
    ) -> list[str]:
        """Combine deterministic shortlist caveats with the LLM's final caveats."""
        merged: list[str] = []
        seen: set[str] = set()
        for caveat in [*shortlist_caveats, *llm_caveats]:
            if caveat in seen:
                continue
            seen.add(caveat)
            merged.append(caveat)
        return merged

    def _overlap_count(
        self,
        left: list[str],
        right: list[str],
    ) -> int:
        """Count normalized list overlap for shortlist ordering only."""
        if not left or not right:
            return 0
        return len(
            set(normalize_project_tags(left))
            & set(normalize_project_tags(right))
        )

    def _normalized_equal(self, left: str | None, right: str | None) -> bool:
        """Compare optional scalar fields using the shared tag normalizer rules."""
        if not left or not right:
            return False
        normalized_left = normalize_project_tags([left])
        normalized_right = normalize_project_tags([right])
        return bool(normalized_left) and normalized_left == normalized_right


def rebuild_similar_projects_section(
    context_bundle: dict[str, JsonValue],
    matches: list[CnbSimilarProjectMatch],
) -> dict[str, JsonValue]:
    """Return a bundle with only ``similar_projects`` rebuilt from matches."""
    updated_bundle = dict(context_bundle)
    updated_bundle["similar_projects"] = [
        match.model_dump(mode="json") for match in matches
    ]
    return updated_bundle
