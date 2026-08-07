from __future__ import annotations

import json
import logging
from typing import Any, Dict, Optional, Sequence, Tuple, Union
from uuid import UUID

from agents import function_tool

from app.tools.cc_inventory_tool import CCInventoryTool, CCInventoryToolResult
from app.tools.payload_trimmers import trim_datasources_response

logger = logging.getLogger(__name__)


def _serialize(action: str, result: CCInventoryToolResult) -> str:
    """Serialize a datasource tool result with its action name."""
    payload = result.to_dict()
    payload["action"] = action
    return json.dumps(payload, default=str)


def _trim_datasources_data(data: Any) -> Any:
    """Trim datasources response before serialization."""
    if not isinstance(data, dict):
        return data

    return trim_datasources_response(data)


def _argument_error(message: str) -> CCInventoryToolResult:
    """Build a standard invalid-argument datasource tool result."""
    return CCInventoryToolResult(
        success=False,
        error=message,
        error_code="invalid_arguments",
    )


def build_cc_datasource_tools(
    *,
    inventory_tool: CCInventoryTool,
    access_token: Optional[str],
    user_id: Optional[str],
    thread_id: Union[str, UUID],
) -> Tuple[Sequence[object], Dict[str, Optional[str]]]:
    """Create the temporary legacy datasource tool for CityCatalyst inventories."""
    thread_str = str(thread_id)
    user = user_id or ""
    token_ref: Dict[str, Optional[str]] = {"value": access_token}

    @function_tool
    async def cc_get_all_datasources(inventory_id: str) -> str:
        """Retrieve all available data sources for a selected inventory.

        This is a temporary legacy tool. Use inventory_list_accessible first to
        identify the inventory, then pass its inventory_id here only when the
        user asks about available datasources.
        """
        if not inventory_id or not inventory_id.strip():
            logger.warning("cc_get_all_datasources called without inventory_id")
            return _serialize(
                "get_all_datasources",
                _argument_error("inventory_id is required."),
            )

        result = await inventory_tool.fetch_inventory_datasources(
            inventory_id=inventory_id,
            token=token_ref["value"],
            user_id=user,
            thread_id=thread_str,
        )
        if result.success and result.data:
            result.data = _trim_datasources_data(result.data)
        return _serialize("get_all_datasources", result)

    cc_get_all_datasources.name = "get_all_datasources"  # type: ignore[attr-defined]

    return [cc_get_all_datasources], token_ref
