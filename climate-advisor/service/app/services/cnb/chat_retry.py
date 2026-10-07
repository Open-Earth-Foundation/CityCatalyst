"""Retried Concept Note chat turns repeat a question the thread may already hold."""

from typing import Any

from app.services.cnb.draft_overview import CONCEPT_NOTE_TURN_OPTION

RETRY_TURN = "retry"


def is_retry_turn(options: Any) -> bool:
    """Return whether the client is re-sending a turn whose reply failed."""
    return (
        isinstance(options, dict)
        and options.get(CONCEPT_NOTE_TURN_OPTION) == RETRY_TURN
    )
