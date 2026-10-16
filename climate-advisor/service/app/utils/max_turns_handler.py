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
_CHAT_INVENTORY_LABEL = "your current inventory"
_MAX_SUMMARY_ACTIONS = 5
_MAX_ACTION_LABEL_CHARS = 80


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


def _action_label(action: Dict[str, Any]) -> Optional[str]:
    """Return a short user-facing label for one returned action, or None."""
    name = action.get("name")
    if not isinstance(name, str) or not name.strip():
        name = action.get("explanation")
    if not isinstance(name, str) or not name.strip():
        return None
    text = " ".join(name.split())
    if len(text) > _MAX_ACTION_LABEL_CHARS:
        text = text[: _MAX_ACTION_LABEL_CHARS - 3].rstrip() + "..."
    rank = action.get("rank")
    return f"#{rank} {text}" if isinstance(rank, int) else text


def _collect_actions(value: Any, found: List[Dict[str, Any]]) -> None:
    """Collect action-like dicts (with a rank or a name) from a read payload."""
    if isinstance(value, dict):
        actions = value.get("actions")
        if isinstance(actions, list):
            found.extend(item for item in actions if isinstance(item, dict))
        for child in value.values():
            if isinstance(child, (dict, list)) and child is not actions:
                _collect_actions(child, found)
    elif isinstance(value, list):
        for child in value:
            _collect_actions(child, found)


def _summarize_read(output: Dict[str, Any]) -> Optional[str]:
    """Return a bounded one-line summary of the actions in a successful read."""
    actions: List[Dict[str, Any]] = []
    _collect_actions(output.get("data"), actions)
    labels = [label for label in map(_action_label, actions) if label]
    if not labels:
        return None
    shown = labels[:_MAX_SUMMARY_ACTIONS]
    extra = len(labels) - len(shown)
    suffix = f" and {extra} more" if extra > 0 else ""
    return "; ".join(shown) + suffix


def summarize_catalog_progress(new_items: List[Any]) -> Dict[str, Any]:
    """Return the cities already answered, the pending ones and what was read.

    Answered means a successful native_input_read whose result holds a summary
    that can be shown to the user. A read without a usable summary stays pending,
    so the user is asked to resend it instead of being told it was delivered.
    Reads that omit inventoryId use the chat inventory. Cities the model never
    reached cannot be known here and are covered by the generic instruction in
    the message.
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
    summaries: Dict[str, str] = {}
    touched: List[str] = []
    for call_id, call in calls.items():
        if call["name"] not in _CATALOG_TOOL_NAMES:
            continue
        inventory_id = str(call["arguments"].get("inventoryId") or "").lower()
        label = labels.get(inventory_id) if inventory_id else _CHAT_INVENTORY_LABEL
        if not label:
            continue
        if label not in touched:
            touched.append(label)
        result = call_results.get(call_id, {})
        if call["name"] == _CATALOG_READ_TOOL_NAME and result.get("success") is True:
            summary = _summarize_read(result)
            if summary:
                summaries[label] = summary
    return {
        "answered": [label for label in touched if label in summaries],
        "pending": [label for label in touched if label not in summaries],
        "summaries": summaries,
    }


def build_partial_answer(progress: Dict[str, Any]) -> str:
    """Compose the user-facing message for a run that stopped at the turn limit."""
    answered = progress["answered"]
    pending = progress["pending"]
    summaries = progress.get("summaries", {})
    lines = ["I reached my step limit for one message, so this answer is partial."]
    if answered:
        lines.append(
            "Already read: "
            + " ".join(f"{label}: {summaries[label]}." for label in answered)
        )
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
