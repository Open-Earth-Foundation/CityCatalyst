"""Resolve backend Concept Note scope and project identifier-free model context."""

from __future__ import annotations

import re
from typing import Any


def omit_context_identifiers(value: Any) -> Any:
    """Copy JSON data without identifier or fingerprint fields at any depth.

    Persisted identity and source integrity checks remain untouched. Only the
    model-facing projection drops metadata; source text and facts are preserved.
    """
    if isinstance(value, dict):
        projected = {}
        for key, item in value.items():
            # Cover both API camelCase and persistence snake_case field names.
            normalized = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", key).lower()
            normalized = normalized.replace("-", "_")
            suffix = normalized.rsplit("_", 1)[-1]
            if suffix in {
                "id",
                "ids",
                "uuid",
                "uuids",
                "identifier",
                "identifiers",
                "fingerprint",
                "fingerprints",
                "hash",
                "hashes",
                "sha256",
                "checksum",
                "digest",
                "md5",
            } or normalized in {"analysis_contract_version", "idempotency_key"}:
                continue
            projected[key] = omit_context_identifiers(item)
        return projected
    if isinstance(value, list):
        return [omit_context_identifiers(item) for item in value]
    return value


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
