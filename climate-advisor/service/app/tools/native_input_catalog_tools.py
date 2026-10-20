"""Runtime Core-mediated NativeInputCatalog discovery and bounded reads."""

from __future__ import annotations

import dataclasses
import inspect
import json
import logging
import uuid
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
    NativeInputDiscoveryUnavailableError,
    is_transient_core_failure,
)

logger = logging.getLogger(__name__)

_MAX_TOOL_INPUT_BYTES = 16 * 1024
_MAX_TOOL_OUTPUT_BYTES = 64 * 1024
_UNAVAILABLE_MESSAGE = "Requested capability is unavailable."
_TEMPORARILY_UNAVAILABLE_CODE = "temporarily_unavailable"
_TEMPORARILY_UNAVAILABLE_MESSAGE = (
    "CityCatalyst is temporarily unavailable, so this lookup did not complete. "
    "This does not mean nothing is stored. Ask the user to try again shortly."
)
_DISCOVER_TOOL_NAME = "native_input_discover"
_READ_TOOL_NAME = "native_input_read"
_DISCOVER_DESCRIPTION = (
    "Discover which stored CityCatalyst inputs exist for the current chat scope, or "
    "for another accessible inventory when inventoryId is passed (take it from "
    "inventory_list_accessible; never show it to the user). "
    "Call this first when the user asks about their ranked, prioritized, or "
    "selected climate actions (HIAP ranking, action plan), or about stored "
    "inventory context. Each entry lists its catalogId and capabilityIds, and a "
    "displayName when one is stored (implementation plans carry the action name). "
    "An empty "
    "result means nothing is stored, which is not an access error. If the result "
    "is an error with error_code temporarily_unavailable, the lookup failed: do not "
    "say that no ranking exists."
)
_READ_DESCRIPTION = (
    "Read one stored input returned by native_input_discover, passing its catalogId "
    "and one of its capabilityIds. Supported capabilityIds: "
    "hiap.inventory.context (ranked climate actions and HIAP action plan), "
    "hiap_meed.ranking.context (HIAP-MEED ranked and removed actions), "
    "hiap.action_plan.context (HIAP implementation plan for one action), "
    "hiap_meed.output_plan.context (HIAP-MEED output plan for one action; "
    "accepts chapters to read only some chapters). hiap.inventory.context accepts "
    "scope (selected or ranked), type, limit and offset; hiap_meed.ranking.context "
    "accepts limit and offset. Page through a long list by repeating the read with "
    "offset until truncated is false. language is accepted by every capability "
    "except hiap.action_plan.context. Also "
    "ghgi.inventory.status_overview and "
    "ghgi.inventory.emissions_context. "
    "By default the city and inventory come from the chat scope; pass inventoryId "
    "only to read another accessible inventory chosen with inventory_list_accessible."
)

_MEED_CHAPTER_KEYS = (
    "snapshot",
    "the_action",
    "action_impact",
    "city_fit",
    "policy_backing",
    "legal_mandate_delivery",
    "financing_precedents_pathway",
    "sources_assumptions",
)
_MAX_LIMIT = 50
_MAX_OFFSET = 1000

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
    """Build the bounded inventory input from captured request scope.

    The inventory is required. The city is sent only when the request carries it;
    Core fills it from the authorized catalog row otherwise.
    """
    if not context.inventory_id:
        return None
    payload = {"inventory_id": context.inventory_id}
    if context.city_id:
        payload["city_id"] = context.city_id
    return payload


