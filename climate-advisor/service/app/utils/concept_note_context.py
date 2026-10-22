"""Resolve backend Concept Note scope and project identifier-free model context.

Also reads rendered chat visuals from stored tool calls and compacts them for replay.
"""

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
                "visual_context_contract_version",
                "idempotency_key",
                "local_snapshot_path",
                "markdown_s3_key",
                "storage_key",
                "s3_key",
                "object_key",
                "completion_event",
                "retryable",
                "target_path",
            }:
                # Keep document-local visual envelope identity; drop system IDs only.
                if normalized != "image_id":
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


SOURCE_DOCUMENTS_MESSAGE_HEADER = "CONCEPT_NOTE_SOURCE_DOCUMENTS"


def render_source_documents_message(documents: list[dict[str, Any]]) -> str:
    """Render complete uploaded source text as one model-facing message body.

    Source indices follow ``selected_sources`` order so citations and source
    queries refer to the same document.
    """
    parts = [SOURCE_DOCUMENTS_MESSAGE_HEADER]
    for index, document in enumerate(documents, start=1):
        # JSON-quote metadata so labels cannot break the source wrapper.
        label = json.dumps(document.get("source_label") or "", ensure_ascii=False)
        filename = json.dumps(document.get("filename") or "", ensure_ascii=False)
        source_format = json.dumps(document.get("source_format") or "")
        parts.append(
            f'<source index="{index}" label={label} filename={filename} '
            f"format={source_format}>\n{document['text']}\n</source>"
        )
    return "\n\n".join(parts)


def manual_population_context(summary: Any) -> dict[str, Any] | None:
    """Label the run's user-entered population so models never mistake its source."""
    population = summary.get("manual_population") if isinstance(summary, dict) else None
    return {**population, "source": "user_entered"} if population else None


def readable_source_heading(anchor: str) -> str:
    """Keep document headings while removing generated block fingerprints."""
    return re.sub(r"/?block-[0-9a-f]+(?:-s\d+)?$", "", anchor).strip("/") or "Document"


def clean_cnb_history(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Demote generated tool history to runtime data, preserving transport and prose."""
    cleaned = []
    for message in messages:
        content = message.get("content")
        # A visual-only turn is stored with empty text; its tool output follows.
        if message.get("role") == "assistant" and content == "":
            continue
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
                "role": "user",
                "content": "INTERNAL_TOOL_OUTPUT_JSON\n"
                + json.dumps(omit_context_identifiers(payload), ensure_ascii=False),
            }
        cleaned.append(message)
    return cleaned


RENDER_VISUAL_TOOL_NAME = "concept_note_render_visual"
VISUAL_RENDER_ACTION = "concept_note.visual.render"


def rendered_visuals(tools_used: Any) -> list[dict[str, str]]:
    """Return the title and HTML of each successful visual in stored tool calls."""
    visuals = []
    for invocation in tools_used if isinstance(tools_used, list) else []:
        result = invocation.get("result_json") if isinstance(invocation, dict) else None
        if not isinstance(result, dict) or result.get("action") != VISUAL_RENDER_ACTION:
            continue
        data = result.get("data")
        if (
            result.get("success") is True
            and isinstance(data, dict)
            and isinstance(data.get("title"), str)
            and isinstance(data.get("html"), str)
        ):
            visuals.append({"title": data["title"], "html": data["html"]})
    return visuals


def omit_visual_html(invocation: dict[str, Any]) -> dict[str, Any]:
    """Copy a replayed visual tool call with its HTML replaced by a placeholder.

    Only the model-facing replay is compacted; the stored message row and the
    SSE done event keep the full HTML for the chat to render.
    """
    if invocation.get("name") != RENDER_VISUAL_TOOL_NAME:
        return invocation
    compact = dict(invocation)

    # The model already wrote this HTML once; never replay it as arguments.
    arguments = invocation.get("arguments")
    if isinstance(arguments, dict) and isinstance(arguments.get("html"), str):
        compact["arguments"] = {
            **arguments,
            "html": f"[{len(arguments['html'])} chars omitted]",
        }
    elif isinstance(arguments, str):
        compact["arguments"] = f"[{len(arguments)} chars omitted]"

    result = invocation.get("result")
    data = result.get("data") if isinstance(result, dict) else None
    if isinstance(data, dict) and isinstance(data.get("html"), str):
        placeholder = (
            f"[visual '{data.get('title')}' rendered, "
            f"{len(data['html'])} chars omitted]"
        )
        compact["result"] = {**result, "data": {**data, "html": placeholder}}
    return compact


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
