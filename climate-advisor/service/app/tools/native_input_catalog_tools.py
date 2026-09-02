"""Selected-only, Core-mediated NativeInputCatalog capability tools."""

from __future__ import annotations

import inspect
import json
import logging
from typing import Any, Callable, Dict, Optional, Sequence

from agents.tool import FunctionTool, ToolContext

from app.services.citycatalyst_client import (
    CityCatalystClient,
    CityCatalystClientError,
)
from app.services.native_input_catalog_service import (
    ActiveRequestContext,
    NativeInputDiscovery,
    NativeInputSelection,
)

logger = logging.getLogger(__name__)

_MAX_TOOL_INPUT_BYTES = 16 * 1024
_MAX_TOOL_OUTPUT_BYTES = 64 * 1024
_UNAVAILABLE_MESSAGE = "Requested capability is unavailable."

_FORBIDDEN_RESULT_KEYS = {
    "access_key_id",
    "authorization",
    "bearer_token",
    "catalog_id",
    "city_id",
    "client_secret",
    "credentials",
    "inventory_id",
    "object_key",
    "organization_id",
    "password",
    "private_key",
    "project_id",
    "s3_key",
    "secret_access_key",
    "signed_url",
    "source_id",
    "storage_path",
    "token",
    "user_id",
}

InputBuilder = Callable[[ActiveRequestContext, Dict[str, Any]], Optional[Dict[str, Any]]]


