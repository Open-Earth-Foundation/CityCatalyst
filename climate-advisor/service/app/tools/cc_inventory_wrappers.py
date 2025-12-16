from __future__ import annotations

import json
import logging
import re
from functools import lru_cache
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union
from uuid import UUID

from agents import function_tool

from .cc_inventory_tool import CCInventoryTool, CCInventoryToolResult
from .payload_trimmers import (
    trim_inventory_for_listing,
    trim_inventory_detailed,
    trim_datasources_response,
)

logger = logging.getLogger(__name__)


@lru_cache(maxsize=64)
def _compile_city_pattern(city_name: str) -> re.Pattern[str]:
    """
    Compile and cache case-insensitive regex patterns for city names.

    A small LRU cache keeps patterns for recently searched cities to avoid
    recompiling when the same city name is used repeatedly.
    """
    return re.compile(re.escape(city_name.strip()), re.IGNORECASE)


def _serialize(action: str, result: CCInventoryToolResult) -> str:
    payload = result.to_dict()
    payload["action"] = action
    return json.dumps(payload, default=str)


def _trim_user_inventories_data(data: Any) -> Any:
    """Trim user inventories list before serialization."""
    if not isinstance(data, dict):
        return data
    
    inventory_list = data.get("data", [])
    if not isinstance(inventory_list, list):
        return data
    
    trimmed_list = [trim_inventory_for_listing(inv) for inv in inventory_list]
    
    result = {"data": trimmed_list}
    # Preserve any other top-level fields
    for key in data:
        if key != "data":
            result[key] = data[key]
    return result


def _trim_inventory_data(data: Any) -> Any:
    """Trim single inventory detail before serialization."""
    if not isinstance(data, dict):
        return data
    
    inventory = data.get("data")
    if not isinstance(inventory, dict):
        return data
    
    result = {"data": trim_inventory_detailed(inventory)}
    # Preserve any other top-level fields
    for key in data:
        if key != "data":
            result[key] = data[key]
    return result


def _trim_datasources_data(data: Any) -> Any:
    """Trim datasources response before serialization."""
    if not isinstance(data, dict):
        return data
    
    return trim_datasources_response(data)


def _argument_error(action: str, message: str) -> CCInventoryToolResult:
    return CCInventoryToolResult(
        success=False,
        error=message,
        error_code="invalid_arguments",
    )


def _search_inventories_by_city(
    inventories: List[Dict[str, Any]], 
    city_name: str, 
    year: Optional[int] = None
) -> List[Dict[str, Any]]:
    """
    Search inventories by city name with optional year filtering.
    
    Uses case-insensitive regex matching to handle city name variations.
    Results are sorted by year descending when multiple inventories exist.
    
    Args:
        inventories: List of inventory dicts from get_user_inventories
        city_name: City name to search for (case-insensitive)
        year: Optional specific year to filter to
        
    Returns:
        List of matching inventories (trimmed for listing), sorted by year desc
    """
    if not city_name or not city_name.strip():
        return []
    
    # Case-insensitive regex pattern for flexible city name matching (cached per city)
    pattern = _compile_city_pattern(city_name)
    
    matches: List[Dict[str, Any]] = []
    for inventory in inventories:
        city_obj = inventory.get("city") or {}
        inventory_city_name = city_obj.get("name") or ""
        
        # Check if city name matches the pattern
        if pattern.search(inventory_city_name):
            # If year filter provided, only include matching year
            if year is not None:
                if inventory.get("year") == year:
                    matches.append(inventory)
            else:
                matches.append(inventory)
    
    # Sort by year descending (newest first)
    matches.sort(key=lambda inv: inv.get("year", 0), reverse=True)
    
    # Trim for listing context
    return [trim_inventory_for_listing(inv) for inv in matches]


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
              - `data`: list of inventories when successful (trimmed to essential fields)
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
        # Trim payload before serialization to reduce tokens
        if result.success and result.data:
            result.data = _trim_user_inventories_data(result.data)
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
              - `data`: inventory payload when successful (trimmed to essential fields)
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
        # Trim payload before serialization to reduce tokens
        if result.success and result.data:
            result.data = _trim_inventory_data(result.data)
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
              - `data`: array of successfully fetched data sources (trimmed to essential fields)
              - `error` / `error_code`: populated on failure (missing token, invalid arguments, API errors, etc.)

        The response includes only successfully fetched data sources with their key metadata 
        (name, type, coverage, emissions summary) trimmed for efficiency.
        Removed and failed sources are not included.

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
        # Trim payload before serialization: only successful sources, reduced fields
        if result.success and result.data:
            result.data = _trim_datasources_data(result.data)
        return _serialize("get_all_datasources", result)

    cc_get_all_datasources.name = "get_all_datasources"  # type: ignore[attr-defined]

    @function_tool
    async def cc_city_inventory_search(city_name: str, year: Optional[int] = None) -> str:
        """Search for inventories by city name with optional year filtering.

        Use this tool when the user names a city and wants to see inventories for that location.
        
        Args:
            city_name: Name of the city to search for (case-insensitive, e.g., "New York", "paris")
            year: Optional specific year to filter results to. If omitted, returns all years for the city.

        Returns:
            JSON string containing matching inventories trimmed for listing context:
              - `action`: always "city_inventory_search"
              - `success`: boolean flag
              - `data`: array of matching inventories (sorted by year descending)
              - `error` / `error_code`: populated on failure
        
        Examples of queries that should use this tool:
            - "Show me inventories for New York"
            - "What data do I have for Paris?"
            - "List 2023 emissions for London"
            - "Find all inventories in Tokyo"
        
        **Note:** This tool searches the user's accessible inventories by city name.
        Results are automatically sorted by year (newest first) when multiple inventories
        exist for the same city.
        """
        # Fetch user inventories first
        result = await inventory_tool.fetch_user_inventories(
            token=token_ref["value"],
            user_id=user,
            thread_id=thread_str,
        )
        
        if not result.success or not result.data:
            return _serialize("city_inventory_search", result)
        
        # Extract inventory list
        inventory_list = result.data.get("data", []) if isinstance(result.data, dict) else result.data
        if not isinstance(inventory_list, list):
            return _serialize(
                "city_inventory_search",
                CCInventoryToolResult(
                    success=False,
                    error="Unexpected response format from user inventories",
                    error_code="invalid_response_format",
                ),
            )
        
        # Search by city
        matches = _search_inventories_by_city(inventory_list, city_name, year)
        
        # Return results
        search_result = CCInventoryToolResult(
            success=True,
            data={"data": matches}
        )
        return _serialize("city_inventory_search", search_result)

    cc_city_inventory_search.name = "city_inventory_search"  # type: ignore[attr-defined]

    tools: Sequence[object] = [
        cc_list_user_inventories,
        cc_get_inventory,
        cc_get_all_datasources,
        cc_city_inventory_search,
    ]
    return tools, token_ref
