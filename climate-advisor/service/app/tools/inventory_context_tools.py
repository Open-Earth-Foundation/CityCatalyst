from __future__ import annotations

import inspect
import json
import logging
from typing import Any, Awaitable, Callable, Dict, Optional, Sequence

from agents import function_tool
from fastapi import HTTPException

from app.services.citycatalyst_client import (
    CityCatalystClient,
    CityCatalystClientError,
)

logger = logging.getLogger(__name__)

INVENTORY_LIST_ACCESSIBLE_ACTION = "ghgi.inventory.list_accessible"
INVENTORY_STATUS_OVERVIEW_ACTION = "ghgi.inventory.status_overview"
INVENTORY_EMISSIONS_CONTEXT_ACTION = "ghgi.inventory.emissions_context"

ScopeResolver = Callable[[], Awaitable[tuple[str, str]]]
ClientFactory = Callable[[], CityCatalystClient]
CapabilityLoader = Callable[
    [CityCatalystClient, Dict[str, Any], Optional[str]],
    Awaitable[Dict[str, Any]],
]


def build_inventory_context_tools(
    *,
    resolve_scope: ScopeResolver,
    user_id: str,
    token_ref: Dict[str, Optional[str]],
    client_factory: ClientFactory = CityCatalystClient,
) -> Sequence[object]:
    """Create read-only whole-inventory context tools for a scoped workflow."""

    async def _run_capability_tool(
        action: str,
        loader: CapabilityLoader,
    ) -> str:
        """Resolve the active inventory scope and call one CC capability route."""
        token = token_ref.get("value")
        if not token:
            return _error_payload(
                action=action,
                error_code="missing_token",
                error="CityCatalyst access token is required.",
            )

        try:
            # Resolve city/inventory from workflow state, not from LLM arguments.
            city_id, inventory_id = await resolve_scope()
            request_payload = {
                "user_id": user_id,
                "city_id": city_id,
                "inventory_id": inventory_id,
            }

            # Use a short-lived CC client so the tool has no durable resources.
            client = client_factory()
            try:
                result = await loader(client, request_payload, token)
                _update_token_ref_from_client(client, token_ref)
            finally:
                await _close_client(client)

            if not isinstance(result, dict):
                return _error_payload(
                    action=action,
                    error_code="invalid_response",
                    error="CityCatalyst returned an invalid capability response.",
                )
            return json.dumps(result, default=str)
        except HTTPException as exc:
            logger.info(
                "Inventory context tool rejected action=%s status=%s detail=%s",
                action,
                exc.status_code,
                exc.detail,
            )
            return _error_payload(
                action=action,
                error_code=f"http_{exc.status_code}",
                error=str(exc.detail),
                status_code=exc.status_code,
            )
        except CityCatalystClientError as exc:
            logger.error("Inventory context CC error action=%s: %s", action, exc)
            return _error_payload(
                action=action,
                error_code="cc_error",
                error=str(exc),
                status_code=exc.status_code,
            )
        except Exception as exc:
            logger.exception("Inventory context tool failed action=%s", action)
            return _error_payload(
                action=action,
                error_code="tool_error",
                error=str(exc),
            )

    @function_tool
    async def inventory_status_overview() -> str:
        """Return compact whole-inventory completion and sector data state.

        The tool calls CityCatalyst action `ghgi.inventory.status_overview`.
        It returns no row ids, modules, raw sources, source issues, or detailed
        Stationary Energy drilldown.
        """

        return await _run_capability_tool(
            INVENTORY_STATUS_OVERVIEW_ACTION,
            lambda client, payload, token: client.load_inventory_status_overview(
                request_payload=payload,
                token=token,
            ),
        )

    inventory_status_overview.name = (  # type: ignore[attr-defined]
        "inventory_status_overview"
    )

    @function_tool
    async def inventory_emissions_context() -> str:
        """Return compact whole-inventory emissions distribution and source mix.

        The tool calls CityCatalyst action `ghgi.inventory.emissions_context`.
        It returns aggregate emissions, sector shares, top emitters, and minimal
        source composition without exposing raw source rows or source issues.
        """

        return await _run_capability_tool(
            INVENTORY_EMISSIONS_CONTEXT_ACTION,
            lambda client, payload, token: client.load_inventory_emissions_context(
                request_payload=payload,
                token=token,
            ),
        )

    inventory_emissions_context.name = (  # type: ignore[attr-defined]
        "inventory_emissions_context"
    )

    return [inventory_status_overview, inventory_emissions_context]


