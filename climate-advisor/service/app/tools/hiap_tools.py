from __future__ import annotations

import json
import logging
from typing import Any, Dict, Optional, Sequence

from agents import function_tool

from app.services.citycatalyst_client import CityCatalystClient, CityCatalystClientError

logger = logging.getLogger(__name__)


def build_hiap_tools(
    *,
    hiap_context: dict[str, Any],
    user_id: str,
    token_ref: Dict[str, Optional[str]],
) -> Sequence[object]:
    """Create HIAP tools scoped to one city and inventory."""
    client = CityCatalystClient()
    base_payload = {
        "user_id": user_id,
        "city_id": hiap_context["city_id"],
        "inventory_id": hiap_context["inventory_id"],
        "lng": hiap_context.get("lng") or "en",
    }

    async def _call(action: str, payload: dict[str, Any]) -> str:
        """Dispatch one HIAP tool action and return a JSON tool-result string."""
        try:
            return json.dumps(
                await _dispatch(client, action, payload, token_ref.get("value")),
                ensure_ascii=False,
                default=str,
            )
        except CityCatalystClientError as exc:
            logger.info("HIAP tool rejected action=%s: %s", action, exc)
            return _error_payload(action, str(exc), f"http_{exc.status_code or 500}")
        except Exception:
            logger.exception("HIAP tool failed action=%s", action)
            return _error_payload(action, "HIAP tool failed.", "tool_error")

    @function_tool
    async def hiap_load_context() -> str:
        """Load current HIAP city, inventory, ranked actions, selected actions, and action plans."""

        return await _call("hiap_load_context", dict(base_payload))

    @function_tool
    async def hiap_update_selection(
        action_type: str,
        selected_action_ids: list[str],
    ) -> str:
        """Update selected HIAP action ids for mitigation or adaptation.

        Use only after the user explicitly asks to select, unselect, replace, or save
        top actions. `selected_action_ids` must contain ids returned by HIAP context.
        """

        return await _call(
            "hiap_update_selection",
            {
                **base_payload,
                "action_type": action_type,
                "selected_action_ids": selected_action_ids,
            },
        )

    @function_tool
    async def hiap_rerank_action(
        action_id: str,
        action_type: str,
        target_rank: int,
    ) -> str:
        """Move one ranked HIAP action to a new rank in the current list."""

        return await _call(
            "hiap_rerank_action",
            {
                **base_payload,
                "action_id": action_id,
                "action_type": action_type,
                "target_rank": target_rank,
            },
        )

    @function_tool
    async def hiap_generate_action_plan(action_id: str, action_type: str) -> str:
        """Start HIAP action plan generation for one current action."""

        return await _call(
            "hiap_generate_action_plan",
            {
                **base_payload,
                "action_id": action_id,
                "action_type": action_type,
            },
        )

    @function_tool
    async def hiap_read_action_plan(action_id: str) -> str:
        """Read completed HIAP action plan content for one action, translated when available."""

        return await _call(
            "hiap_read_action_plan",
            {
                **base_payload,
                "action_id": action_id,
            },
        )

    return [
        hiap_load_context,
        hiap_update_selection,
        hiap_rerank_action,
        hiap_generate_action_plan,
        hiap_read_action_plan,
    ]


async def _dispatch(
    client: CityCatalystClient,
    action: str,
    payload: dict[str, Any],
    token: Optional[str],
) -> dict[str, Any]:
    """Route a HIAP tool action to the matching CityCatalyst client method."""
    if action == "hiap_load_context":
        return await client.load_hiap_context(request_payload=payload, token=token)
    if action == "hiap_update_selection":
        return await client.update_hiap_selection(request_payload=payload, token=token)
    if action == "hiap_rerank_action":
        return await client.rerank_hiap_action(request_payload=payload, token=token)
    if action == "hiap_generate_action_plan":
        return await client.generate_hiap_action_plan(
            request_payload=payload,
            token=token,
        )
    if action == "hiap_read_action_plan":
        return await client.read_hiap_action_plan(request_payload=payload, token=token)
    raise ValueError(f"Unknown HIAP tool action: {action}")


def _error_payload(action: str, message: str, error_code: str) -> str:
    """Build a consistent JSON error payload for failed HIAP tool calls."""
    return json.dumps(
        {
            "success": False,
            "action": action,
            "message": message,
            "error_code": error_code,
        },
        ensure_ascii=False,
    )
