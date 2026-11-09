from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


class ApplicationContextFunder(BaseModel):
    """Canonical funder attached to a concept-note run."""

    id: UUID
    name: str = Field(min_length=1)


class ApplicationContextOpportunity(BaseModel):
    """Selected funding opportunity attached to a concept-note run."""

    id: UUID
    name: str = Field(min_length=1)


class ApplicationContextTemplate(BaseModel):
    """Deterministic application template exposed to the frontend."""

    id: UUID
    name: str = Field(min_length=1)
    output_format: str | None = None
    chapter_schema: list[dict[str, Any]] = Field(default_factory=list)
    required_fields: list[str] = Field(default_factory=list)


class FundingAddedFrom(BaseModel):
    """How a user-added programme or a note's own template was entered."""

    kind: Literal["document", "manual"]
    filename: str | None = None


class ApplicationContextIncludedSources(BaseModel):
    """Presence of CityCatalyst sections in the persisted run bundle."""

    city: bool = False
    project: bool = False
    ghgi: bool = False
    ccra: bool = False
    hiap: bool = False


class ConceptNoteApplicationContextResponse(BaseModel):
    """Application context envelope for one authorized concept-note run."""

    run_id: UUID
    city_id: UUID
    funder: ApplicationContextFunder | None = None
    opportunity: ApplicationContextOpportunity | None = None
    template: ApplicationContextTemplate | None = None
    # Set only when the note uses its own template instead of a funder's.
    template_source: FundingAddedFrom | None = None
    included_sources: ApplicationContextIncludedSources = Field(
        default_factory=ApplicationContextIncludedSources
    )