def build_inventory_capability_tools(
    *,
    user_id: str,
    token_ref: Dict[str, Optional[str]],
    client_factory: ClientFactory = CityCatalystClient,
) -> Sequence[object]:
    """Create read-only whole-inventory tools for default Clima chat."""

    async def _run_capability_tool(
        action: str,
        request_payload: Dict[str, Any],
        loader: CapabilityLoader,
    ) -> str:
        """Call one CC inventory capability route with explicit tool arguments."""
        token = token_ref.get("value")
        if not token:
            return _error_payload(
                action=action,
                error_code="missing_token",
                error="CityCatalyst access token is required.",
            )

        try:
            client = client_factory()
            try:
                result = await loader(client, request_payload, token)
                _update_token_ref_from_client(client, token_ref)
            finally:
                await _close_client(client)

            if not isinstance(result, dict):
                return _error_payload(
                    action=action,
                    error_code="invalid_response",
                    error="CityCatalyst returned an invalid capability response.",
                )
            return json.dumps(result, default=str)
        except CityCatalystClientError as exc:
            logger.error("Inventory capability CC error action=%s: %s", action, exc)
            return _error_payload(
                action=action,
                error_code="cc_error",
                error=str(exc),
                status_code=exc.status_code,
            )
        except Exception as exc:
            logger.exception("Inventory capability tool failed action=%s", action)
            return _error_payload(
                action=action,
                error_code="tool_error",
                error=str(exc),
            )

    @function_tool
    async def inventory_list_accessible(
        city_query: Optional[str] = None,
        year: Optional[int] = None,
        include_all_city_years: bool = False,
    ) -> str:
        """List city/year inventories the user can access.

        Returns totals plus organization/project breakdown fields so count
        questions can be answered as access summaries. Use optional city/year
        filters to narrow choices. Set include_all_city_years when the user asks
        for every inventory year for a matching city.
        """

        request_payload: Dict[str, Any] = {
            "user_id": user_id,
            "include_all_city_years": include_all_city_years,
        }
        if city_query and city_query.strip():
            request_payload["city_query"] = city_query.strip()
        if year is not None:
            request_payload["year"] = year

        return await _run_capability_tool(
            INVENTORY_LIST_ACCESSIBLE_ACTION,
            request_payload,
            lambda client, payload, token: client.load_inventory_list_accessible(
                request_payload=payload,
                token=token,
            ),
        )

    inventory_list_accessible.name = (  # type: ignore[attr-defined]
        "inventory_list_accessible"
    )

    @function_tool
    async def inventory_status_overview(city_id: str, inventory_id: str) -> str:
        """Return compact whole-inventory completion and sector data state.

        The city_id and inventory_id values must come from
        inventory_list_accessible. Do not expose these raw IDs to the user.
        """

        request_payload = _explicit_inventory_payload(
            action=INVENTORY_STATUS_OVERVIEW_ACTION,
            user_id=user_id,
            city_id=city_id,
            inventory_id=inventory_id,
        )
        if isinstance(request_payload, str):
            return request_payload

        return await _run_capability_tool(
            INVENTORY_STATUS_OVERVIEW_ACTION,
            request_payload,
            lambda client, payload, token: client.load_inventory_status_overview(
                request_payload=payload,
                token=token,
            ),
        )

    inventory_status_overview.name = (  # type: ignore[attr-defined]
        "inventory_status_overview"
    )

    @function_tool
    async def inventory_emissions_context(city_id: str, inventory_id: str) -> str:
        """Return compact whole-inventory emissions distribution and source mix.

        The city_id and inventory_id values must come from
        inventory_list_accessible. Do not expose these raw IDs to the user.
        """

        request_payload = _explicit_inventory_payload(
            action=INVENTORY_EMISSIONS_CONTEXT_ACTION,
            user_id=user_id,
            city_id=city_id,
            inventory_id=inventory_id,
        )
        if isinstance(request_payload, str):
            return request_payload

        return await _run_capability_tool(
            INVENTORY_EMISSIONS_CONTEXT_ACTION,
            request_payload,
            lambda client, payload, token: client.load_inventory_emissions_context(
                request_payload=payload,
                token=token,
            ),
        )

    inventory_emissions_context.name = (  # type: ignore[attr-defined]
        "inventory_emissions_context"
    )

    return [
        inventory_list_accessible,
        inventory_status_overview,
        inventory_emissions_context,
    ]


async def _close_client(client: object) -> None:
    """Close a client and tolerate synchronous test doubles."""
    close = getattr(client, "close", None)
    if not callable(close):
        return
    close_result = close()
    if inspect.isawaitable(close_result):
        await close_result


def _update_token_ref_from_client(
    client: object,
    token_ref: Dict[str, Optional[str]],
) -> None:
    """Copy a refreshed client token into the shared tool token reference."""
    refreshed_token = getattr(client, "last_refreshed_token", None)
    if isinstance(refreshed_token, str) and refreshed_token:
        token_ref["value"] = refreshed_token


def _explicit_inventory_payload(
    *,
    action: str,
    user_id: str,
    city_id: str,
    inventory_id: str,
) -> Dict[str, Any] | str:
    """Build a scoped inventory capability payload from default tool args."""
    if not city_id or not city_id.strip():
        return _error_payload(
            action=action,
            error_code="invalid_arguments",
            error="city_id is required.",
        )
    if not inventory_id or not inventory_id.strip():
        return _error_payload(
            action=action,
            error_code="invalid_arguments",
            error="inventory_id is required.",
        )

    return {
        "user_id": user_id,
        "city_id": city_id.strip(),
        "inventory_id": inventory_id.strip(),
    }


def _error_payload(
    *,
    action: str,
    error_code: str,
    error: str,
    status_code: int | None = None,
) -> str:
    """Serialize a failed read-only inventory context tool response."""
    payload: Dict[str, Any] = {
        "action": action,
        "success": False,
        "error_code": error_code,
        "error": error,
    }
    if status_code is not None:
        payload["status_code"] = status_code
    return json.dumps(payload, default=str)
