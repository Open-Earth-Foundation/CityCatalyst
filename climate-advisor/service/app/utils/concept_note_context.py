"""Resolve backend Concept Note scope and project identifier-free model context."""

from __future__ import annotations

import json
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
                "ref",
                "refs",
                "fingerprint",
                "fingerprints",
                "hash",
                "hashes",
                "sha256",
                "checksum",
                "digest",
                "md5",
            } or normalized in {
                "analysis_contract_version",
                "idempotency_key",
                "local_snapshot_path",
                "markdown_s3_key",
                "completion_event",
                "retryable",
                "target_path",
            }:
                continue
            if normalized == "anchor":
                # Keep a readable document heading, never its generated block hash.
                if isinstance(item, str):
                    projected["heading"] = readable_source_heading(item)
                continue
            projected[key] = omit_context_identifiers(item)
        return projected
    if isinstance(value, list):
        return [omit_context_identifiers(item) for item in value]
    return value


def readable_source_heading(anchor: str) -> str:
    """Keep document headings while removing generated block fingerprints."""
    return re.sub(r"/?block-[0-9a-f]+(?:-s\d+)?$", "", anchor).strip("/") or "Document"


def clean_cnb_history(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Project persisted tool metadata without touching transport call IDs or prose."""
    cleaned = []
    for message in messages:
        content = message.get("content")
        if (
            message.get("role") == "system"
            and isinstance(content, str)
            and content.startswith("INTERNAL_TOOL_OUTPUT_JSON\n")
        ):
            try:
                payload = json.loads(content.split("\n", 1)[1])
            except (ValueError, IndexError):
                continue
            if not isinstance(payload, dict) or not isinstance(
                payload.get("tools_used", []), list
            ):
                continue
            # Old tool results may themselves be serialized JSON strings.
            for invocation in payload.get("tools_used", []):
                if not isinstance(invocation, dict):
                    continue
                for field in ("arguments", "result"):
                    value = invocation.get(field)
                    if isinstance(value, str):
                        try:
                            invocation[field] = json.loads(value)
                        except ValueError:
                            pass
            message = {
                **message,
                "content": "INTERNAL_TOOL_OUTPUT_JSON\n"
                + json.dumps(omit_context_identifiers(payload), ensure_ascii=False),
            }
        cleaned.append(message)
    return cleaned


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
