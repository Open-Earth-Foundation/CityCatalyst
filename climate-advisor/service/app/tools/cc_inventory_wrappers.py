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
    async def cc_list_user_inventories() -> str:
        """List the inventories the authenticated user can access in CityCatalyst.

        **PRIMARY TOOL for any user inventory queries.** Use this tool whenever the user:
        - Asks about "my inventories", "my data", "what inventories do I have"
        - Wants to see, list, view, access, or browse their inventories
        - Asks "How do I list/view/see/get my inventories?"
        - Needs help choosing an inventory but hasn't supplied an `inventory_id`
        - Asks questions like "show me what data I have" or "what can I access"
        
        This is an OPERATIONAL tool that fetches actual user data from CityCatalyst.
        Running it first gives you the inventory IDs, years, and city context required
        for follow-up queries.

        Returns:
            JSON string matching CityCatalyst's `InventoryWithCity[]` response structure,
            wrapped with the standard tool payload fields:
              - `action`: always "get_user_inventories"
              - `success`: boolean flag
              - `data`: list of inventories when successful
              - `error` / `error_code`: populated on failure (missing token, API error, etc.)
        
        Examples of queries that should use this tool:
            - "List my inventories"
            - "What inventories can I access?"
            - "Show me my data"
            - "How do I see my inventories?"
        """
        result = await inventory_tool.fetch_user_inventories(
            token=token_ref["value"],
            user_id=user,
            thread_id=thread_str,
        )
        return _serialize("get_user_inventories", result)

    cc_list_user_inventories.name = "get_user_inventories"  # type: ignore[attr-defined]

    @function_tool
    async def cc_get_inventory(inventory_id: str) -> str:
        """Fetch detailed data for a specific CityCatalyst inventory by ID.

        Use this OPERATIONAL tool when the user:
        - References a specific `inventory_id` (e.g., "Show inventory abc-123")
        - Wants details about a particular inventory from their list
        - Follows up after using `get_user_inventories` to select one inventory
        - Asks to "view", "show", "get", or "access" a specific inventory

        Args:
            inventory_id: Identifier issued by CityCatalyst for the user's inventory. The
                value must be non-empty and typically comes from prior tool output.

        Returns:
            JSON string shaped like the CityCatalyst `InventoryResponse` containing:
              - `action`: always "get_inventory"
              - `success`: boolean flag
              - `data`: inventory payload when successful
              - `error` / `error_code`: populated on failure (missing token, invalid
                arguments, CityCatalyst API errors, etc.)
        
        Examples of queries that should use this tool:
            - "Show me inventory abc-123"
            - "Get details for my 2023 inventory"
            - "What's in inventory xyz-456?"
        """
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

    @function_tool
    async def cc_get_all_datasources(inventory_id: str) -> str:
        """Retrieve all available data sources for the currently active inventory.

        Use this tool when you need to see what data sources are available for a specific inventory.
        This includes third-party datasets, external data sources, and other reference data
        that can be applied to populate inventory values automatically.

        Args:
            inventory_id: The ID of the inventory to get data sources for. This must be a valid
                inventory ID that the user has access to.

        Returns:
            JSON string containing the data sources response from CityCatalyst, wrapped with
            the standard tool payload fields:
              - `action`: always "get_all_datasources"
              - `success`: boolean flag
              - `data`: object containing successfulSources[], removedSources[], and failedSources[]
              - `error` / `error_code`: populated on failure (missing token, invalid arguments, API errors, etc.)

        The response includes:
        - `data`: Array of successfully fetched data sources with their metadata and actual data
        - `removedSources`: Data sources that were filtered out due to applicability
        - `failedSources`: Data sources that failed to fetch data

        This tool is essential for understanding what external data is available to populate
        inventory values and for helping users make informed decisions about data source selection.
        """
        if not inventory_id or not inventory_id.strip():
            logger.warning("cc_get_all_datasources called without inventory_id")
            return _serialize(
                "get_all_datasources",
                _argument_error("get_all_datasources", "inventory_id is required."),
            )

        result = await inventory_tool.fetch_inventory_datasources(
            inventory_id=inventory_id,
            token=token_ref["value"],
            user_id=user,
            thread_id=thread_str,
        )
        return _serialize("get_all_datasources", result)

    cc_get_all_datasources.name = "get_all_datasources"  # type: ignore[attr-defined]

    tools: Sequence[object] = [cc_list_user_inventories, cc_get_inventory, cc_get_all_datasources]
    return tools, token_ref
