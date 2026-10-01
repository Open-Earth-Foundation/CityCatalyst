"""Workflow snapshots and visible chat history context."""

from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING, Dict, List, Optional
from uuid import UUID

from app.models.requests import MessageCreateRequest
from app.persistence.concept_notes.context_bundle import (
    load_agent_context,
    load_source_documents,
)
from app.services.native_input_catalog_service import ActiveRequestContext
from app.services.stationary_energy.stationary_energy_chat_context import (
    build_stationary_energy_context_payload,
    build_stationary_energy_ui_context,
    format_stationary_energy_run_not_started_message,
)
from app.services.stationary_energy.stationary_energy_draft_repository import (
    StationaryEnergyDraftRepository,
)
from app.services.thread_service import ThreadService
from app.utils.chat_workflow_context import ChatWorkflowContext
from app.utils.concept_note_context import (
    extract_concept_note_run_id,
    render_source_documents_message,
)
from app.utils.stationary_energy_context import extract_stationary_energy_draft_run_id
from app.utils.streaming_prompt import stationary_energy_context_message

if TYPE_CHECKING:
    # The orchestrator imports these helpers; avoid a runtime import cycle.
    from app.utils.streaming_handler import StreamingHandler
logger = logging.getLogger(__name__)


async def load_stationary_energy_context_message(
    handler: StreamingHandler,
    payload: MessageCreateRequest,
) -> Optional[Dict[str, str]]:
    """Load the persisted Stationary Energy draft snapshot for chat grounding.

    On the Stationary Energy page before any run exists, this returns the
    run-not-started message instead so the agent starts a run first.
    """
    draft_run_id_text = handler.workflow_context.stationary_energy_draft_run_id
    if not draft_run_id_text:
        if not handler.stationary_energy_surface:
            return None
        request_context = payload.context if isinstance(payload.context, dict) else {}
        return format_stationary_energy_run_not_started_message(
            city_id=handler.stationary_energy_city_id,
            inventory_id=handler.inventory_id,
            city_name=request_context.get("city_name"),
            inventory_year=request_context.get("inventory_year"),
        )
    draft_run_id = UUID(draft_run_id_text)

    if not handler.session_factory:
        logger.debug(
            "Session factory unavailable; Stationary Energy draft context skipped"
        )
        return None

    # Load the CA-owned draft snapshot with source, proposal, and review rows.
    try:
        async with handler.session_factory() as session:
            repository = StationaryEnergyDraftRepository(session)
            draft_run = await repository.get_draft_run(draft_run_id)
    except Exception as exc:
        logger.warning(
            "Failed to load Stationary Energy draft context draft_run_id=%s: %s",
            draft_run_id,
            exc,
        )
        return None

    # Return a system blocker when the requested draft is missing or not owned.
    if draft_run is None or draft_run.user_id != handler.user_id:
        logger.warning(
            "Stationary Energy draft context unavailable draft_run_id=%s user_id=%s",
            draft_run_id,
            handler.user_id,
        )
        return {
            "role": "system",
            "content": (
                "STATIONARY_ENERGY_DRAFT_CONTEXT_UNAVAILABLE\n"
                "The requested Stationary Energy draft context is not available for this user."
            ),
        }

    # Attach UI focus/confirmation state to the persisted draft snapshot.
    context_payload = build_stationary_energy_context_payload(draft_run)
    ui_context = build_stationary_energy_ui_context(payload)
    if ui_context:
        context_payload["ui_context"] = ui_context
    return stationary_energy_context_message(handler, context_payload)


async def load_concept_note_context_message(
    handler: StreamingHandler,
) -> Optional[Dict[str, str]]:
    """Load authorized CNB evidence as a user-role runtime-data message."""
    run_id_text = handler.workflow_context.concept_note_run_id
    if not run_id_text or not handler.session_factory:
        return None
    run_id = UUID(run_id_text)
    try:
        context = await load_agent_context(
            session_factory=handler.session_factory,
            user_id=handler.user_id,
            run_id=run_id,
        )
    except Exception as exc:
        logger.warning(
            "Failed to load Concept Note agent context run_id=%s: %s",
            run_id,
            exc,
        )
        return None
    if context is None:
        return {
            "role": "user",
            "content": (
                "CONCEPT_NOTE_CONTEXT_BUNDLE_UNAVAILABLE\n"
                "The authorized Concept Note context bundle is not ready."
            ),
        }
    return {
        "role": "user",
        "content": (
            "CONCEPT_NOTE_CONTEXT_BUNDLE_JSON\n"
            f"{json.dumps(context, ensure_ascii=False, default=str)}"
        ),
    }


async def load_concept_note_source_documents_message(
    handler: StreamingHandler,
) -> Optional[Dict[str, str]]:
    """Load complete uploaded source text when it fits the configured budget."""
    run_id_text = handler.workflow_context.concept_note_run_id
    if not run_id_text or not handler.session_factory:
        return None
    try:
        documents = await load_source_documents(
            session_factory=handler.session_factory,
            user_id=handler.user_id,
            run_id=UUID(run_id_text),
        )
    except Exception as exc:
        # Summaries in the bundle message still ground the turn.
        logger.warning(
            "Failed to load Concept Note source documents run_id=%s: %s",
            run_id_text,
            exc,
        )
        return None
    if not documents:
        return None
    return {"role": "user", "content": render_source_documents_message(documents)}


