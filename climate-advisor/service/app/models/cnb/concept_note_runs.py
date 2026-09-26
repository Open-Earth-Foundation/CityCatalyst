from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.cnb.concept_note_markdown import ConceptNoteUploadStatusResponse


class InitialConceptNoteUpload(BaseModel):
    """Immutable expected source identity, persisted before file transfer."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    upload_id: UUID
    filename: str = Field(min_length=1, max_length=255)
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")


class ConceptNoteStartRequest(BaseModel):
    """Authenticated request to create one Concept Note Builder run."""

    model_config = ConfigDict(extra="forbid")

    user_id: str = Field(min_length=1, max_length=255)
    name: str = Field(min_length=1, max_length=120)
    city_id: UUID
    project_id: str | None = Field(default=None, min_length=1, max_length=255)
    funder_id: UUID | None = None
    selected_funding_opportunity_id: UUID | None = None
    thread_id: UUID | None = None
    idempotency_key: UUID
    initial_uploads: list[InitialConceptNoteUpload] = Field(
        default_factory=list, max_length=100
    )

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        """Trim the display name and reject whitespace-only values."""
        normalized = value.strip()
        if not normalized:
            raise ValueError("name must not be blank")
        return normalized

    @field_validator("project_id")
    @classmethod
    def normalize_project_id(cls, value: str | None) -> str | None:
        """Trim an optional external project identifier."""
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("project_id must not be blank")
        return normalized

    @model_validator(mode="after")
    def validate_scope_references(self) -> "ConceptNoteStartRequest":
        """Require a funder whenever a funding opportunity is supplied."""
        if len({source.upload_id for source in self.initial_uploads}) != len(
            self.initial_uploads
        ):
            raise ValueError("Initial upload IDs must be unique")
        if self.selected_funding_opportunity_id is not None and self.funder_id is None:
            raise ValueError(
                "funder_id is required when selected_funding_opportunity_id is provided"
            )
        return self


class ConceptNoteRenameRequest(BaseModel):
    """Validated display-name update for one authorized concept note."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=120)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        """Trim the display name and reject whitespace-only values."""
        normalized = value.strip()
        if not normalized:
            raise ValueError("name must not be blank")
        return normalized


class ManualConceptNotePopulation(BaseModel):
    """Population supplied by a user for one concept-note run only."""

    model_config = ConfigDict(extra="forbid")

    population: int = Field(ge=0, le=10_000_000_000)
    year: int = Field(ge=1800, le=2100)


class ConceptNotePopulationRequest(BaseModel):
    """Set or clear the run-scoped manual population."""

    model_config = ConfigDict(extra="forbid")

    manual_population: ManualConceptNotePopulation | None


class ConceptNoteRunListItemResponse(BaseModel):
    """Stable display and resume fields for one concept-note run."""

    run_id: UUID
    thread_id: UUID | None = None
    name: str = Field(min_length=1)
    city_id: UUID
    project_id: str | None = None
    funder_id: UUID | None = None
    selected_funding_opportunity_id: UUID | None = None
    status: str = Field(min_length=1)
    workflow_step: str = Field(min_length=1)
    progress_summary: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class ConceptNoteRunListResponse(BaseModel):
    """Authorized concept-note runs for one user and city."""

    runs: list[ConceptNoteRunListItemResponse] = Field(default_factory=list)


class ConceptNoteChatThreadResponse(BaseModel):
    """One chat attached to a concept-note run, newest first in listings."""

    thread_id: UUID
    title: str | None = None
    created_at: datetime
    last_message_at: datetime | None = None
    message_count: int = 0
    preview: str | None = None


class ConceptNoteChatThreadListResponse(BaseModel):
    """Every chat attached to one run plus the run's currently active chat."""

    active_thread_id: UUID | None = None
    threads: list[ConceptNoteChatThreadResponse] = Field(default_factory=list)


class ConceptNoteRunResponse(ConceptNoteRunListItemResponse):
    """Persisted concept-note run returned by start and detail endpoints."""

    user_id: str
    manual_population: ManualConceptNotePopulation | None = None
    uploads: list[ConceptNoteUploadStatusResponse] = Field(default_factory=list)
    next_action: Literal["load_context"] = "load_context"
    created: bool
    trace_id: str | None = None
