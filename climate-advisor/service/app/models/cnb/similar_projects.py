"""Pydantic contracts for internal Concept Note Builder similar-project matching."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, model_validator


def _ensure_unique(values: list[str], field_name: str) -> None:
    """Reject duplicate identifiers or repeated normalized tags."""
    seen: set[str] = set()
    duplicates: set[str] = set()
    for value in values:
        if value in seen:
            duplicates.add(value)
        seen.add(value)
    if duplicates:
        duplicate_list = ", ".join(sorted(duplicates))
        raise ValueError(f"{field_name} values must be unique: {duplicate_list}")


def _require_utc_datetime(value: datetime, field_name: str) -> None:
    """Require an aware UTC datetime for persisted review artifacts."""
    if value.tzinfo is None or value.utcoffset() != timezone.utc.utcoffset(value):
        raise ValueError(f"{field_name} must be a UTC datetime")


class SimilarProjectsModel(BaseModel):
    """Base model that rejects fields outside the matching contract."""

    model_config = ConfigDict(extra="forbid")


class CnbSimilarProjectSearchRequest(SimilarProjectsModel):
    """Current project profile used for discovery and internal matching.

    At least one material semantic field is required in addition to metadata.
    """

    run_id: UUID
    funder_id: UUID | None = None
    funder_scope: Literal["same_funder", "cross_funder"] = "same_funder"
    project_name: str | None = None
    project_summary: str | None = None
    category: str | None = None
    sector: str | None = None
    region: str | None = None
    country: str | None = None
    finance_route: str | None = None
    instrument_type: str | None = None
    applicant_type: str | None = None
    hazards: list[str] = Field(default_factory=list)
    interventions: list[str] = Field(default_factory=list)
    project_tags: list[str] = Field(default_factory=list)
    known_gaps: list[str] = Field(default_factory=list)
    limit: int = Field(default=10, gt=0, le=50)

    @model_validator(mode="after")
    def validate_search_context(self) -> "CnbSimilarProjectSearchRequest":
        """Require a meaningful project profile and same-funder identity."""
        if self.funder_scope == "same_funder" and self.funder_id is None:
            raise ValueError("funder_id is required when funder_scope=same_funder")

        scalar_fields = (
            self.project_name,
            self.project_summary,
            self.category,
            self.sector,
            self.region,
            self.country,
            self.finance_route,
            self.instrument_type,
            self.applicant_type,
        )
        list_fields = (self.hazards, self.interventions, self.project_tags)
        has_scalar_context = any(value and value.strip() for value in scalar_fields)
        has_list_context = any(
            item.strip() for values in list_fields for item in values
        )
        if not has_scalar_context and not has_list_context:
            raise ValueError(
                "at least one material semantic project field is required"
            )
        return self


class CnbSimilarProjectReviewSource(SimilarProjectsModel):
    """Lightweight source reference retained in local review snapshots."""

    source_ref: str
    url: HttpUrl
    title: str | None = None


class CnbSimilarProjectEvidence(SimilarProjectsModel):
    """Source-grounded support retained for one candidate project."""

    evidence_ref: str
    source_ref: str
    target_path: str
    source_location: str | None = None
    quote_or_summary: str


class CnbSimilarProjectCandidate(SimilarProjectsModel):
    """One funded-project candidate retrieved from reviewed reference data."""

    funding_record_id: UUID
    funder_id: UUID
    funder_name: str | None = None
    is_opportunity: bool
    is_funded_award: bool
    award_status: str | None = None
    award_amount: Decimal | None = None
    currency: str | None = None
    award_year: int | None = None
    name: str
    applicant_name: str | None = None
    applicant_type: str | None = None
    city: str | None = None
    state_region: str | None = None
    country: str | None = None
    category: str | None = None
    sector: str | None = None
    hazards: list[str] = Field(default_factory=list)
    interventions: list[str] = Field(default_factory=list)
    finance_route: str | None = None
    instrument_type: str | None = None
    region_scope: str | None = None
    summary: str | None = None
    project_tags: list[str] = Field(default_factory=list)
    known_gaps: list[str] = Field(default_factory=list)
    evidence: list[CnbSimilarProjectEvidence] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_unique_evidence_refs(self) -> "CnbSimilarProjectCandidate":
        """Keep retained evidence references unambiguous for validation."""
        _ensure_unique(
            [item.evidence_ref for item in self.evidence],
            "candidate.evidence.evidence_ref",
        )
        return self


class CnbSimilarProjectLlmDecision(SimilarProjectsModel):
    """Structured decision that the LLM must return for every shortlist item."""

    funding_record_id: UUID
    decision: Literal["selected", "rejected"]
    fit_rationale: str = Field(min_length=1)
    matched_tags: list[str] = Field(default_factory=list)
    evidence_refs: list[str] = Field(default_factory=list)
    caveats: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_unique_lists(self) -> "CnbSimilarProjectLlmDecision":
        """Reject duplicate tags or evidence references inside one decision."""
        _ensure_unique(self.matched_tags, "decision.matched_tags")
        _ensure_unique(self.evidence_refs, "decision.evidence_refs")
        return self


class CnbSimilarProjectLlmDecisionSet(SimilarProjectsModel):
    """Collection returned by the structured LLM selection step."""

    decisions: list[CnbSimilarProjectLlmDecision]

    @model_validator(mode="after")
    def validate_unique_funding_record_ids(self) -> "CnbSimilarProjectLlmDecisionSet":
        """Require exactly one LLM decision per shortlisted funding record."""
        _ensure_unique(
            [str(item.funding_record_id) for item in self.decisions],
            "decisions.funding_record_id",
        )
        return self


class CnbSimilarProjectMatch(SimilarProjectsModel):
    """Final selected similar project retained in the context bundle."""

    funding_record_id: UUID
    decision: Literal["selected"] = "selected"
    fit_rationale: str = Field(min_length=1)
    matched_tags: list[str] = Field(default_factory=list)
    evidence: list[CnbSimilarProjectEvidence] = Field(default_factory=list)
    caveats: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_unique_lists(self) -> "CnbSimilarProjectMatch":
        """Reject duplicate tags or evidence references in persisted matches."""
        _ensure_unique(self.matched_tags, "match.matched_tags")
        _ensure_unique(
            [item.evidence_ref for item in self.evidence],
            "match.evidence.evidence_ref",
        )
        return self


class CnbSimilarProjectSearchResult(SimilarProjectsModel):
    """Internal matching result retained after one service execution."""

    status: Literal["completed", "skipped_upload_not_ingested"]
    matches: list[CnbSimilarProjectMatch] = Field(default_factory=list)
    caveats: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_unique_match_ids(self) -> "CnbSimilarProjectSearchResult":
        """Keep stored similar projects one-to-one with funding records."""
        _ensure_unique(
            [str(item.funding_record_id) for item in self.matches],
            "matches.funding_record_id",
        )
        return self


class CnbSimilarProjectSearchRunResult(SimilarProjectsModel):
    """Workflow-facing wrapper around the internal result and generic signal."""

    completion_signal: Literal["concept_note_context_bundle_ready"] | None = None
    result: CnbSimilarProjectSearchResult

    @model_validator(mode="after")
    def validate_completion_signal(self) -> "CnbSimilarProjectSearchRunResult":
        """Tie the generic completion signal to completed matching runs only."""
        if self.result.status == "completed" and self.completion_signal is None:
            raise ValueError("completed matching runs must emit completion_signal")
        if (
            self.result.status == "skipped_upload_not_ingested"
            and self.completion_signal is not None
        ):
            raise ValueError(
                "skipped matching runs must not emit a completion_signal"
            )
        return self


class CnbSimilarProjectReviewedArtifactPair(SimilarProjectsModel):
    """Resolved paths for one paired research and review artifact."""

    research_path: str = Field(min_length=1)
    review_path: str = Field(min_length=1)


class CnbSimilarProjectReviewedArtifactProvenance(SimilarProjectsModel):
    """Inputs used to derive candidates from reviewed research artifacts."""

    funder_snapshot_path: str = Field(min_length=1)
    artifact_pairs: list[CnbSimilarProjectReviewedArtifactPair] = Field(
        min_length=1
    )


class CnbSimilarProjectReviewRunMetadata(SimilarProjectsModel):
    """Code-owned metadata for one local similar-project review snapshot."""

    model_name: str
    reasoning_effort: Literal["low", "medium", "high"]
    prompt_sha256: str
    input_mode: Literal[
        "local_review_snapshot",
        "reviewed_artifact_pairs",
    ] = "local_review_snapshot"
    source_bundle: str | None = None
    reviewed_artifact_provenance: (
        CnbSimilarProjectReviewedArtifactProvenance | None
    ) = None

    @model_validator(mode="after")
    def validate_input_provenance(self) -> "CnbSimilarProjectReviewRunMetadata":
        """Require provenance fields that match the declared input mode."""
        if self.input_mode == "local_review_snapshot":
            if self.reviewed_artifact_provenance is not None:
                raise ValueError(
                    "local_review_snapshot metadata must not include "
                    "reviewed_artifact_provenance"
                )
            return self
        if self.source_bundle is not None:
            raise ValueError(
                "reviewed_artifact_pairs metadata must not include source_bundle"
            )
        if self.reviewed_artifact_provenance is None:
            raise ValueError(
                "reviewed_artifact_pairs metadata requires "
                "reviewed_artifact_provenance"
            )
        return self


class CnbSimilarProjectReviewState(SimilarProjectsModel):
    """Human review state for locally generated similar-project artifacts."""

    status: Literal["pending_review", "approved", "needs_changes", "rejected"]


class CnbSimilarProjectReviewRunInput(SimilarProjectsModel):
    """Local runner input snapshot retained ahead of human review."""

    search_request: CnbSimilarProjectSearchRequest
    candidates: list[CnbSimilarProjectCandidate]
    sources: list[CnbSimilarProjectReviewSource] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_input_consistency(self) -> "CnbSimilarProjectReviewRunInput":
        """Keep candidate and source identity aligned with the search request."""
        _ensure_unique(
            [str(item.funding_record_id) for item in self.candidates],
            "candidates.funding_record_id",
        )
        _ensure_unique(
            [item.source_ref for item in self.sources],
            "sources.source_ref",
        )
        if self.search_request.funder_scope == "same_funder":
            for candidate in self.candidates:
                if candidate.funder_id != self.search_request.funder_id:
                    raise ValueError(
                        "candidates.funder_id must match "
                        "search_request.funder_id when funder_scope=same_funder"
                    )
        return self


class CnbSimilarProjectReviewRunArtifact(SimilarProjectsModel):
    """Canonical local review artifact emitted by the similar-project runner."""

    artifact_type: Literal["cnb_similar_project_search"] = (
        "cnb_similar_project_search"
    )
    schema_version: Literal["1.0"] = "1.0"
    run_id: UUID
    generated_at: datetime
    run_metadata: CnbSimilarProjectReviewRunMetadata
    search_request: CnbSimilarProjectSearchRequest
    candidates: list[CnbSimilarProjectCandidate]
    completion_signal: Literal["concept_note_context_bundle_ready"] | None = None
    result: CnbSimilarProjectSearchResult
    sources: list[CnbSimilarProjectReviewSource] = Field(default_factory=list)
    review: CnbSimilarProjectReviewState

    @model_validator(mode="after")
    def validate_review_artifact(self) -> "CnbSimilarProjectReviewRunArtifact":
        """Keep one generated review artifact internally self-consistent."""
        _require_utc_datetime(self.generated_at, "generated_at")
        CnbSimilarProjectReviewRunInput(
            search_request=self.search_request,
            candidates=self.candidates,
            sources=self.sources,
        )
        if self.run_id != self.search_request.run_id:
            raise ValueError("run_id must match search_request.run_id")
        if self.review.status != "pending_review":
            raise ValueError(
                "runner-generated review artifacts must start pending_review"
            )

        candidate_map = {
            item.funding_record_id: item
            for item in self.candidates
        }
        for match in self.result.matches:
            candidate = candidate_map.get(match.funding_record_id)
            if candidate is None:
                raise ValueError(
                    "result.matches.funding_record_id must reference a candidate"
                )
            candidate_evidence_refs = {item.evidence_ref for item in candidate.evidence}
            invalid_refs = {
                item.evidence_ref for item in match.evidence
            } - candidate_evidence_refs
            if invalid_refs:
                invalid_list = ", ".join(sorted(invalid_refs))
                raise ValueError(
                    "result.matches.evidence must reference candidate evidence: "
                    f"{invalid_list}"
                )

        CnbSimilarProjectSearchRunResult(
            completion_signal=self.completion_signal,
            result=self.result,
        )
        return self
