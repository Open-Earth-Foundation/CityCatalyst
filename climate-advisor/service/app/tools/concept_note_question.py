"""Present a CNB question in the assistant message without changing the document."""

import logging
from typing import Annotated, Any, Literal, Self

from agents import function_tool
from pydantic import (
    BaseModel,
    Field,
    StringConstraints,
    ValidationError,
    field_validator,
    model_validator,
)

logger = logging.getLogger(__name__)
# No length cap: an option may be a complete alternative, such as a rewrite.
Answer = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
# What choosing an option does; the card shows it and the server enforces it.
OnAnswer = Literal["reply", "propose_edit"]
INVALID_QUESTION_PREFIX = "INVALID_QUESTION_ARGUMENTS:"


class ConceptNoteQuestion(BaseModel):
    """One assistant message and a bounded set of distinct suggested answers."""

    message: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)
    ]
    options: list[Answer] = Field(min_length=1, max_length=12)
    # Cards saved before on_answer existed only ever answered the question.
    on_answer: OnAnswer = "reply"
    # Names the draft passage a reply option would change; server-owned cards may omit it.
    document_topic: (
        Annotated[
            str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)
        ]
        | None
    ) = None

    @field_validator("options")
    @classmethod
    def distinct_options(cls, values: list[str]) -> list[str]:
        """Reject duplicate choices instead of presenting ambiguous buttons."""
        if len({value.casefold() for value in values}) != len(values):
            raise ValueError("Answers must be distinct")
        return values

    @model_validator(mode="after")
    def require_reply_choices(self) -> Self:
        """A reply card asks a question with at least two suggested answers."""
        if self.on_answer == "reply" and len(self.options) < 2:
            raise ValueError("Reply cards require at least two answers")
        return self


def saved_question_invocation(tools: object) -> dict[str, Any] | None:
    """Return the newest saved question invocation, even when its card is invalid."""
    if not isinstance(tools, list):
        return None
    for tool in reversed(tools):
        if isinstance(tool, dict) and tool.get("name") == "concept_note_ask_question":
            return tool
    return None


def saved_question(tools: object) -> ConceptNoteQuestion | None:
    """Read the validated card from history, never raw tool results."""
    invocation = saved_question_invocation(tools)
    if invocation is None:
        return None
    try:
        return ConceptNoteQuestion.model_validate(invocation.get("result_json"))
    except ValidationError:
        return None


def saved_question_choices(tools: object) -> list[str] | None:
    """Expose validated answer labels from history."""
    question = saved_question(tools)
    return question.options if question else None


def question_argument_error(_ctx: object, error: Exception) -> str:
    """Return invalid arguments to the model so it can correct them and ask again."""
    logger.warning("Rejected invalid CNB question arguments: %s", type(error).__name__)
    return (
        f"{INVALID_QUESTION_PREFIX} The card was not shown. Correct the arguments "
        "and call concept_note_ask_question again, or answer in plain text. "
        f"Error: {error}"
    )


def is_question_output(output: object) -> bool:
    """Only a validated card may end the turn; an argument error must not."""
    try:
        ConceptNoteQuestion.model_validate_json(str(output))
    except ValidationError:
        return False
    return True


# Invalid arguments go back to the model; only a valid card ends the turn.
@function_tool(failure_error_function=question_argument_error)
async def concept_note_ask_question(question: ConceptNoteQuestion) -> str:
    """End this turn with an interactive question inside the assistant message.

    message contains your concise user-facing explanation and ONE question as
    Markdown. options contains 2-12 answers for reply, 1-12 changes for propose_edit,
    as contextual plain text, without letter prefixes or Markdown. The UI adds A/B/C
    labels and a free-text answer automatically.
    on_answer says what choosing an option does, and the UI tells the user:
    "reply" (default choice) only answers the question; choosing an option then
    cannot start a document change in the next turn. Use propose_edit after an
    edit request that needs a choice, or to offer the one change selected on a
    document-topic reply card. Selecting prepares a proposal for review. Each
    option must describe a change. Never add a "keep unchanged" or "not now"
    option to it. Rewrites the user asked to "choose from" are "reply" unless
    they asked to put the chosen one into the document.
    For a reply card whose options are concrete directions for changing this draft,
    set document_topic to the short name of the document passage, section, content,
    or format at issue. Leave it null for navigation, advice, evidence-gathering steps
    and other informational choices.
    Use when concrete choices make a clarification or next-step decision
    easier for the user, and always when the user asks for options or
    alternatives to choose from, such as rewrites; then each option holds one
    complete alternative. Honor an exact requested count up to 12, with each
    alternative individually selectable; never group several into one option.
    For more than 12, explain the card limit and provide the requested alternatives
    in plain text, explicitly paginating only if needed without dropping the rest.
    Do not use when alternatives are for discussion only or the user says they
    are not choosing yet, even if they say "options" or "alternatives".
    Do not use for direct answers, acknowledgements, or open-ended questions.
    When the runtime supplies a follow-up option, use it exactly as the sole propose_edit option.
    It only presents choices; it never edits the document or submits anything.
    """
    logger.info("Presenting CNB question with %d options", len(question.options))
    return question.model_dump_json()
