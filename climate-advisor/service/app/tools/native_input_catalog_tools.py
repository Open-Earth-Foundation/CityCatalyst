"""Runtime Core-mediated NativeInputCatalog discovery and bounded reads."""

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
    NativeInputCatalogService,
    NativeInputDiscovery,
)

logger = logging.getLogger(__name__)

_MAX_TOOL_INPUT_BYTES = 16 * 1024
_MAX_TOOL_OUTPUT_BYTES = 64 * 1024
_UNAVAILABLE_MESSAGE = "Requested capability is unavailable."
_DISCOVER_TOOL_NAME = "native_input_discover"
_READ_TOOL_NAME = "native_input_read"

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


_CAPABILITY_DEFINITIONS: dict[str, InputBuilder] = {
    "ghgi.inventory.status_overview": _inventory_input,
    "ghgi.inventory.emissions_context": _inventory_input,
    "hiap.inventory.context": _hiap_input,
}

_DISCOVER_SCHEMA = {
    "type": "object",
    "properties": {},
    "additionalProperties": False,
}

_READ_SCHEMA = {
    "type": "object",
    "properties": {
        "catalogId": {"type": "string", "minLength": 1},
        "capabilityId": {"type": "string", "minLength": 1},
        "language": {"type": "string", "maxLength": 16},
    },
    "required": ["catalogId", "capabilityId"],
    "additionalProperties": False,
}


def build_native_input_catalog_tools(
    *,
    service: NativeInputCatalogService,
    context: ActiveRequestContext,
    token_ref: Dict[str, Optional[str]],
    client_factory: Callable[[], CityCatalystClient] = CityCatalystClient,
) -> Sequence[FunctionTool]:
    """Create stable runtime discovery and read tools for one captured context."""

    async def discover(
        _tool_context: ToolContext[Any], raw_arguments: str
    ) -> str:
        """Discover current locally supported catalog entries from Core."""
        # Validate the fixed no-argument contract before reaching Core.
        arguments = _parse_arguments(raw_arguments)
        if arguments != {}:
            return _error_payload(
                _DISCOVER_TOOL_NAME,
                "invalid_arguments",
                "Discovery arguments are invalid.",
            )

        # Keep discovery fail-closed when the captured authorization expires.
        token = token_ref.get("value")
        if not token:
            return _error_payload(
                _DISCOVER_TOOL_NAME,
                "missing_token",
                "CityCatalyst access token is required.",
            )

        # Fetch a fresh result; compatibility filtering is not authorization.
        try:
            discovery = await service.discover(context=context, token=token)
            _update_token_ref(getattr(service, "core_client", None), token_ref)
            return _discovery_success_payload(discovery)
        except Exception:
            logger.warning("NativeInputCatalog discovery failed")
            return _error_payload(
                _DISCOVER_TOOL_NAME,
                "tool_error",
                "Native input catalog could not be discovered.",
            )

    async def read(_tool_context: ToolContext[Any], raw_arguments: str) -> str:
        """Validate one finite read request and delegate authorization to Core."""
        # Validate model input against the fixed v1 boundary.
        arguments = _parse_read_arguments(raw_arguments)
        if arguments is None:
            return _error_payload(
                _READ_TOOL_NAME,
                "invalid_arguments",
                "Native input read arguments are invalid.",
            )

        # Resolve only reviewed capability-specific input builders.
        catalog_id = arguments["catalogId"]
        capability_id = arguments["capabilityId"]
        definition = _CAPABILITY_DEFINITIONS.get(capability_id)
        if definition is None or (
            "language" in arguments and capability_id != "hiap.inventory.context"
        ):
            return _error_payload(
                _READ_TOOL_NAME,
                "invalid_arguments",
                "Native input read arguments are invalid.",
            )

        input_payload = definition(context, arguments)
        if input_payload is None:
            return _error_payload(
                _READ_TOOL_NAME,
                "invalid_arguments",
                "Native input read arguments are invalid.",
            )

        # Use the shared rotated token without exposing it to the model.
        token = token_ref.get("value")
        if not token:
            return _error_payload(
                _READ_TOOL_NAME,
                "missing_token",
                "CityCatalyst access token is required.",
            )

        # Core independently revalidates the submitted catalog/capability pair.
        client = client_factory()
        try:
            response = await client.read_native_input(
                request_payload=_read_payload(
                    context,
                    catalog_id,
                    capability_id,
                    input_payload,
                ),
                token=token,
                user_id=context.user_id,
                thread_id=context.thread_id,
            )
            _update_token_ref(client, token_ref)
            return _success_payload(capability_id, response)
        except CityCatalystClientError as error:
            if error.status_code == 404:
                return _error_payload(
                    _READ_TOOL_NAME,
                    "capability_unavailable",
                    _UNAVAILABLE_MESSAGE,
                )
            logger.warning(
                "NativeInputCatalog read failed capability=%s status=%s",
                capability_id,
                error.status_code,
            )
            return _error_payload(
                _READ_TOOL_NAME,
                "tool_error",
                "Native input capability could not be read.",
            )
        except Exception:
            logger.error("NativeInputCatalog read failed capability=%s", capability_id)
            return _error_payload(
                _READ_TOOL_NAME,
                "tool_error",
                "Native input capability could not be read.",
            )
        finally:
            await _close_client(client)

    discover_tool = FunctionTool(
        name=_DISCOVER_TOOL_NAME,
        description="Discover currently available bounded CityCatalyst inputs.",
        params_json_schema=_DISCOVER_SCHEMA,
        on_invoke_tool=discover,
    )
    read_tool = FunctionTool(
        name=_READ_TOOL_NAME,
        description="Read one bounded CityCatalyst input capability.",
        params_json_schema=_READ_SCHEMA,
        on_invoke_tool=read,
    )

    # The Agents SDK normalizes omitted fields into `required`; restore v1's
    # deliberately optional language contract before model registration.
    discover_tool.params_json_schema = _DISCOVER_SCHEMA
    read_tool.params_json_schema = _READ_SCHEMA
    return [discover_tool, read_tool]


