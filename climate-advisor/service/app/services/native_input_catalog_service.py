"""Request-scoped NativeInputCatalog discovery and selection binding."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

from app.services.citycatalyst_client import (
    CityCatalystClient,
    CityCatalystClientError,
)

_SAFE_ENTRY_FIELDS = (
    "catalog_id",
    "kind",
    "owning_module",
    "source_type",
    "capability_ids",
)
_UNAVAILABLE_MESSAGE = "Requested capability is unavailable."


@dataclass(frozen=True)
class ActiveRequestContext:
    """Authenticated request identity and the applicable resource scope."""

    user_id: str
    thread_id: str
    organization_id: Optional[str] = None
    project_id: Optional[str] = None
    city_id: Optional[str] = None
    inventory_id: Optional[str] = None

    def to_discovery_payload(self) -> dict[str, str]:
        """Return only the non-empty context fields accepted by Core discovery."""
        payload = {
            field: value
            for field, value in (
                ("user_id", self.user_id),
                ("organization_id", self.organization_id),
                ("project_id", self.project_id),
                ("city_id", self.city_id),
                ("inventory_id", self.inventory_id),
            )
            if value
        }
        return payload


@dataclass(frozen=True)
class NativeInputDiscovery:
    """Safe, bounded entries retained for one active request."""

    entries: tuple[dict[str, Any], ...]


@dataclass(frozen=True)
class NativeInputSelection:
    """A current Core-issued catalog/capability pair bound to request context."""

    catalog_id: str
    capability_id: str
    context: ActiveRequestContext


class NativeInputSelectionError(Exception):
    """Stable non-disclosing error for invalid or stale selections."""

    def __init__(self) -> None:
        super().__init__(_UNAVAILABLE_MESSAGE)


class NativeInputCatalogService:
    """Coordinate safe request-time discovery without authorizing source reads."""

    def __init__(
        self,
        *,
        core_client: CityCatalystClient,
        enabled: bool = True,
    ) -> None:
        """Initialize a request-scoped coordinator over the existing Core client."""
        self.core_client = core_client
        self.enabled = enabled
        self._discovery: Optional[NativeInputDiscovery] = None
        self._context: Optional[ActiveRequestContext] = None

    async def discover(
        self,
        *,
        context: Optional[ActiveRequestContext],
        token: Optional[str],
    ) -> NativeInputDiscovery:
        """Discover safe entries once for the active context and fail closed."""
        if not self.enabled or context is None:
            return self._empty_discovery()

        if self._discovery is not None:
            if context != self._context:
                return self._empty_discovery()
            return self._discovery

        self._context = context
        try:
            response = await self.core_client.discover_native_inputs(
                request_payload=context.to_discovery_payload(),
                token=token,
                user_id=context.user_id,
                thread_id=context.thread_id,
            )
            self._discovery = self._parse_discovery(response)
        except (CityCatalystClientError, TimeoutError):
            self._discovery = self._empty_discovery()
        return self._discovery

    def bind_selection(
        self,
        *,
        catalog_id: str,
        capability_id: str,
        context: Optional[ActiveRequestContext] = None,
    ) -> NativeInputSelection:
        """Bind an exact current discovery pair to the active request context."""
        if self._discovery is None or self._context is None:
            raise NativeInputSelectionError()
        if context is not None and context != self._context:
            raise NativeInputSelectionError()

        for entry in self._discovery.entries:
            if entry["catalog_id"] == catalog_id and capability_id in entry[
                "capability_ids"
            ]:
                return NativeInputSelection(
                    catalog_id=catalog_id,
                    capability_id=capability_id,
                    context=self._context,
                )
        raise NativeInputSelectionError()

    @staticmethod
    def _empty_discovery() -> NativeInputDiscovery:
        """Return an empty safe discovery result."""
        return NativeInputDiscovery(entries=())

    @classmethod
    def _parse_discovery(cls, response: Any) -> NativeInputDiscovery:
        """Keep only valid safe entry fields from the Core discovery envelope."""
        if not isinstance(response, dict) or response.get("success") is not True:
            return cls._empty_discovery()
        data = response.get("data")
        if not isinstance(data, dict) or not isinstance(data.get("entries"), list):
            return cls._empty_discovery()

        safe_entries: list[dict[str, Any]] = []
        for entry in data["entries"]:
            safe_entry = cls._safe_entry(entry)
            if safe_entry is not None:
                safe_entries.append(safe_entry)
        return NativeInputDiscovery(entries=tuple(safe_entries))

    @staticmethod
    def _safe_entry(entry: Any) -> Optional[dict[str, Any]]:
        """Return the minimal safe projection for one valid discovery entry."""
        if not isinstance(entry, dict):
            return None
        if any(not isinstance(entry.get(field), str) for field in _SAFE_ENTRY_FIELDS[:-1]):
            return None
        capability_ids = entry.get("capability_ids")
        if not isinstance(capability_ids, list) or not capability_ids:
            return None
        if any(not isinstance(capability_id, str) for capability_id in capability_ids):
            return None

        return {
            "catalog_id": entry["catalog_id"],
            "kind": entry["kind"],
            "owning_module": entry["owning_module"],
            "source_type": entry["source_type"],
            "capability_ids": tuple(capability_ids),
        }
