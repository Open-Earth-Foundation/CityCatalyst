"""Contracts for a focused, read-only gap-filling question."""

from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator


class GapQuestionRequest(BaseModel):
    """Identify the chapter and gap; question also supports legacy inline markers."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    chapter_id: UUID
    gap_id: UUID | None = None
    question: str = Field(min_length=1, max_length=2000)
    language: str = Field(default="en", pattern=r"^[a-z]{2}(?:-[A-Za-z]{2})?$")


class GapQuestionOutput(BaseModel):
    """Possible categories are choices, never claims of source-backed facts."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    question: str = Field(min_length=1, max_length=160)
    why_asking: str = Field(min_length=1, max_length=240)
    options: list[
        Annotated[
            str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)
        ]
    ] = Field(max_length=5)

    @field_validator("options")
    @classmethod
    def validate_options(cls, value: list[str]) -> list[str]:
        """Allow free text or at least two distinct choices, never a lone fact."""
        if len(value) == 1 or len({option.casefold() for option in value}) != len(
            value
        ):
            raise ValueError("Use no options or two to five distinct options")
        return value
