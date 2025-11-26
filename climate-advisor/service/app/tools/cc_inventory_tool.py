"""
CityCatalyst Inventory Tool – production implementation.

This module provides a façade over `CityCatalystClient` so tools can
fetch inventory data with JWT authentication and surface meaningful error
codes to the agent pipeline.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Dict, Optional, Union
from uuid import UUID

from ..services.citycatalyst_client import (
    CityCatalystClient,
    CityCatalystClientError,
)

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class CCInventoryToolResult:
    """Container for inventory tool responses."""

    success: bool
    data: Any = None
    error: Optional[str] = None
    error_code: Optional[str] = None
    status_code: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        payload: Dict[str, Any] = {"success": self.success}
        if self.data is not None:
            payload["data"] = self.data
        if self.error is not None:
            payload["error"] = self.error
        if self.error_code is not None:
            payload["error_code"] = self.error_code
        if self.status_code is not None:
            payload["status_code"] = self.status_code
        return payload


class CCInventoryTool:
    """Query CityCatalyst inventory APIs with automatic JWT refresh."""

    tool_name = "cc_inventory_query"

    def __init__(self, client: Optional[CityCatalystClient] = None) -> None:
        self.cc_client = client or CityCatalystClient()

    async def fetch_inventory(
        self,
        inventory_id: str,
        *,
        token: Optional[str],
        user_id: str,
        thread_id: Union[str, UUID],
    ) -> CCInventoryToolResult:
        """Fetch a single inventory record by ID."""
        if not token:
            return CCInventoryToolResult(
                success=False,
                error="CityCatalyst access token is required.",
                error_code="missing_token",
            )

        try:
            data = await self.cc_client.get_inventory(
                inventory_id,
                token=token,
                user_id=user_id,
            )
            return CCInventoryToolResult(
                success=True,
                data=data,
            )
        except CityCatalystClientError as exc:
            logger.error("Inventory fetch error: %s", exc)
            return CCInventoryToolResult(
                success=False,
                error=str(exc),
                error_code="cc_error",
            )

    async def fetch_user_inventories(
        self,
        *,
        token: Optional[str],
        user_id: str,
        thread_id: Union[str, UUID],
    ) -> CCInventoryToolResult:
        """Fetch all inventories available to the authenticated user."""
        if not token:
            return CCInventoryToolResult(
                success=False,
                error="CityCatalyst access token is required.",
                error_code="missing_token",
            )

        try:
            data = await self.cc_client.get_user_inventories(
                token=token,
                user_id=user_id,
            )
            return CCInventoryToolResult(
                success=True,
                data=data,
            )
        except CityCatalystClientError as exc:
            logger.error("User inventories fetch error: %s", exc)
            return CCInventoryToolResult(
                success=False,
                error=str(exc),
                error_code="cc_error",
            )

    async def fetch_inventory_datasources(
        self,
        *,
        inventory_id: str,
        token: Optional[str],
        user_id: str,
        thread_id: Union[str, UUID],
    ) -> CCInventoryToolResult:
        """Fetch all available data sources for a specific inventory."""
        if not token:
            return CCInventoryToolResult(
                success=False,
                error="CityCatalyst access token is required.",
                error_code="missing_token",
            )

        if not inventory_id or not inventory_id.strip():
            return CCInventoryToolResult(
                success=False,
                error="inventory_id is required.",
                error_code="invalid_arguments",
            )

        try:
            data = await self.cc_client.get_inventory_datasources(
                inventory_id,
                token=token,
                user_id=user_id,
            )
            return CCInventoryToolResult(
                success=True,
                data=data,
            )
        except CityCatalystClientError as exc:
            logger.error("Inventory data sources fetch error: %s", exc)
            return CCInventoryToolResult(
                success=False,
                error=str(exc),
                error_code="cc_error",
            )

    async def close(self) -> None:
        """Close HTTP client resources."""
        await self.cc_client.close()
