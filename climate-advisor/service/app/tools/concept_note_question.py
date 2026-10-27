"""Present a CNB question in the assistant message without changing the document."""

import logging
from typing import Annotated

from agents import function_tool
from pydantic import (
    BaseModel,
    Field,
    StringConstraints,
    ValidationError,
    field_validator,
)

logger = logging.getLogger(__name__)
Answer = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)
]


class ConceptNoteQuestion(BaseModel):
    """One assistant message and a bounded set of distinct suggested answers."""

    message: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)
    ]
    options: list[Answer] = Field(min_length=2, max_length=6)

    @field_validator("options")
    @classmethod
    def distinct_options(cls, values: list[str]) -> list[str]:
        """Reject duplicate choices instead of presenting ambiguous buttons."""
        if len({value.casefold() for value in values}) != len(values):
            raise ValueError("Answers must be distinct")
        return values


def saved_question_choices(tools: object) -> list[str] | None:
    """Expose validated answer labels from history, never raw tool results."""
    if not isinstance(tools, list):
        return None
    for tool in reversed(tools):
        if (
            not isinstance(tool, dict)
            or tool.get("name") != "concept_note_ask_question"
        ):
            continue
        try:
            return ConceptNoteQuestion.model_validate(tool.get("result_json")).options
        except ValidationError:
            return None
    return None


# A malformed question must surface the existing retry UI, not end as an empty reply.
@function_tool(failure_error_function=None)
async def concept_note_ask_question(question: ConceptNoteQuestion) -> str:
    """End this turn with an interactive question inside the assistant message.

    message contains your concise user-facing explanation and ONE question as
    Markdown. options contains 2-6 short, contextual answer texts, without letter
    prefixes. The UI adds A/B/C labels and a free-text answer automatically.
    Use only when concrete choices make a clarification or next-step decision
    easier for the user. Do not use for direct answers, acknowledgements, or
    open-ended questions. It is optional, including after a previous choice.
    It only presents choices;
    it never edits the document, submits anything, or authorizes another tool.
    """
    logger.info("Presenting CNB question with %d options", len(question.options))
    return question.model_dump_json()
