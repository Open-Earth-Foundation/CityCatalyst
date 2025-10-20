from __future__ import annotations

import json
import logging
from typing import Dict, Optional, Sequence, Tuple, Union
from uuid import UUID

from agents import function_tool

from .cc_inventory_tool import CCInventoryTool, CCInventoryToolResult

logger = logging.getLogger(__name__)


def _serialize(action: str, result: CCInventoryToolResult) -> str:
    payload = result.to_dict()
    payload["action"] = action
    return json.dumps(payload, default=str)


def _argument_error(action: str, message: str) -> CCInventoryToolResult:
    return CCInventoryToolResult(
        success=False,
        error=message,
        error_code="invalid_arguments",
    )


def build_cc_inventory_tools(
    *,
    inventory_tool: CCInventoryTool,
    access_token: Optional[str],
    user_id: Optional[str],
    thread_id: Union[str, UUID],
) -> Tuple[Sequence[object], Dict[str, Optional[str]]]:
    """Create function tools for CityCatalyst inventory access."""
    thread_str = str(thread_id)
    user = user_id or ""
    token_ref: Dict[str, Optional[str]] = {"value": access_token}

    @function_tool
    async def cc_get_inventory(inventory_id: str) -> str:
        if not inventory_id or not inventory_id.strip():
            logger.warning("cc_get_inventory called without inventory_id")
            return _serialize(
                "get_inventory",
                _argument_error("get_inventory", "inventory_id is required."),
            )

        result = await inventory_tool.fetch_inventory(
            inventory_id,
            token=token_ref["value"],
            user_id=user,
            thread_id=thread_str,
        )
        return _serialize("get_inventory", result)

    cc_get_inventory.name = "get_inventory"  # type: ignore[attr-defined]

    return [cc_get_inventory], token_ref
