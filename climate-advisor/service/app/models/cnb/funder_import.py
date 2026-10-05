"""Contracts for adding a funder, programme and template to the CNB catalogue.

Field names mirror the existing ``funders``, ``funding_opportunities`` and
``funder_templates`` columns so an added funder is an ordinary catalogue row.
"""

from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class FunderImportContract(BaseModel):
    """Base contract that rejects fields outside the documented shape."""

    model_config = ConfigDict(extra="forbid")


class FunderProfileFacts(FunderImportContract):
    """Profile facts stored in ``funders.profile`` as stated and derived maps."""

    stated: dict[str, str] = Field(default_factory=dict)
    derived: dict[str, str] = Field(default_factory=dict)


class FunderFields(FunderImportContract):
    """Reviewable ``funders`` columns."""

    name: str = Field(default="", max_length=255)
    funder_type: str | None = Field(default=None, max_length=100)
    country: str | None = Field(default=None, max_length=100)
    region: str | None = Field(default=None, max_length=255)
    profile: FunderProfileFacts = Field(default_factory=FunderProfileFacts)


class ProgrammeFields(FunderImportContract):
    """Reviewable ``funding_opportunities`` columns."""

    name: str = Field(default="", max_length=255)
    applicant_type: str | None = Field(default=None, max_length=255)
    category: str | None = Field(default=None, max_length=255)
    sector: str | None = Field(default=None, max_length=255)
    hazards: list[str] = Field(default_factory=list)
    interventions: list[str] = Field(default_factory=list)
    finance_route: str | None = Field(default=None, max_length=255)
    instrument_type: str | None = Field(default=None, max_length=255)
    region_scope: str | None = Field(default=None, max_length=255)
    min_award: Decimal | None = Field(default=None, ge=0, max_digits=18, decimal_places=2)
    max_award: Decimal | None = Field(default=None, ge=0, max_digits=18, decimal_places=2)
    currency: str | None = Field(default=None, max_length=16)
    status: str | None = Field(default=None, max_length=64)
    summary: str | None = None
    known_gaps: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_award_range(self) -> ProgrammeFields:
        """Reject an award range whose minimum exceeds its maximum."""
        if (
            self.min_award is not None
            and self.max_award is not None
            and self.min_award > self.max_award
        ):
            raise ValueError("min_award must not exceed max_award")
        return self


class TemplateChapterFields(FunderImportContract):
    """One ``funder_templates.chapter_schema`` entry."""

    chapter_ref: str = Field(default="", max_length=255)
    title: str = Field(default="", max_length=255)
    description: str | None = None
    required: bool = False
    required_fields: list[str] = Field(default_factory=list)


class TemplateFields(FunderImportContract):
    """Reviewable ``funder_templates`` columns; required_fields is derived."""

    template_name: str = Field(default="", max_length=255)
    output_format: str | None = Field(default=None, max_length=64)
    chapter_schema: list[TemplateChapterFields] = Field(default_factory=list)


class FunderCreateRequest(FunderImportContract):
    """Reviewed values to add to the catalogue."""

    funder: FunderFields
    opportunity: ProgrammeFields
    template: TemplateFields

    @model_validator(mode="after")
    def validate_required_values(self) -> FunderCreateRequest:
        """Require what drafting needs: names and at least one titled chapter."""
        if not self.funder.name.strip():
            raise ValueError("funder.name is required")
        if not self.opportunity.name.strip():
            raise ValueError("opportunity.name is required")
        if not self.template.template_name.strip():
            raise ValueError("template.template_name is required")
        if not self.template.chapter_schema:
            raise ValueError("template.chapter_schema needs at least one chapter")
        if any(not chapter.title.strip() for chapter in self.template.chapter_schema):
            raise ValueError("every template chapter needs a title")
        return self


class FunderCreateResponse(FunderImportContract):
    """Catalogue identifiers to select through the application context."""

    funder_id: UUID
    funding_opportunity_id: UUID
