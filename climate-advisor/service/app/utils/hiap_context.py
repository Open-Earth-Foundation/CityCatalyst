from __future__ import annotations

from typing import Any


def extract_hiap_context(*containers: Any) -> dict[str, Any] | None:
    """Find HIAP module context across loose request/thread context objects."""
    for container in containers:
        value = _extract_from_container(container)
        if value:
            return value
    return None


def should_enable_hiap_web_grounding(
    *,
    message: str,
    context: dict[str, Any] | None = None,
    options: dict[str, Any] | None = None,
) -> bool:
    """Return whether this HIAP turn should use OpenRouter web search plugin grounding."""
    context = context if isinstance(context, dict) else {}
    options = options if isinstance(options, dict) else {}

    explicit = (
        options.get("web_grounding")
        or options.get("openrouter_web_grounding")
        or context.get("web_grounding")
        or context.get("openrouter_web_grounding")
    )
    if isinstance(explicit, bool):
        return explicit

    text = (message or "").lower()
    grounding_terms = (
        "web",
        "search",
        "source",
        "sources",
        "citation",
        "latest",
        "current",
        "recent",
        "example",
        "case study",
        "funding",
        "grant",
        "policy",
        "regulation",
        "benchmark",
    )
    return any(term in text for term in grounding_terms)


def _extract_from_container(container: Any) -> dict[str, Any] | None:
    """Normalize HIAP context from a flat or nested context container."""
    if not isinstance(container, dict):
        return None

    module = container.get("module")
    city_id = container.get("city_id") or container.get("cityId")
    inventory_id = container.get("inventory_id") or container.get("inventoryId")
    if module == "hiap" and city_id and inventory_id:
        return {
            "module": "hiap",
            "city_id": str(city_id),
            "inventory_id": str(inventory_id),
            "lng": str(container.get("lng") or container.get("locale") or "en"),
            "workflow_step": str(container.get("workflow_step") or "review"),
        }

    nested = container.get("hiap")
    if isinstance(nested, dict):
        return _extract_from_container({"module": "hiap", **nested})

    return None
