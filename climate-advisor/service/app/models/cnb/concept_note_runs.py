from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


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


class ConceptNoteRunResponse(ConceptNoteRunListItemResponse):
    """Persisted concept-note run returned by start and detail endpoints."""

    user_id: str
    next_action: Literal["load_context"] = "load_context"
    created: bool
    trace_id: str | None = None
