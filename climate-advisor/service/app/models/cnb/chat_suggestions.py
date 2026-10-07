"""Contracts for bounded, read-only CNB question suggestions."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator


class ChatSuggestionsRequest(BaseModel):
    """UI context; document and history are loaded from the authorized run."""

    model_config = ConfigDict(extra="forbid")

    language: str = Field(default="en", pattern=r"^[a-z]{2}(?:-[A-Za-z]{2})?$")
    tab: Literal["draft", "structure", "context"] = "draft"


class ChatSuggestionsOutput(BaseModel):
    """Exactly two distinct, concise questions from the model."""

    model_config = ConfigDict(extra="forbid")

    suggestions: list[
        Annotated[
            str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)
        ]
    ] = Field(min_length=2, max_length=2)

    @field_validator("suggestions")
    @classmethod
    def distinct_questions(cls, value: list[str]) -> list[str]:
        """Reject duplicate choices rather than showing them twice."""
        if value[0].casefold() == value[1].casefold():
            raise ValueError("Suggestions must be distinct")
        return value


class ChatSuggestionsResponse(BaseModel):
    """An empty list asks the UI to show its translated deterministic fallback."""

    suggestions: list[str] = Field(default_factory=list)
