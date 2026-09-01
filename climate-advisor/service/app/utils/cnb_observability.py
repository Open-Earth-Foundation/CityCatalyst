"""Stable observability vocabulary for Concept Note Builder interactions."""

from enum import Enum


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
