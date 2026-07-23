from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictContract(BaseModel):
    """Reject fields that are not part of the compact CNB contract."""

    model_config = ConfigDict(extra="forbid")


class ConceptNoteCityContextRequest(StrictContract):
    """City selected for the concept-note run."""

    city_id: UUID


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
    emissions_tco2e: float
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
    emissions_tco2e: float
    share_pct: float


class GhgiInventory(StrictContract):
    """Inventory identity and calculation metadata."""

    id: UUID
    year: int | None
    type: str | None
    gwp: str | None


class GhgiEmissions(StrictContract):
    """Compact inventory emissions suitable for the CNB context bundle."""

    total_tco2e: float
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


class MeedPlaceholder(StrictContract):
    """Empty MEED state used until a ranking snapshot is supplied."""


class MeedCity(StrictContract):
    """City identity recorded by the supplied MEED ranking."""

    name: str
    locode: str


class MeedInput(StrictContract):
    """Inventory snapshot used as MEED ranking input."""

    inventory_id: UUID
    inventory_year: int
    inventory_values: int = Field(ge=0)
    emitting_values: int = Field(ge=0)


class MeedDataSources(StrictContract):
    """Bounded provenance labels for the MEED ranking inputs."""

    inventory: str
    city: str
    actions: str
    policy: str
    mitigation_feasibility: str
    financial_feasibility: str
    legal: str


class MeedWeights(StrictContract):
    """Resolved MEED pillar weights."""

    impact: float = Field(ge=0, le=1)
    alignment: float = Field(ge=0, le=1)
    feasibility: float = Field(ge=0, le=1)


class MeedCounts(StrictContract):
    """Compact action counts from the MEED pipeline."""

    total_actions: int = Field(ge=0)
    valid_actions: int = Field(ge=0)
    discarded_excluded: int = Field(ge=0)
    discarded_legal: int = Field(ge=0)
    ranked_actions: int = Field(ge=0, le=10)


class MeedScores(StrictContract):
    """MEED final and pillar scores for one action."""

    final: float = Field(ge=0, le=1)
    impact: float = Field(ge=0, le=1)
    alignment: float = Field(ge=0, le=1)
    feasibility: float = Field(ge=0, le=1)


class MeedAction(StrictContract):
    """One compact ranked MEED action."""

    rank: int = Field(ge=1, le=10)
    action_id: str
    name: str
    sector: str | None
    timeline: str | None
    investment_cost: str | None
    scores: MeedScores
    legal_verdict: str | None
    finance_route: str | None


class MeedContext(StrictContract):
    """Externally supplied compact MEED ranking snapshot."""

    availability: Literal["available"]
    city: MeedCity
    executed_at_utc: datetime
    input: MeedInput
    data_sources: MeedDataSources
    weights: MeedWeights
    counts: MeedCounts
    actions: list[MeedAction] = Field(min_length=1, max_length=10)

    @model_validator(mode="after")
    def validate_action_summary(self) -> MeedContext:
        """Require ordered unique actions and a matching ranked count."""
        if self.counts.ranked_actions != len(self.actions):
            raise ValueError("MEED ranked action count must match actions")
        if [action.rank for action in self.actions] != list(
            range(1, len(self.actions) + 1)
        ):
            raise ValueError("MEED actions must use consecutive ranks from one")
        if len({action.action_id for action in self.actions}) != len(self.actions):
            raise ValueError("MEED action IDs must be unique")
        return self


class ConceptNoteCcContext(StrictContract):
    """CityCatalyst context fragment returned to CNB."""

    ghgi: GhgiContext
    meed: MeedPlaceholder | MeedContext = Field(default_factory=MeedPlaceholder)


class ConceptNoteContextBundleFragment(StrictContract):
    """Response wrapper for the compact CityCatalyst context."""

    cc_context: ConceptNoteCcContext


class ConceptNoteCityContextResponse(StrictContract):
    """Persisted city-context snapshot returned to CNB."""

    run_id: UUID
    city_id: UUID
    context_bundle: ConceptNoteContextBundleFragment