def history_contains_current_user_message(
    conversation_history: List[Dict[str, str]],
    content: str,
) -> bool:
    """Return whether recent history already contains the current user message."""
    return any(
        message.get("role") == "user" and message.get("content") == content
        for message in conversation_history[-3:]
    )


def recent_concept_note_edit_messages(
    conversation_history: List[Dict[str, str]],
    *,
    current_instruction: str,
    limit: int = 3,
) -> List[Dict[str, str]]:
    """Return previous visible chat messages for resolving an edit follow-up."""
    internal_prefixes = (
        "CONCEPT_NOTE_CONTEXT_BUNDLE_JSON\n",
        "CONCEPT_NOTE_CONTEXT_BUNDLE_UNAVAILABLE\n",
        "INTERNAL_TOOL_OUTPUT_JSON\n",
    )
    visible_messages = [
        {"role": message["role"], "content": message["content"]}
        for message in conversation_history
        if message.get("role") in {"user", "assistant"}
        and isinstance(message.get("content"), str)
        and message["content"].strip()
        and not message["content"].startswith(internal_prefixes)
    ]

    # The current instruction is already a dedicated planner field. Remove
    # its latest history copy so the window contains only preceding turns.
    for index in range(len(visible_messages) - 1, -1, -1):
        message = visible_messages[index]
        if message["role"] == "user" and message["content"] == current_instruction:
            visible_messages.pop(index)
            break
    return visible_messages[-max(limit, 0) :]


async def load_thread_workflow_context(
    handler: StreamingHandler,
) -> ChatWorkflowContext:
    """Load scoped workflow identifiers persisted on the current chat thread."""
    if not handler.session_factory:
        return ChatWorkflowContext()
    try:
        async with handler.session_factory() as session:
            thread = await ThreadService(session).get_thread(handler.thread_id)
            if thread is None or thread.user_id != handler.user_id:
                return ChatWorkflowContext()
            return ChatWorkflowContext(
                stationary_energy_draft_run_id=(
                    extract_stationary_energy_draft_run_id(thread.context)
                ),
                concept_note_run_id=extract_concept_note_run_id(thread.context),
            )
    except Exception as exc:
        logger.warning(
            "Failed to load thread workflow context thread_id=%s: %s",
            handler.thread_id,
            exc,
        )
        return ChatWorkflowContext()


async def resolve_workflow_context(
    handler: StreamingHandler,
    payload: MessageCreateRequest,
) -> None:
    """Resolve request or thread workflow IDs once for the shared stream."""
    draft_run_id = (
        handler.workflow_context.stationary_energy_draft_run_id
        or extract_stationary_energy_draft_run_id(
            payload.context,
            payload.options,
            handler.request_context,
            handler.request_options,
        )
    )
    concept_note_run_id = (
        handler.workflow_context.concept_note_run_id
        or extract_concept_note_run_id(
            payload.context,
            payload.options,
            handler.request_context,
            handler.request_options,
        )
    )
    thread_context = ChatWorkflowContext()
    if not draft_run_id or not concept_note_run_id:
        thread_context = await load_thread_workflow_context(handler)

    handler.workflow_context = ChatWorkflowContext(
        stationary_energy_draft_run_id=normalize_workflow_run_id(
            draft_run_id or thread_context.stationary_energy_draft_run_id,
            "Stationary Energy draft_run_id",
        ),
        concept_note_run_id=normalize_workflow_run_id(
            concept_note_run_id or thread_context.concept_note_run_id,
            "Concept Note run id",
        ),
    )


def native_input_catalog_request(
    handler: StreamingHandler,
    payload: MessageCreateRequest,
) -> ActiveRequestContext | None:
    """Resolve catalog scope only when the current request has a Core credential."""
    if not handler.cc_access_token or not handler.catalog_user_id:
        return None

    sources = (
        payload.context,
        payload.options,
        handler.request_context,
        handler.request_options,
    )

    def first_value(field: str) -> Optional[str]:
        """Return the first non-empty string within the request's scoped context."""
        for source in sources:
            if not isinstance(source, dict):
                continue
            value = source.get(field)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None

    return ActiveRequestContext(
        user_id=handler.catalog_user_id,
        thread_id=handler.thread_identifier,
        organization_id=first_value("organization_id"),
        project_id=first_value("project_id"),
        city_id=first_value("city_id"),
        inventory_id=payload.inventory_id
        or handler.inventory_id
        or first_value("inventory_id"),
    )


def normalize_workflow_run_id(value: object, label: str) -> str | None:
    """Return a canonical UUID string, ignoring malformed workflow IDs."""
    if not value:
        return None
    try:
        return str(UUID(str(value)))
    except ValueError:
        logger.warning(
            "Ignoring invalid %s before MLflow run",
            label,
        )
        return None
