"""Stable CNB vocabulary and metadata-only telemetry boundaries."""

import inspect
import logging
from enum import Enum
from types import MethodType
from uuid import UUID

from app.utils.mlflow_logging import (
    climate_advisor_experiment_name,
    log_metrics,
    log_tags,
    start_run,
)
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)


class CNBInteraction(str, Enum):
    """Identify one low-cardinality CNB user interaction in telemetry."""

    START = "start"
    CHAT = "chat"
    MISSING_INFORMATION = "missing_information"
    CHAT_EDIT = "chat_edit"

    @property
    def mlflow_run_name(self) -> str:
        """Return the stable MLflow run name for this interaction."""
        return {
            CNBInteraction.START: "cnb_start",
            CNBInteraction.CHAT: "cnb_chat",
            CNBInteraction.MISSING_INFORMATION: "cnb_missing_information",
            CNBInteraction.CHAT_EDIT: "cnb_chat_edit",
        }[self]


def protect_cnb_client(client: AsyncOpenAI) -> AsyncOpenAI:
    """Disable raw-payload autologging for one request-local CNB client."""
    resource = client.chat.completions
    for name in ("create", "parse"):
        original = inspect.unwrap(getattr(resource, name))
        if inspect.ismethod(original):
            original = original.__func__
        setattr(resource, name, MethodType(original, resource))
    return client


def record_edit_outcome(
    *,
    run_id: UUID,
    operation: str,
    outcome: str,
    proposal_id: UUID | None = None,
    revision_id: UUID | None = None,
    duration_ms: float = 0,
    error_code: str | None = None,
) -> None:
    """Best-effort allowlisted metadata without instruction or source text."""
    tags = {
        "workflow": "CNB",
        "interaction": CNBInteraction.CHAT_EDIT.value,
        "concept_note_run_id": str(run_id),
        "operation": operation,
        "outcome": outcome,
    }
    if proposal_id is not None:
        tags["proposal_id"] = str(proposal_id)
    if revision_id is not None:
        tags["revision_id"] = str(revision_id)
    if error_code is not None:
        tags["failure_category"] = error_code
    try:
        with start_run(
            run_name=CNBInteraction.CHAT_EDIT.mlflow_run_name,
            experiment_name=climate_advisor_experiment_name(),
            tags=tags,
            nested=True,
        ):
            log_tags(tags)
            log_metrics({"duration_ms": max(0, duration_ms)})
    except Exception:
        logger.warning("CNB edit telemetry unavailable")
