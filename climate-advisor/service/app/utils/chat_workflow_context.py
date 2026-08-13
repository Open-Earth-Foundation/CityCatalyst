"""Resolved workflow context for the shared Climate Advisor chat stream."""

from dataclasses import dataclass


@dataclass(frozen=True)
class ChatWorkflowContext:
    """Hold workflow identifiers and derive consistent chat routing metadata."""

    stationary_energy_draft_run_id: str | None = None
    concept_note_run_id: str | None = None

    @property
    def is_agentic(self) -> bool:
        """Return whether this request belongs to a scoped agentic workflow."""
        return bool(self.stationary_energy_draft_run_id or self.concept_note_run_id)

    @property
    def mlflow_run_name(self) -> str:
        """Return the MLflow run name for this workflow context."""
        if self.concept_note_run_id:
            return "concept_note_context_chat_request"
        if self.stationary_energy_draft_run_id:
            return "stationary_energy_context_chat_request"
        return "climate_advisor_message_request"

    @property
    def trace_workflow_name(self) -> str:
        """Return the Agents SDK trace workflow name for this context."""
        if self.concept_note_run_id:
            return "Climate Advisor Concept Note Context Chat"
        if self.stationary_energy_draft_run_id:
            return "Climate Advisor Stationary Energy Context Chat"
        return "Climate Advisor Conversation"

    def telemetry(self) -> dict[str, object]:
        """Return shared low-cardinality workflow metadata for logs and traces."""
        if self.concept_note_run_id:
            workflow = "concept_note_context_chat"
            prompt_name = "chat"
            context_mode = "concept_note_run"
        elif self.stationary_energy_draft_run_id:
            workflow = "stationary_energy_context_chat"
            prompt_name = "stationary_energy_review"
            context_mode = "stationary_energy_draft"
        else:
            workflow = "climate_advisor_conversation"
            prompt_name = "chat"
            context_mode = "general"

        return {
            "workflow": workflow,
            "trace_category": (
                "ca_agentic_context_chat" if self.is_agentic else "normal_conversation"
            ),
            "prompt_name": prompt_name,
            "ca_agentic_flow": self.is_agentic,
            "context_mode": context_mode,
            "stationary_energy_draft_run_id": self.stationary_energy_draft_run_id,
            "concept_note_run_id": self.concept_note_run_id,
        }
