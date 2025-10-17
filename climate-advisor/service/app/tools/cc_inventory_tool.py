"""
CityCatalyst Inventory Tool - Mockup Implementation

This tool demonstrates how to fetch inventory data from CityCatalyst using:
- User ID and JWT token from thread context
- CityCatalystClient for secure API communication
- Automatic token refresh on expiry

This is a mockup for development/testing. The actual inventory queries
will be implemented based on CC's inventory API schema.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, Optional, Union
from uuid import UUID

from ..services.citycatalyst_client import CityCatalystClient, CityCatalystClientError
from ..utils.token_manager import redact_token

logger = logging.getLogger(__name__)


class CCInventoryToolResult:
    """Result from CC inventory query."""
    
    def __init__(self, success: bool, data: Any = None, error: Optional[str] = None):
        self.success = success
        self.data = data
        self.error = error
    
    def to_dict(self) -> Dict[str, Any]:
        result = {
            "success": self.success,
        }
        if self.data is not None:
            result["data"] = self.data
        if self.error:
            result["error"] = self.error
        return result


class CCInventoryTool:
    """Tool for querying CityCatalyst inventory data with JWT authentication.
    
    This tool demonstrates the integration pattern for accessing CC inventory:
    1. Extract token and user_id from thread context
    2. Call CC inventory API with bearer token
    3. Handle token refresh automatically
    4. Return results to LLM or for use in other tools
    
    **For Development:** This is a mockup that prints token snippets.
    Remove the debug output in production.
    """
    
    tool_name = "cc_inventory_query"
    
    def __init__(self):
        """Initialize inventory tool."""
        self.cc_client = CityCatalystClient()
    
    async def query_inventory(
        self,
        query_type: str,
        *,
        token: str,
        user_id: str,
        thread_id: Union[str, UUID],
        filters: Optional[Dict[str, Any]] = None,
    ) -> CCInventoryToolResult:
        """Query CityCatalyst inventory data.
        
        Args:
            query_type: Type of inventory query (e.g., "emissions_factors", "facilities")
            token: JWT bearer token from thread context
            user_id: User ID from thread
            thread_id: Current thread ID
            filters: Optional filters for the query
        
        Returns:
            CCInventoryToolResult with query results or error
        """
        if not token:
            error_msg = "No access token available for inventory query"
            logger.warning(error_msg)
            return CCInventoryToolResult(success=False, error=error_msg)
        
        try:
            # **MOCKUP DEBUG OUTPUT** - Remove in production
            logger.info(
                "CC Inventory Tool - Querying %s for user=%s with token=%s",
                query_type,
                user_id,
                redact_token(token),
            )
            print(f"\n=== CC INVENTORY TOOL (MOCKUP) ===")
            print(f"Query Type: {query_type}")
            print(f"User ID: {user_id}")
            print(f"Thread ID: {thread_id}")
            print(f"Token (redacted): {redact_token(token)}")
            print(f"Token first 50 chars: {token[:50]}")
            print(f"Filters: {json.dumps(filters, indent=2) if filters else 'None'}")
            print(f"=== END MOCKUP ===\n")
            
            # Build API endpoint based on query type
            endpoints = {
                "emissions_factors": "/api/v0/inventory/emissions-factors",
                "facilities": "/api/v0/inventory/facilities",
                "scope3_activities": "/api/v0/inventory/scope3-activities",
            }
            
            endpoint = endpoints.get(query_type)
            if not endpoint:
                error_msg = f"Unknown query type: {query_type}"
                logger.error(error_msg)
                return CCInventoryToolResult(success=False, error=error_msg)
            
            # Make request to CC with token (would normally happen here)
            # Example: response = await self.cc_client.get_with_auto_refresh(...)
            
            # MOCKUP: Return dummy data to show integration works
            mock_data = {
                "query_type": query_type,
                "user_id": user_id,
                "endpoint": endpoint,
                "note": "This is mockup data. Implement actual CC inventory queries here.",
                "token_status": "✓ Token available and validated",
                "token_redacted": redact_token(token),
            }
            
            logger.info("Inventory query succeeded for user=%s", user_id)
            return CCInventoryToolResult(success=True, data=mock_data)
            
        except CityCatalystClientError as e:
            error_msg = f"Failed to query CC inventory: {e}"
            logger.error(error_msg)
            return CCInventoryToolResult(success=False, error=error_msg)
        except Exception as e:
            error_msg = f"Unexpected error querying inventory: {e}"
            logger.error(error_msg)
            return CCInventoryToolResult(success=False, error=error_msg)
    
    async def close(self) -> None:
        """Close HTTP client connection."""
        await self.cc_client.close()
