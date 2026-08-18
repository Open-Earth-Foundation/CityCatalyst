"""Helpers for resolving Concept Note run scope from chat context."""

from __future__ import annotations

from typing import Any


def extract_concept_note_run_id(*containers: Any) -> str | None:
    """Find a Concept Note run id across request or persisted thread context."""
    for container in containers:
        if not isinstance(container, dict):
            continue
        for key in ("concept_note_run_id", "concept_note_id"):
            value = container.get(key)
            if value:
                return str(value)
        nested = container.get("concept_note")
        if isinstance(nested, dict):
            value = extract_concept_note_run_id(nested)
            if value:
                return value
    return None
