"""Public funding catalogue and explicit run-selection contracts."""

from __future__ import annotations

from decimal import Decimal
from typing import Any
from uuid import UUID

from app.models.cnb.concept_note_application_context import (
    ApplicationContextFunder,
    ApplicationContextOpportunity,
    ApplicationContextTemplate,
)
from pydantic import BaseModel, ConfigDict, Field, model_validator


class FundingCatalogueOpportunity(ApplicationContextOpportunity):
    """Programme facts and its compatible application template."""

    applicant_type: str | None = None
    category: str | None = None
    sector: str | None = None
    region_scope: str | None = None
    finance_route: str | None = None
    instrument_type: str | None = None
    min_award: Decimal | None = None
    max_award: Decimal | None = None
    currency: str | None = None
    status: str | None = None
    summary: str | None = None
    hazards: list[str] = Field(default_factory=list)
    interventions: list[str] = Field(default_factory=list)
    known_gaps: list[str] = Field(default_factory=list)
    template: ApplicationContextTemplate | None = None


class FundingCatalogueFunder(ApplicationContextFunder):
    """An existing database funder, including profiles without programmes."""

    funder_type: str | None = None
    country: str | None = None
    region: str | None = None
    profile: dict[str, Any] = Field(default_factory=dict)
    opportunities: list[FundingCatalogueOpportunity] = Field(default_factory=list)


class FundingCatalogueResponse(BaseModel):
    """Complete database catalogue for browsing and local search."""

    funders: list[FundingCatalogueFunder]


class FundingSelectionRequest(BaseModel):
    """Replace the entire selection and detect stale browser edits."""

    model_config = ConfigDict(extra="forbid")

    funder_id: UUID | None
    selected_funding_opportunity_id: UUID | None
    expected_funder_id: UUID | None
    expected_funding_opportunity_id: UUID | None
    acknowledge_draft_review: bool = False

    @model_validator(mode="after")
    def require_funder_for_opportunity(self) -> FundingSelectionRequest:
        """Prevent an opportunity from being selected without its funder."""
        if self.selected_funding_opportunity_id is not None and self.funder_id is None:
            raise ValueError("A funding opportunity requires a funder")
        return self