def _language_input(
    context: ActiveRequestContext,
    arguments: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Build bounded input from captured scope and optional language."""
    payload = _inventory_input(context, arguments)
    if payload is None:
        return None
    language = arguments.get("language", "en")
    if not isinstance(language, str) or not language.strip() or len(language) > 16:
        return None
    payload["language"] = language.strip()
    return payload


def _page_input(arguments: Dict[str, Any], payload: Dict[str, Any]) -> bool:
    """Copy validated paging arguments into payload; False when one is invalid."""
    for name, minimum, maximum in (
        ("limit", 1, _MAX_LIMIT),
        ("offset", 0, _MAX_OFFSET),
    ):
        if name not in arguments:
            continue
        value = arguments[name]
        if isinstance(value, bool) or not isinstance(value, int):
            return False
        if not minimum <= value <= maximum:
            return False
        payload[name] = value
    return True


def _hiap_input(
    context: ActiveRequestContext,
    arguments: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Build bounded HIAP ranking input: language, view, action type and page."""
    payload = _language_input(context, arguments)
    if payload is None or not _page_input(arguments, payload):
        return None
    for name, allowed in (
        ("scope", ("selected", "ranked")),
        ("type", ("mitigation", "adaptation")),
    ):
        if name in arguments:
            if arguments[name] not in allowed:
                return None
            payload[name] = arguments[name]
    return payload


def _meed_ranking_input(
    context: ActiveRequestContext,
    arguments: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Build bounded HIAP-MEED ranking input: language and page."""
    payload = _language_input(context, arguments)
    if payload is None or not _page_input(arguments, payload):
        return None
    return payload


def _meed_output_plan_input(
    context: ActiveRequestContext,
    arguments: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Build bounded HIAP-MEED output plan input: language and chapter keys."""
    payload = _language_input(context, arguments)
    if payload is None:
        return None
    if "chapters" in arguments:
        chapters = arguments["chapters"]
        if (
            not isinstance(chapters, list)
            or len(chapters) > len(_MEED_CHAPTER_KEYS)
            or any(chapter not in _MEED_CHAPTER_KEYS for chapter in chapters)
        ):
            return None
        payload["chapters"] = list(dict.fromkeys(chapters))
    return payload


_CAPABILITY_DEFINITIONS: dict[str, InputBuilder] = {
    "ghgi.inventory.status_overview": _inventory_input,
    "ghgi.inventory.emissions_context": _inventory_input,
    "hiap.inventory.context": _hiap_input,
    "hiap.action_plan.context": _inventory_input,
    "hiap_meed.ranking.context": _meed_ranking_input,
    "hiap_meed.output_plan.context": _meed_output_plan_input,
}
_LANGUAGE_CAPABILITIES = frozenset(
    {
        "hiap.inventory.context",
        "hiap_meed.ranking.context",
        "hiap_meed.output_plan.context",
    }
)
# Optional read arguments each capability accepts beyond catalog, capability,
# language and inventory. Anything else is rejected before Core is called.
_CAPABILITY_ARGUMENTS: dict[str, frozenset[str]] = {
    "hiap.inventory.context": frozenset({"scope", "type", "limit", "offset"}),
    "hiap_meed.ranking.context": frozenset({"limit", "offset"}),
    "hiap_meed.output_plan.context": frozenset({"chapters"}),
}
_EXTRA_ARGUMENTS = frozenset({"scope", "type", "limit", "offset", "chapters"})

_INVENTORY_ID_SCHEMA = {"type": "string", "format": "uuid"}

_DISCOVER_SCHEMA = {
    "type": "object",
    "properties": {
        "cursor": {"type": "string", "minLength": 1, "maxLength": 4096},
        "inventoryId": _INVENTORY_ID_SCHEMA,
    },
    "additionalProperties": False,
}

_READ_SCHEMA = {
    "type": "object",
    "properties": {
        "catalogId": {"type": "string", "minLength": 1},
        "capabilityId": {"type": "string", "minLength": 1},
        "language": {"type": "string", "maxLength": 16},
        "inventoryId": _INVENTORY_ID_SCHEMA,
        "scope": {"type": "string", "enum": ["selected", "ranked"]},
        "type": {"type": "string", "enum": ["mitigation", "adaptation"]},
        "limit": {"type": "integer", "minimum": 1, "maximum": _MAX_LIMIT},
        "offset": {"type": "integer", "minimum": 0, "maximum": _MAX_OFFSET},
        "chapters": {
            "type": "array",
            "items": {"type": "string", "enum": list(_MEED_CHAPTER_KEYS)},
            "maxItems": len(_MEED_CHAPTER_KEYS),
        },
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
        arguments = _parse_discover_arguments(raw_arguments)
        if arguments is None:
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

        # Fetch a fresh result; a continuation cursor is not an authorization grant.
        # An inventory override applies to this call only.
        discover_context = _scoped_context(context, arguments)
        try:
            cursor = arguments.get("cursor")
            if cursor:
                discovery = await service.discover(
                    context=discover_context,
                    token=token,
                    cursor=cursor,
                )
            else:
                discovery = await service.discover(
                    context=discover_context, token=token
                )
            return _discovery_success_payload(discovery)
        except NativeInputDiscoveryUnavailableError:
            logger.warning("NativeInputCatalog discovery temporarily unavailable")
            return _error_payload(
                _DISCOVER_TOOL_NAME,
                _TEMPORARILY_UNAVAILABLE_CODE,
                _TEMPORARILY_UNAVAILABLE_MESSAGE,
            )
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

        # An inventory override applies to this call only; Core re-authorizes it.
        read_context = _scoped_context(context, arguments)

        # Resolve only reviewed capability-specific input builders.
        catalog_id = arguments["catalogId"]
        capability_id = arguments["capabilityId"]
        definition = _CAPABILITY_DEFINITIONS.get(capability_id)
        if (
            definition is None
            or (
                "language" in arguments
                and capability_id not in _LANGUAGE_CAPABILITIES
            )
            or (
                (_EXTRA_ARGUMENTS & set(arguments))
                - _CAPABILITY_ARGUMENTS.get(capability_id, frozenset())
            )
        ):
            return _error_payload(
                _READ_TOOL_NAME,
                "invalid_arguments",
                "Native input read arguments are invalid.",
            )

        input_payload = definition(read_context, arguments)
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
                    read_context,
                    catalog_id,
                    capability_id,
                    input_payload,
                ),
                token=token,
                user_id=context.user_id,
                thread_id=context.thread_id,
            )
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
            if is_transient_core_failure(error.status_code):
                return _error_payload(
                    _READ_TOOL_NAME,
                    _TEMPORARILY_UNAVAILABLE_CODE,
                    _TEMPORARILY_UNAVAILABLE_MESSAGE,
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
        description=_DISCOVER_DESCRIPTION,
        params_json_schema=_DISCOVER_SCHEMA,
        on_invoke_tool=discover,
        strict_json_schema=False,
    )
    read_tool = FunctionTool(
        name=_READ_TOOL_NAME,
        description=_READ_DESCRIPTION,
        params_json_schema=_READ_SCHEMA,
        on_invoke_tool=read,
        strict_json_schema=False,
    )
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
    if "inventoryId" in arguments and _normalize_inventory_id(
        arguments["inventoryId"]
    ) is None:
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
        projected = {
            "catalogId": entry["catalog_id"],
            "kind": entry["kind"],
            "owningModule": entry["owning_module"],
            "sourceType": entry["source_type"],
            "capabilityIds": capability_ids,
        }
        display_name = entry.get("display_name")
        if isinstance(display_name, str) and display_name:
            projected["displayName"] = display_name
        entries.append(projected)
    data: Dict[str, Any] = {"entries": entries}
    if discovery.continuation_cursor:
        data["continuationCursor"] = discovery.continuation_cursor
    return json.dumps(
        {
            "action": _DISCOVER_TOOL_NAME,
            "success": True,
            "data": data,
        },
        ensure_ascii=False,
        allow_nan=False,
    )


def _parse_discover_arguments(raw_arguments: str) -> Optional[Dict[str, Any]]:
    """Validate the finite discovery schema, including an optional opaque cursor."""
    arguments = _parse_arguments(raw_arguments)
    if arguments is None or set(arguments) - {"cursor", "inventoryId"}:
        return None
    cursor = arguments.get("cursor")
    if "cursor" in arguments and (
        not isinstance(cursor, str) or not cursor or len(cursor) > 4096
    ):
        return None
    if "inventoryId" in arguments and _normalize_inventory_id(
        arguments["inventoryId"]
    ) is None:
        return None
    return arguments


def _normalize_inventory_id(value: Any) -> Optional[str]:
    """Return a canonical lowercase UUID string, or None when the value is invalid."""
    if not isinstance(value, str):
        return None
    try:
        return str(uuid.UUID(value))
    except ValueError:
        return None


def _scoped_context(
    context: ActiveRequestContext, arguments: Dict[str, Any]
) -> ActiveRequestContext:
    """Return the chat context, or a per-call copy scoped to a model-chosen inventory.

    The override drops the chat city, organization and project so Core derives
    them from the authorized catalog row and the chat scope cannot reject a row
    from another project; the shared chat context is never mutated.
    """
    inventory_id = _normalize_inventory_id(arguments.get("inventoryId"))
    if inventory_id is None:
        return context
    return dataclasses.replace(
        context,
        inventory_id=inventory_id,
        city_id=None,
        organization_id=None,
        project_id=None,
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
