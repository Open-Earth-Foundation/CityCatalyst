"""Contracts for a focused, read-only set of gap-filling questions."""

import logging
from typing import Annotated
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    PositiveInt,
    StringConstraints,
    field_validator,
    model_validator,
)

logger = logging.getLogger(__name__)

MAX_QUESTIONS = 4


class GapQuestionRequest(BaseModel):
    """Identify the chapter and gap; question also supports legacy inline markers."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    chapter_id: UUID
    gap_id: UUID | None = None
    question: str = Field(min_length=1, max_length=2000)
    language: str = Field(default="en", pattern=r"^[a-z]{2}(?:-[A-Za-z]{2})?$")


class GapAnswersRequest(BaseModel):
    """Every answer given so far for one gap version; empty text clears them."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    gap_version: PositiveInt
    answers: str = Field(default="", max_length=8000)
    # The saved answers the form last saw; a save against other text is rejected.
    expected_previous: str | None = Field(max_length=8000)


class GapSubQuestion(BaseModel):
    """One part of the gap; categories are choices, never source-backed facts."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    # The prompt asks for 160; the margin keeps one long question from failing the set.
    question: str = Field(min_length=1, max_length=240)
    # The prompt asks for five (eight for a checklist); the margin keeps one
    # longer list from failing the set.
    options: list[
        Annotated[
            str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)
        ]
    ] = Field(max_length=8)
    # A document type or office that usually holds the answer, never a citation.
    where_to_find: str = Field(default="", max_length=200)
    # The UI shows its own "still correct" and "changed, enter the value" choices.
    confirms: bool = False
    # Several options can apply together, so the UI lets the user select each one.
    multiple: bool = False

    @field_validator("options")
    @classmethod
    def validate_options(cls, value: list[str]) -> list[str]:
        """Allow free text or at least two distinct choices, never a lone fact."""
        if len(value) == 1 or len({option.casefold() for option in value}) != len(
            value
        ):
            raise ValueError("Use no options or at least two distinct options")
        return value

    @model_validator(mode="after")
    def validate_confirmation(self) -> "GapSubQuestion":
        """A confirmation's choices come from the UI, so it carries none."""
        if self.confirms and self.options:
            raise ValueError("A confirmation question has no options")
        # Several answers need options to select; free text already allows them.
        if self.multiple and not self.options:
            self.multiple = False
        return self


class GapQuestionOutput(BaseModel):
    """Every still-missing part of one gap, so complete answers can close it."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    why_asking: str = Field(min_length=1, max_length=240)
    # Empty when earlier answers already cover every part; the UI then sends
    # them again as a complete answer.
    questions: list[GapSubQuestion] = Field(max_length=MAX_QUESTIONS)

    @field_validator("questions", mode="before")
    @classmethod
    def keep_first_questions(cls, value: object) -> object:
        """Trim an over-long set instead of failing it.

        One confirmation per source value can push the model past the limit; a
        dropped part stays open and is asked again once these are answered.
        """
        if isinstance(value, list) and len(value) > MAX_QUESTIONS:
            logger.info(
                "Trimmed gap questions from %d to %d", len(value), MAX_QUESTIONS
            )
            return value[:MAX_QUESTIONS]
        return value
