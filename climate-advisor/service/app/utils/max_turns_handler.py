"""Partial-answer handler for streamed chat runs that hit the turn limit."""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

from agents.run_error_handlers import (
    RunErrorHandler,
    RunErrorHandlerInput,
    RunErrorHandlerResult,
)

logger = logging.getLogger(__name__)

_LIST_TOOL_NAME = "inventory_list_accessible"
_CATALOG_READ_TOOL_NAME = "native_input_read"
_CATALOG_DISCOVER_TOOL_NAME = "native_input_discover"
_CATALOG_TOOL_NAMES = {_CATALOG_READ_TOOL_NAME, _CATALOG_DISCOVER_TOOL_NAME}


def _parse_json(value: Any) -> Optional[Dict[str, Any]]:
    """Parse a tool output into a JSON object, or None when it is not one."""
    if isinstance(value, dict):
        return value
    if not isinstance(value, str):
        return None
    try:
        parsed = json.loads(value)
    except ValueError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _inventory_labels(outputs: List[Dict[str, Any]]) -> Dict[str, str]:
    """Map inventory IDs to "City year" labels using inventory_list_accessible outputs."""
    labels: Dict[str, str] = {}
    for output in outputs:
        data = output.get("data") if isinstance(output.get("data"), dict) else output
        for city in data.get("cities") or []:
            if not isinstance(city, dict):
                continue
            city_name = city.get("name") or "Unnamed city"
            for inventory in city.get("inventories") or []:
                if not isinstance(inventory, dict) or not inventory.get("inventory_id"):
                    continue
                year = inventory.get("year")
                label = f"{city_name} {year}" if year else str(city_name)
                labels[str(inventory["inventory_id"]).lower()] = label
    return labels


def _item_tool_name(item: Any) -> Optional[str]:
    """Return the tool name of a tool-call run item."""
    raw = getattr(item, "raw_item", None)
    return getattr(raw, "name", None) or (
        raw.get("name") if isinstance(raw, dict) else None
    )


def _item_call_id(item: Any) -> Optional[str]:
    """Return the call ID of a tool-call or tool-output run item."""
    raw = getattr(item, "raw_item", None)
    if isinstance(raw, dict):
        return raw.get("call_id")
    return getattr(raw, "call_id", None)


def summarize_catalog_progress(new_items: List[Any]) -> Dict[str, List[str]]:
    """Return the cities already answered and the cities still pending.

    Answered means a successful native_input_read for an inventory. Pending
    means the inventory was discovered or read without success. Cities the
    model never reached cannot be known here and are covered by the generic
    instruction in the message.
    """
    calls: Dict[str, Dict[str, Any]] = {}
    list_outputs: List[Dict[str, Any]] = []
    call_results: Dict[str, Dict[str, Any]] = {}

    # Step 1: collect tool calls and outputs from the run items.
    for item in new_items:
        item_type = getattr(item, "type", "")
        if item_type == "tool_call_item":
            call_id = _item_call_id(item)
            name = _item_tool_name(item)
            raw = getattr(item, "raw_item", None)
            arguments = _parse_json(getattr(raw, "arguments", None)) or {}
            if call_id and name:
                calls[call_id] = {"name": name, "arguments": arguments}
        elif item_type == "tool_call_output_item":
            output = _parse_json(getattr(item, "output", None))
            call_id = _item_call_id(item)
            if output is None:
                continue
            if call_id:
                call_results[call_id] = output
            if (calls.get(call_id or "", {}).get("name")) == _LIST_TOOL_NAME:
                list_outputs.append(output)

    # Step 2: classify each inventory the model touched, in first-touch order.
    labels = _inventory_labels(list_outputs)
    read_ok: Dict[str, bool] = {}
    for call_id, call in calls.items():
        if call["name"] not in _CATALOG_TOOL_NAMES:
            continue
        label = labels.get(str(call["arguments"].get("inventoryId") or "").lower())
        if not label:
            continue
        succeeded = (
            call["name"] == _CATALOG_READ_TOOL_NAME
            and call_results.get(call_id, {}).get("success") is True
        )
        read_ok[label] = read_ok.get(label, False) or succeeded
    return {
        "answered": [label for label, done in read_ok.items() if done],
        "pending": [label for label, done in read_ok.items() if not done],
    }


def build_partial_answer(progress: Dict[str, List[str]]) -> str:
    """Compose the user-facing message for a run that stopped at the turn limit."""
    answered = progress["answered"]
    pending = progress["pending"]
    lines = ["I reached my step limit for one message, so this answer is partial."]
    if answered:
        lines.append("Already read: " + ", ".join(answered) + ".")
    if pending:
        lines.append("Not finished: " + ", ".join(pending) + ".")
    lines.append(
        "Please send the pending or remaining cities in a new message and I will "
        "continue from there."
    )
    return " ".join(lines)


def build_max_turns_handler(stream_handler: Any) -> RunErrorHandler[Any]:
    """Create the MaxTurnsExceeded handler bound to one streaming handler.

    The partial answer is also stored on the streaming handler, because the SDK
    emits it as a run item rather than as text deltas and the SSE layer must
    recognize and forward it.
    """

    async def handle_max_turns(
        handler_input: RunErrorHandlerInput[Any],
    ) -> RunErrorHandlerResult:
        """Replace a MaxTurnsExceeded failure with a clear partial answer."""
        progress = summarize_catalog_progress(list(handler_input.run_data.new_items))
        logger.warning(
            "Chat run stopped at the turn limit answered=%d pending=%d",
            len(progress["answered"]),
            len(progress["pending"]),
        )
        answer = build_partial_answer(progress)
        stream_handler.partial_answer_text = answer
        return RunErrorHandlerResult(final_output=answer)

    return handle_max_turns