def _parse_read_arguments(raw_arguments: str) -> Optional[Dict[str, Any]]:
    """Validate the finite v1 native-input read argument schema."""
    arguments = _parse_arguments(raw_arguments)
    if arguments is None or set(arguments) - set(_READ_SCHEMA["properties"]):
        return None
    catalog_id = arguments.get("catalogId")
    capability_id = arguments.get("capabilityId")
    if not isinstance(catalog_id, str) or not catalog_id:
        return None
    if not isinstance(capability_id, str) or not capability_id:
        return None
    language = arguments.get("language")
    if "language" in arguments and (
        not isinstance(language, str) or len(language) > 16
    ):
        return None
    return arguments


def _discovery_success_payload(discovery: NativeInputDiscovery) -> str:
    """Serialize current safe discovery entries with local compatibility filtering."""
    entries = []
    for entry in discovery.entries:
        capability_ids = [
            capability_id
            for capability_id in entry.get("capability_ids", ())
            if capability_id in _CAPABILITY_DEFINITIONS
        ]
        if not capability_ids:
            continue
        entries.append(
            {
                "catalogId": entry["catalog_id"],
                "kind": entry["kind"],
                "owningModule": entry["owning_module"],
                "sourceType": entry["source_type"],
                "capabilityIds": capability_ids,
            }
        )
    return json.dumps(
        {
            "action": _DISCOVER_TOOL_NAME,
            "success": True,
            "data": {"entries": entries},
        },
        ensure_ascii=False,
        allow_nan=False,
    )


def _parse_arguments(raw_arguments: str) -> Optional[Dict[str, Any]]:
    """Parse finite JSON object arguments without retaining untrusted payloads."""
    if (
        not isinstance(raw_arguments, str)
        or len(raw_arguments.encode("utf-8")) > _MAX_TOOL_INPUT_BYTES
    ):
        return None
    try:
        arguments = json.loads(raw_arguments or "{}")
    except (TypeError, ValueError):
        return None
    return arguments if isinstance(arguments, dict) else None


def _read_payload(
    context: ActiveRequestContext,
    catalog_id: str,
    capability_id: str,
    input_payload: Dict[str, Any],
) -> Dict[str, Any]:
    """Build the Core selected-read payload from captured request state."""
    payload = context.to_discovery_payload()
    payload.update(
        {
            "catalogId": catalog_id,
            "capabilityId": capability_id,
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
        serialized_data = json.dumps(safe_data, ensure_ascii=False, allow_nan=False)
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
        {"action": capability_id, "success": True, "data": safe_data},
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


def _update_token_ref(client: object, token_ref: Dict[str, Optional[str]]) -> None:
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


def _error_payload(action: str, code: str, message: str) -> str:
    """Serialize one small safe tool error envelope."""
    return json.dumps(
        {
            "action": action,
            "success": False,
            "error_code": code,
            "error": message,
        }
    )
