from __future__ import annotations

from enum import Enum
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, model_validator


class GeographyMatch(str, Enum):
    CITY_DIRECT = "city_direct"
    CITY_PROXY = "city_proxy"
    REGIONAL_PROXY = "regional_proxy"
    COUNTRY_PROXY = "country_proxy"


class CoverageLevel(str, Enum):
    COMPLETE = "complete"
    PARTIAL = "partial"
    MISSING = "missing"


class DraftProposalStatus(str, Enum):
    READY = "ready"
    CONFLICT = "conflict"
    GAP = "gap"


class DraftReviewActionType(str, Enum):
    ACCEPT = "accept"
    OVERRIDE = "override"
    LEAVE_DRAFT = "leave_draft"


class InventoryDraftContext(BaseModel):
    inventory_id: str = Field(..., min_length=1)
    city_id: str = Field(..., min_length=1)
    city_name: str = Field(..., min_length=1)
    locode: str = Field(..., min_length=1)
    country_code: Optional[str] = None
    year: int
    locale: Literal["en", "es", "pt"]


class DraftSubsectorContext(BaseModel):
    code: str = Field(..., min_length=1)
    label: str = Field(..., min_length=1)


class SectorDraftContext(BaseModel):
    code: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    subsectors: List[DraftSubsectorContext] = Field(default_factory=list)


class CurrentSubsectorState(BaseModel):
    subsector_code: str = Field(..., min_length=1)
    existing_value: Optional[float] = None
    existing_unit: Optional[str] = None
    notation_key: Optional[str] = None
    is_locked: bool = False
    source_name: Optional[str] = None


class DraftSourceCandidate(BaseModel):
    source_id: Optional[str] = None
    source_name: str = Field(..., min_length=1)
    value: Optional[float] = None
    unit: Optional[str] = None
    year: Optional[int] = None
    tier: Optional[int] = Field(default=None, ge=1, le=3)
    method: Optional[str] = None
    geography_match: GeographyMatch
    coverage: CoverageLevel
    confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    citation: Optional[str] = None
    rationale_notes: List[str] = Field(default_factory=list)


class SubsectorCandidateSet(BaseModel):
    subsector_code: str = Field(..., min_length=1)
    options: List[DraftSourceCandidate] = Field(default_factory=list)


class DraftPolicy(BaseModel):
    allowed_sources: List[str] = Field(default_factory=list)
    conflict_variance_threshold: float = Field(default=0.15, ge=0.0)
    require_explicit_acceptance: bool = True


class SectorDraftRequest(BaseModel):
    inventory: InventoryDraftContext
    sector: SectorDraftContext
    current_state: List[CurrentSubsectorState] = Field(default_factory=list)
    candidates: List[SubsectorCandidateSet] = Field(default_factory=list)
    policy: DraftPolicy = Field(default_factory=DraftPolicy)


class DraftRecommendation(BaseModel):
    source_id: Optional[str] = None
    value: float
    unit: str = Field(..., min_length=1)
    source_name: str = Field(..., min_length=1)
    source_year: Optional[int] = None
    source_tier: Optional[int] = Field(default=None, ge=1, le=3)
    method: Optional[str] = None
    confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    citation: Optional[str] = None


class SubsectorDraftProposal(BaseModel):
    proposal_id: str = Field(..., min_length=1)
    subsector_code: str = Field(..., min_length=1)
    status: DraftProposalStatus
    recommended: Optional[DraftRecommendation] = None
    alternatives: List[DraftSourceCandidate] = Field(default_factory=list)
    rationale: str = Field(..., min_length=1)
    ui_message: str = Field(..., min_length=1)
    needs_user_choice: bool = False

    @model_validator(mode="after")
    def validate_state(self) -> "SubsectorDraftProposal":
        if self.status == DraftProposalStatus.GAP:
            if self.recommended is not None:
                raise ValueError("gap proposals must not contain a recommended value")
            return self

        if self.recommended is None:
            raise ValueError("ready and conflict proposals must include a recommended value")

        if self.status == DraftProposalStatus.CONFLICT and not self.alternatives:
            raise ValueError("conflict proposals must include at least one alternative")

        return self


class SectorDraftLLMOutput(BaseModel):
    run_id: str = Field(..., min_length=1)
    inventory_id: str = Field(..., min_length=1)
    city_id: str = Field(..., min_length=1)
    city_name: str = Field(..., min_length=1)
    locode: str = Field(..., min_length=1)
    sector_code: str = Field(..., min_length=1)
    locale: Literal["en", "es", "pt"]
    proposals: List[SubsectorDraftProposal] = Field(default_factory=list)


class DraftReviewDecision(BaseModel):
    proposal_id: str = Field(..., min_length=1)
    subsector_code: str = Field(..., min_length=1)
    action: DraftReviewActionType
    selected_source_id: Optional[str] = None
    selected_source_name: Optional[str] = None
    override_value: Optional[float] = None
    override_unit: Optional[str] = None
    note: Optional[str] = None

    @model_validator(mode="after")
    def validate_action_payload(self) -> "DraftReviewDecision":
        if self.action == DraftReviewActionType.OVERRIDE:
            has_source_override = (
                self.selected_source_id is not None
                or self.selected_source_name is not None
            )
            has_manual_override = (
                self.override_value is not None and self.override_unit is not None
            )
            if not has_source_override and not has_manual_override:
                raise ValueError(
                    "override requires a selected source or a manual override_value and override_unit"
                )
            return self

        if any(
            value is not None
            for value in (
                self.selected_source_id,
                self.selected_source_name,
                self.override_value,
                self.override_unit,
            )
        ):
            raise ValueError(
                "accept and leave_draft decisions must not include override fields"
            )

        return self


class ApplyDraftReviewRequest(BaseModel):
    inventory_id: str = Field(..., min_length=1)
    city_id: str = Field(..., min_length=1)
    sector_code: str = Field(..., min_length=1)
    decisions: List[DraftReviewDecision] = Field(..., min_length=1)
