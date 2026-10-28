from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictContract(BaseModel):
    """Reject fields that are not part of the compact CNB contract."""

    model_config = ConfigDict(extra="forbid")


class ConceptNoteCityContextRequest(StrictContract):
    """City selected for the run and optional persisted HIAP projection."""

    city_id: UUID
    include_hiap: bool = False
    language: Literal["en", "es", "pt", "de", "fr"] = "en"


class GhgiDataState(StrictContract):
    """Counts of GHGI values by source or notation state."""

    third_party: int = Field(ge=0)
    manual_or_uploaded: int = Field(ge=0)
    not_estimated: int = Field(ge=0)
    not_occurring: int = Field(ge=0)


class GhgiSector(StrictContract):
    """Compact GPC sector status and emissions."""

    gpc: Literal["I", "II", "III", "IV", "V"]
    name: str
    emissions_kgco2e: float
    share_pct: float
    completion_pct: int = Field(ge=0, le=100)
    required: int = Field(ge=0)
    filled: int = Field(ge=0)
    missing: int = Field(ge=0)
    data_state: GhgiDataState


class GhgiTopSource(StrictContract):
    """One of the inventory's highest-emitting subsector and scope rows."""

    sector: str
    subsector: str
    scope: str | None
    emissions_kgco2e: float
    share_pct: float


class GhgiInventory(StrictContract):
    """Inventory identity and calculation metadata."""

    id: UUID
    year: int | None
    type: str | None
    gwp: str | None


class GhgiEmissions(StrictContract):
    """Compact inventory emissions suitable for the CNB context bundle."""

    total_kgco2e: float
    sectors: list[GhgiSector] = Field(min_length=5, max_length=5)
    top_sources: list[GhgiTopSource] = Field(max_length=5)

    @model_validator(mode="after")
    def validate_sector_order(self) -> GhgiEmissions:
        """Require the complete canonical GPC I-V sector sequence."""
        if [sector.gpc for sector in self.sectors] != ["I", "II", "III", "IV", "V"]:
            raise ValueError("GHGI sectors must be ordered from GPC I through V")
        return self


class GhgiContext(StrictContract):
    """Available, partial, or missing GHGI context."""

    availability: Literal["available", "partial", "missing"]
    inventory: GhgiInventory | None
    emissions: GhgiEmissions | None

    @model_validator(mode="after")
    def validate_availability_shape(self) -> GhgiContext:
        """Keep missing and populated GHGI response variants unambiguous."""
        if self.availability == "missing":
            if self.inventory is not None or self.emissions is not None:
                raise ValueError("Missing GHGI must not contain inventory data")
        elif self.inventory is None or self.emissions is None:
            raise ValueError("Available GHGI requires inventory and emissions")
        return self


class HiapAction(StrictContract):
    """One selected or persisted ranked high-impact action."""

    action_id: str
    name: str
    type: Literal["mitigation", "adaptation"]
    rank: int | None = Field(default=None, ge=1)
    selected: bool
    source: Literal["ranked", "unranked"]
    language: Literal["en", "es", "pt", "de", "fr"]
    description: str | None
    sectors: list[str]
    hazards: list[str]
    primary_purposes: list[str]
    timeline: str | None
    investment_cost: str | None
    explanation: str | None

    @model_validator(mode="after")
    def validate_source_rank(self) -> HiapAction:
        """Keep ranked and unranked action variants explicit."""
        if self.source == "ranked" and self.rank is None:
            raise ValueError("Ranked HIAP actions require a rank")
        if self.source == "unranked" and self.rank is not None:
            raise ValueError("Unranked HIAP actions must not contain a rank")
        return self


class HiapCounts(StrictContract):
    """Counts that explain the selected or fallback HIAP projection."""

    ranked: int = Field(ge=0)
    selected: int = Field(ge=0)
    returned: int = Field(ge=0)


class HiapCategoryContext(StrictContract):
    """Persisted HIAP state and projected actions for one action type."""

    status: Literal["available", "pending", "failed", "missing"]
    ranking_id: UUID | None
    updated_at: datetime | None
    language: Literal["en", "es", "pt", "de", "fr"]
    selection_mode: Literal["city_selected", "ranked_fallback", "none"]
    counts: HiapCounts
    actions: list[HiapAction]

    @model_validator(mode="after")
    def validate_action_summary(self) -> HiapCategoryContext:
        """Require unique actions and counts consistent with the projection."""
        if self.counts.returned != len(self.actions):
            raise ValueError("HIAP returned action count must match actions")
        if len({action.action_id for action in self.actions}) != len(self.actions):
            raise ValueError("HIAP action IDs must be unique")
        if self.selection_mode == "city_selected":
            if not self.actions or not all(action.selected for action in self.actions):
                raise ValueError("Selected HIAP projection requires selected actions")
            if self.counts.selected != len(self.actions):
                raise ValueError("HIAP selected count must match returned actions")
        elif self.selection_mode == "ranked_fallback":
            if any(action.selected for action in self.actions):
                raise ValueError("HIAP fallback actions must not be selected")
            if self.counts.selected != 0 or self.counts.ranked != len(self.actions):
                raise ValueError("HIAP fallback must return every ranked action")
        elif self.actions or self.counts.selected or self.counts.returned:
            raise ValueError("Empty HIAP projection must have zero returned actions")
        return self


class HiapContext(StrictContract):
    """Read-only HIAP context for the same inventory selected for GHGI."""

    availability: Literal["available", "pending", "failed", "missing"]
    inventory_id: UUID | None
    requested_language: Literal["en", "es", "pt", "de", "fr"]
    mitigation: HiapCategoryContext
    adaptation: HiapCategoryContext

    @model_validator(mode="after")
    def validate_categories(self) -> HiapContext:
        """Require category types and an availability consistent with both."""
        if any(action.type != "mitigation" for action in self.mitigation.actions):
            raise ValueError("Mitigation context contains another action type")
        if any(action.type != "adaptation" for action in self.adaptation.actions):
            raise ValueError("Adaptation context contains another action type")
        statuses = {
            self.mitigation.status,
            self.adaptation.status,
        }
        expected = "missing"
        for candidate in ("available", "pending", "failed"):
            if candidate in statuses:
                expected = candidate
                break
        if self.availability != expected:
            raise ValueError("HIAP availability must match category status")
        if self.inventory_id is None and self.availability != "missing":
            raise ValueError("HIAP without an inventory must be missing")
        return self


class ConceptNoteCcContext(StrictContract):
    """CityCatalyst context fragment returned to CNB."""

    ghgi: GhgiContext
    hiap: HiapContext | None = None


class ConceptNoteContextBundleFragment(StrictContract):
    """Response wrapper for the compact CityCatalyst context."""

    cc_context: ConceptNoteCcContext


class ConceptNoteCityContextResponse(StrictContract):
    """Persisted city-context snapshot returned to CNB."""

    run_id: UUID
    city_id: UUID
    context_bundle: ConceptNoteContextBundleFragment
