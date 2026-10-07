"""Stationary Energy prompt composition and token budgeting."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any, Dict, List

from app.config import get_settings
from app.services.stationary_energy.stationary_energy_chat_context import (
    build_minimal_stationary_energy_context_payload,
    format_stationary_energy_context_message,
)
from app.utils.prompt_budget import (
    TokenCount,
    compact_stationary_energy_prompt_payload,
    count_prompt_tokens,
    get_stationary_energy_prompt_budget,
    trim_messages_to_budget,
)

if TYPE_CHECKING:
    # The orchestrator imports these helpers; avoid a runtime import cycle.
    from app.utils.streaming_handler import StreamingHandler
logger = logging.getLogger(__name__)


def stationary_energy_context_message(
    handler: StreamingHandler,
    context_payload: Dict[str, Any],
) -> Dict[str, str]:
    """Format a compact Stationary Energy draft snapshot as a system message."""
    budget = get_stationary_energy_prompt_budget(get_settings(), "chat_context")
    baseline_payload = compact_stationary_energy_prompt_payload(
        context_payload,
        budget=budget,
        drop_source_data=True,
    )
    baseline_payload["prompt_budget_compaction"].update(
        {
            "chat_baseline": True,
            "source_data_included": False,
        },
    )
    initial_message = format_stationary_energy_context_message(
        baseline_payload,
    )

    def count_context_tokens(message: dict[str, str]) -> TokenCount:
        """Include the active instructions in every compaction measurement."""
        return count_prompt_tokens(
            [stationary_energy_system_content(handler, message["content"])],
            model=handler.agent_model,
            fallback_encoding=budget.tokenizer_encoding,
        )

    initial_count = count_context_tokens(initial_message)
    if initial_count.tokens <= budget.max_prompt_tokens:
        logger.info(
            "Stationary Energy chat context tokens=%s max_prompt_tokens=%s tokenizer=%s compacted=%s",
            initial_count.tokens,
            budget.max_prompt_tokens,
            initial_count.tokenizer,
            True,
        )
        return initial_message

    compacted_payload = build_minimal_stationary_energy_context_payload(
        baseline_payload,
        initial_tokens=initial_count.tokens,
        compacted_tokens=initial_count.tokens,
        max_prompt_tokens=budget.max_prompt_tokens,
    )
    compacted_message = format_stationary_energy_context_message(
        compacted_payload,
    )
    compacted_count = count_context_tokens(compacted_message)

    if compacted_count.tokens > budget.max_prompt_tokens:
        compacted_message = format_stationary_energy_context_message(
            build_minimal_stationary_energy_context_payload(
                baseline_payload,
                initial_tokens=initial_count.tokens,
                compacted_tokens=compacted_count.tokens,
                max_prompt_tokens=budget.max_prompt_tokens,
            )
        )
        compacted_count = count_context_tokens(compacted_message)

    logger.info(
        "Stationary Energy chat context tokens=%s initial_tokens=%s max_prompt_tokens=%s tokenizer=%s compacted=%s",
        compacted_count.tokens,
        initial_count.tokens,
        budget.max_prompt_tokens,
        compacted_count.tokenizer,
        True,
    )
    return compacted_message


def stationary_energy_system_context_message(
    handler: StreamingHandler,
    context_message: Dict[str, str],
) -> Dict[str, str]:
    """Append the draft snapshot to the active Stationary Energy instructions."""
    return {
        "role": "system",
        "content": stationary_energy_system_content(
            handler, context_message.get("content", "")
        ),
    }


def stationary_energy_system_content(
    handler: StreamingHandler, context_content: str
) -> str:
    """Return Stationary Energy instructions followed by a context block."""
    instruction_text = stationary_energy_review_instruction_text(handler)
    context_block = f"<context>\n{context_content.strip()}\n</context>"
    if not instruction_text:
        return context_block
    return f"{instruction_text}\n\n{context_block}"


def stationary_energy_review_instruction_text(handler: StreamingHandler) -> str:
    """Return the active Stationary Energy review prompt text."""
    instruction_text = agent_instruction_text(handler).strip()
    if instruction_text or not handler.workflow_context.stationary_energy_draft_run_id:
        return instruction_text
    try:
        return (
            get_settings()
            .llm.prompts.compose_prompt("stationary_energy_review")
            .strip()
        )
    except Exception as exc:
        logger.warning(
            "Failed to load Stationary Energy review prompt for embedded context: %s",
            exc,
        )
        return ""


def enforce_chat_prompt_budget(
    handler: StreamingHandler,
    agent: Any,
    runner_input: List[Dict[str, str]],
) -> List[Dict[str, str]]:
    """Trim chat input to the Stationary Energy prompt budget."""
    # Count the full agent instructions plus runner input against the chat budget.
    budget = get_stationary_energy_prompt_budget(get_settings(), "chat_context")
    trimmed_input, token_count, removed_messages = trim_messages_to_budget(
        runner_input,
        instruction_text=agent_instruction_text(handler, agent),
        model=handler.agent_model,
        budget=budget,
    )
    if removed_messages:
        logger.info(
            "Trimmed %s conversation messages from Stationary Energy chat prompt to fit token budget",
            removed_messages,
        )
    # Fail loudly if even the compacted workflow context exceeds the budget.
    if token_count.tokens > budget.max_prompt_tokens:
        raise ValueError(
            "Stationary Energy chat prompt exceeds configured token budget "
            f"({token_count.tokens} > {budget.max_prompt_tokens})",
        )
    logger.info(
        "Stationary Energy chat prompt tokens=%s max_prompt_tokens=%s tokenizer=%s",
        token_count.tokens,
        budget.max_prompt_tokens,
        token_count.tokenizer,
    )
    return trimmed_input


def agent_instruction_text(handler: StreamingHandler, agent: Any | None = None) -> str:
    """Return the active agent instruction text used for token accounting."""
    if agent is not None and hasattr(agent, "instructions"):
        instructions = getattr(agent, "instructions", None)
        if instructions is not None:
            return str(instructions)
    if handler.agent_service:
        return str(
            getattr(handler.agent_service, "active_instructions", None)
            or getattr(handler.agent_service, "system_prompt", "")
            or ""
        )
    return ""


def has_embedded_stationary_energy_system_context(
    runner_input: List[Dict[str, str]],
) -> bool:
    """Return whether the runner input already embeds prompt plus draft context."""
    if not runner_input:
        return False
    first_message = runner_input[0]
    content = first_message.get("content", "")
    return (
        first_message.get("role") == "system"
        and "<context>" in content
        and "</context>" in content
        and (
            "STATIONARY_ENERGY_DRAFT_CONTEXT_JSON" in content
            or "STATIONARY_ENERGY_DRAFT_CONTEXT_UNAVAILABLE" in content
        )
    )


def clear_agent_instructions(agent: Any) -> None:
    """Avoid sending Stationary Energy instructions twice in one model call."""
    if not hasattr(agent, "instructions"):
        return
    try:
        setattr(agent, "instructions", "")
    except Exception as exc:
        logger.debug("Could not clear embedded agent instructions: %s", exc)
