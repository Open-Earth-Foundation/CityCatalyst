"""Contracts for a focused, read-only set of gap-filling questions."""

from typing import Annotated
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)


class GapQuestionRequest(BaseModel):
    """Identify the chapter and gap; question also supports legacy inline markers."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    chapter_id: UUID
    gap_id: UUID | None = None
    question: str = Field(min_length=1, max_length=2000)
    language: str = Field(default="en", pattern=r"^[a-z]{2}(?:-[A-Za-z]{2})?$")


class GapSubQuestion(BaseModel):
    """One part of the gap; categories are choices, never source-backed facts."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    # The prompt asks for 160; the margin keeps one long question from failing the set.
    question: str = Field(min_length=1, max_length=240)
    options: list[
        Annotated[
            str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)
        ]
    ] = Field(max_length=5)
    # A document type or office that usually holds the answer, never a citation.
    where_to_find: str = Field(default="", max_length=200)
    # The UI shows its own "still correct" and "changed, enter the value" choices.
    confirms: bool = False

    @field_validator("options")
    @classmethod
    def validate_options(cls, value: list[str]) -> list[str]:
        """Allow free text or at least two distinct choices, never a lone fact."""
        if len(value) == 1 or len({option.casefold() for option in value}) != len(
            value
        ):
            raise ValueError("Use no options or two to five distinct options")
        return value

    @model_validator(mode="after")
    def validate_confirmation(self) -> "GapSubQuestion":
        """A confirmation's choices come from the UI, so it carries none."""
        if self.confirms and self.options:
            raise ValueError("A confirmation question has no options")
        return self


class GapQuestionOutput(BaseModel):
    """Every still-missing part of one gap, so complete answers can close it."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    why_asking: str = Field(min_length=1, max_length=240)
    questions: list[GapSubQuestion] = Field(min_length=1, max_length=4)