def _inventory_input(
    context: ActiveRequestContext,
    _arguments: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Build the bounded inventory input from captured request scope."""
    if not context.city_id or not context.inventory_id:
        return None
    return {
        "city_id": context.city_id,
        "inventory_id": context.inventory_id,
    }


def _hiap_input(
    context: ActiveRequestContext,
    arguments: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Build bounded HIAP input from captured scope and optional language."""
    payload = _inventory_input(context, arguments)
    if payload is None:
        return None
    language = arguments.get("language", "en")
    if not isinstance(language, str) or not language.strip() or len(language) > 16:
        return None
    payload["language"] = language.strip()
    return payload


_CAPABILITY_DEFINITIONS: dict[str, dict[str, Any]] = {
    "ghgi.inventory.status_overview": {
        "name": "native_input_ghgi_inventory_status_overview",
        "description": "Read the selected bounded CityCatalyst inventory status.",
        "properties": {},
        "input_builder": _inventory_input,
    },
    "ghgi.inventory.emissions_context": {
        "name": "native_input_ghgi_inventory_emissions_context",
        "description": "Read the selected bounded CityCatalyst emissions context.",
        "properties": {},
        "input_builder": _inventory_input,
    },
    "hiap.inventory.context": {
        "name": "native_input_hiap_inventory_context",
        "description": "Read the selected bounded CityCatalyst action context.",
        "properties": {
            "language": {"type": "string", "maxLength": 16},
        },
        "input_builder": _hiap_input,
    },
}


def build_native_input_catalog_tools(
    *,
    selection: NativeInputSelection,
    discovery: NativeInputDiscovery,
    token_ref: Dict[str, Optional[str]],
    client_factory: Callable[[], CityCatalystClient] = CityCatalystClient,
) -> Sequence[object]:
    """Create exactly one Core-backed tool for the current selected capability."""
    definition = _CAPABILITY_DEFINITIONS.get(selection.capability_id)
    if definition is None or not _selection_is_current(selection, discovery):
        return []

    async def invoke(_context: ToolContext[Any], raw_arguments: str) -> str:
        """Validate model arguments and execute only the captured selection."""
        arguments = _parse_arguments(raw_arguments)
        if arguments is None:
            return _error_payload(
                selection.capability_id,
                "invalid_arguments",
                "Selected capability arguments are invalid.",
            )

        allowed_arguments = set(definition["properties"])
        if set(arguments) - allowed_arguments:
            return _error_payload(
                selection.capability_id,
                "invalid_arguments",
                "Selected capability arguments are invalid.",
            )

        input_payload = definition["input_builder"](selection.context, arguments)
        if input_payload is None:
            return _error_payload(
                selection.capability_id,
                "invalid_arguments",
                "Selected capability arguments are invalid.",
            )

        token = token_ref.get("value")
        if not token:
            return _error_payload(
                selection.capability_id,
                "missing_token",
                "CityCatalyst access token is required.",
            )

        client = client_factory()
        try:
            response = await client.read_native_input(
                request_payload=_read_payload(selection, input_payload),
                token=token,
                user_id=selection.context.user_id,
                thread_id=selection.context.thread_id,
            )
            _update_token_ref(client, token_ref)
            return _success_payload(selection.capability_id, response)
        except CityCatalystClientError as exc:
            if exc.status_code == 404:
                return _error_payload(
                    selection.capability_id,
                    "capability_unavailable",
                    _UNAVAILABLE_MESSAGE,
                )
            logger.warning(
                "Selected NativeInputCatalog read failed capability=%s status=%s",
                selection.capability_id,
                exc.status_code,
            )
            return _error_payload(
                selection.capability_id,
                "tool_error",
                "Selected capability could not be read.",
            )
        except Exception:
            logger.error(
                "Selected NativeInputCatalog tool failed capability=%s",
                selection.capability_id,
            )
            return _error_payload(
                selection.capability_id,
                "tool_error",
                "Selected capability could not be read.",
            )
        finally:
            await _close_client(client)

    return [
        FunctionTool(
            name=definition["name"],
            description=definition["description"],
            params_json_schema={
                "type": "object",
                "properties": definition["properties"],
                "additionalProperties": False,
            },
            on_invoke_tool=invoke,
        )
    ]


def _selection_is_current(
    selection: NativeInputSelection,
    discovery: NativeInputDiscovery,
) -> bool:
    """Return whether the exact selected pair is in the current discovery."""
    return any(
        entry["catalog_id"] == selection.catalog_id
        and selection.capability_id in entry["capability_ids"]
        for entry in discovery.entries
    )


def _parse_arguments(raw_arguments: str) -> Optional[Dict[str, Any]]:
    """Parse finite JSON object arguments without retaining untrusted payloads."""
    if not isinstance(raw_arguments, str) or len(raw_arguments.encode("utf-8")) > _MAX_TOOL_INPUT_BYTES:
        return None
    try:
        arguments = json.loads(raw_arguments or "{}")
    except (TypeError, ValueError):
        return None
    return arguments if isinstance(arguments, dict) else None


def _read_payload(
    selection: NativeInputSelection,
    input_payload: Dict[str, Any],
) -> Dict[str, Any]:
    """Build the Core selected-read payload from captured request state."""
    context = selection.context
    payload = context.to_discovery_payload()
    payload.update(
        {
            "catalogId": selection.catalog_id,
            "capabilityId": selection.capability_id,
            "input": input_payload,
        }
    )
    return payload


def _success_payload(capability_id: str, response: Any) -> str:
    """Return a bounded success envelope or a small safe invalid-response error."""
    if not isinstance(response, dict) or response.get("success") is not True:
        return _error_payload(
            capability_id,
            "invalid_response",
            "CityCatalyst returned an invalid capability response.",
        )
    safe_data = _redact_result(response.get("data"))
    if not isinstance(safe_data, dict):
        return _error_payload(
            capability_id,
            "invalid_response",
            "CityCatalyst returned an invalid capability response.",
        )
    try:
        serialized_data = json.dumps(
            safe_data,
            ensure_ascii=False,
            allow_nan=False,
        )
    except (TypeError, ValueError):
        return _error_payload(
            capability_id,
            "invalid_response",
            "CityCatalyst returned an invalid capability response.",
        )
    if len(serialized_data.encode("utf-8")) > _MAX_TOOL_OUTPUT_BYTES:
        return _error_payload(
            capability_id,
            "invalid_response",
            "CityCatalyst returned an invalid capability response.",
        )
    return json.dumps(
        {
            "action": capability_id,
            "success": True,
            "data": safe_data,
        },
        ensure_ascii=False,
        allow_nan=False,
    )


def _redact_result(value: Any) -> Any:
    """Remove forbidden fields recursively before model-facing serialization."""
    if isinstance(value, list):
        return [_redact_result(item) for item in value]
    if not isinstance(value, dict):
        return value
    return {
        key: _redact_result(child)
        for key, child in value.items()
        if key.lower() not in _FORBIDDEN_RESULT_KEYS
    }


def _update_token_ref(
    client: object,
    token_ref: Dict[str, Optional[str]],
) -> None:
    """Copy a refreshed client token without exposing it in tool output."""
    refreshed_token = getattr(client, "last_refreshed_token", None)
    if isinstance(refreshed_token, str) and refreshed_token:
        token_ref["value"] = refreshed_token


async def _close_client(client: object) -> None:
    """Close the short-lived client and tolerate synchronous test doubles."""
    close = getattr(client, "close", None)
    if not callable(close):
        return
    result = close()
    if inspect.isawaitable(result):
        await result


def _error_payload(capability_id: str, code: str, message: str) -> str:
    """Serialize one small safe tool error envelope."""
    return json.dumps(
        {
            "action": capability_id,
            "success": False,
            "error_code": code,
            "error": message,
        }
    )
