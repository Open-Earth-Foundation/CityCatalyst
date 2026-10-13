"""Workflow scope, grounded history, and request-scoped agent composition."""

from __future__ import annotations

import logging
from typing import (
    TYPE_CHECKING,
    Optional,
)

from agents import Agent

from app.config import Settings
from app.models.cnb.concept_note_edits import EditProposalRequest
from app.models.requests import MessageCreateRequest
from app.services.agent_service import AgentService
from app.services.cnb.draft_overview import (
    draft_overview_instructions,
)
from app.utils.mlflow_logging import (
    log_json_artifact,
    log_tags,
    run_mlflow_io,
)
from app.utils.streaming_context import (
    native_input_catalog_request,
    recent_concept_note_edit_messages,
)

if TYPE_CHECKING:
    # These helpers are called by StreamingHandler, which imports this module.
    from app.utils.streaming_handler import StreamingHandler

logger = logging.getLogger(__name__)


async def prepare_stream_agent(
    handler: StreamingHandler,
    settings: Settings,
    payload: MessageCreateRequest,
    req_id: str,
) -> tuple[Agent, list[dict[str, str]]]:
    """Load scoped history and configure the agent; retain it on the handler for cleanup."""
    draft_run_id = handler.workflow_context.stationary_energy_draft_run_id
    concept_note_run_id = handler.workflow_context.concept_note_run_id

    # Resolve the Stationary Energy draft surface scope (city + an explicit
    # interaction-mode marker) so the agent can offer the start-draft tool
    # even before any draft run exists. Only the SE draft page sends these.
    stationary_energy_city_id: Optional[str] = None
    stationary_energy_surface = bool(draft_run_id)
    for source in (
        payload.context,
        payload.options,
        handler.request_context,
        handler.request_options,
    ):
        if not isinstance(source, dict):
            continue
        if not stationary_energy_city_id and source.get("city_id"):
            stationary_energy_city_id = str(source.get("city_id"))
        if source.get("stationary_energy_interaction_mode"):
            stationary_energy_surface = True
    handler.stationary_energy_surface = stationary_energy_surface
    handler.stationary_energy_city_id = stationary_energy_city_id

    # Create agent service
    native_input_catalog_context = native_input_catalog_request(handler, payload)
    edit_context = (
        payload.context.get("concept_note_edit")
        if isinstance(payload.context, dict)
        else None
    )
    edit_request = (
        EditProposalRequest.model_validate(
            {**edit_context, "instruction": payload.content}
        )
        if concept_note_run_id and isinstance(edit_context, dict)
        else None
    )
    handler.concept_note_edit_request = edit_request
    # The CNB frontend sends its active language so help quotes visible labels.
    concept_note_ui_locale = (
        payload.context.get("ui_locale")
        if concept_note_run_id and isinstance(payload.context, dict)
        else None
    )

    # Load the effective chat input before tool registration so the edit
    # planner can resolve short follow-ups from a bounded visible window.
    conversation_history = await handler._load_conversation_history(settings, payload)
    concept_note_edit_history = (
        recent_concept_note_edit_messages(
            conversation_history,
            current_instruction=payload.content,
        )
        if edit_request is not None
        else []
    )
    handler.agent_service = AgentService(
        cc_access_token=handler.cc_access_token,
        request_token_refresh_context=handler.request_token_refresh_context,
        cc_thread_id=handler.thread_id,
        cc_user_id=handler.user_id,
        inventory_id=handler.inventory_id,
        city_id=stationary_energy_city_id,
        session_factory=handler.session_factory,
        stationary_energy_draft_run_id=draft_run_id,
        stationary_energy_surface=stationary_energy_surface,
        concept_note_run_id=concept_note_run_id,
        native_input_catalog_context=native_input_catalog_context,
        concept_note_edit_request=edit_request,
        concept_note_edit_history=concept_note_edit_history,
        concept_note_ui_locale=concept_note_ui_locale,
    )

    # Get model override from options
    options = payload.options or {}
    model_override = options.get("model")
    if concept_note_run_id:
        model_override = None

    handler.agent_model = (
        model_override
        or handler.agent_service.preferred_model_for_context(
            stationary_energy_draft_run_id=draft_run_id,
            concept_note_run_id=concept_note_run_id,
        )
    )
    logger.info(
        "Selected chat model=%s stationary_energy_context=%s concept_note_context=%s thread_id=%s",
        handler.agent_model,
        bool(draft_run_id),
        bool(concept_note_run_id),
        handler.thread_id,
    )
    workflow_metadata = handler.workflow_context.telemetry()
    await run_mlflow_io(
        log_tags,
        {
            "model": handler.agent_model,
            "ca_agentic_flow": workflow_metadata["ca_agentic_flow"],
            "workflow": workflow_metadata["workflow"],
            "workflow_name": workflow_metadata["workflow_name"],
            "interaction": workflow_metadata["interaction"],
            "prompt_name": workflow_metadata["prompt_name"],
            "stationary_energy_draft_run_id": draft_run_id,
            "concept_note_run_id": concept_note_run_id,
        },
    )

    agent = await handler.agent_service.create_agent(
        model=handler.agent_model,
        instructions=(
            draft_overview_instructions(settings.llm.prompts)
            if handler.draft_overview_claim
            else None
        ),
    )

    await run_mlflow_io(
        log_json_artifact,
        "chat/conversation_history.json",
        {"messages": conversation_history},
    )

    logger.info(
        "Starting Agents SDK streaming - thread_id=%s, user_id=%s, request_id=%s",
        handler.thread_id,
        handler.user_id,
        req_id,
    )

    return agent, conversation_history
