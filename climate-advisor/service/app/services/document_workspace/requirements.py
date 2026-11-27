"""Deterministic template requirements and strict accepted-value validation."""

from __future__ import annotations

import json
import math
import re
from datetime import date
from hashlib import sha256
from typing import Any

from fastapi import HTTPException

from app.models.cnb.concept_note_application_context import ApplicationContextTemplate
from app.services.cnb.application_context import template_chapter_requirements


def fingerprint(value: Any) -> str:
    """Hash canonical JSON for setup identity and exact idempotency matching."""
    return sha256(
        json.dumps(
            value, sort_keys=True, separators=(",", ":"), ensure_ascii=False
        ).encode("utf-8")
    ).hexdigest()


def template_definitions(template: ApplicationContextTemplate) -> list[dict[str, Any]]:
    """Share only explicit semantic keys; legacy labels remain chapter scoped.

    Rich field dictionaries may declare answer_type, choices, bounds, exception
    permissions and evidence_need. Conflicting shared schemas fail closed.
    """
    definitions: dict[str, dict[str, Any]] = {}
    normalized = template_chapter_requirements(template)
    raw_by_ref = {
        str(item.get("chapter_ref", "")): item for item in template.chapter_schema
    }
    chapter_string_fields: set[str] = set()
    for chapter in normalized:
        chapter_ref = chapter["chapter_ref"]
        fields = raw_by_ref.get(chapter_ref, {}).get("required_fields", [])
        for field in fields:
            if isinstance(field, str):
                chapter_string_fields.add(field)
            _add_definition(definitions, template, chapter_ref, field, [chapter_ref])
    # Template-wide requirements affect every chapter; ambiguous labels still
    # have their own deterministic template scope rather than a fuzzy merge.
    for field in template.required_fields:
        # Reviewed legacy/custom templates also store an aggregate of chapter
        # strings here. Count those once, without merging separate chapters.
        if field in chapter_string_fields:
            continue
        _add_definition(
            definitions,
            template,
            "document",
            field,
            [item["chapter_ref"] for item in normalized],
        )
    return list(definitions.values())


def _add_definition(
    definitions: dict[str, dict[str, Any]],
    template: ApplicationContextTemplate,
    scope: str,
    field: str | dict[str, Any],
    chapter_refs: list[str],
) -> None:
    """Normalize one trusted template field and verify repeated explicit keys."""
    field = field if isinstance(field, dict) else {"label": str(field)}
    label = str(
        field.get("label") or field.get("name") or field.get("key") or ""
    ).strip()
    if not label:
        raise HTTPException(422, "Template requirement has no label")
    explicit_key = field.get("semantic_key") or field.get("key")
    slug = re.sub(r"[^a-z0-9_-]+", "_", label.casefold()).strip("_")[:100] or "field"
    # Fallback keys remain deterministic without putting database UUIDs in
    # semantic keys that are sent to model prompts.
    template_scope = fingerprint(str(template.id))[:12]
    key_scope = re.sub(r"[^A-Za-z0-9_.:-]+", "_", scope)
    if key_scope != scope:
        key_scope = f"{key_scope[:64]}_{fingerprint(scope)[:8]}"
    key = str(
        explicit_key
        or f"template_{template_scope}.{key_scope}.{slug}_{fingerprint(label)[:8]}"
    )
    if len(key) > 255 or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:-]*", key):
        raise HTTPException(422, "Template point key is invalid")
    answer_type = field.get("answer_type", "text")
    if answer_type not in {"text", "number", "date", "choice", "multiline"}:
        raise HTTPException(422, "Unsupported template answer type")
    for name in ("required", "allow_assumption", "allow_not_applicable"):
        if name in field and not isinstance(field[name], bool):
            raise HTTPException(422, f"Template {name} must be a boolean")
    choices = field.get("choices", field.get("options", []))
    if isinstance(choices, list):
        choices = [
            (
                choice.get("value", choice.get("label"))
                if isinstance(choice, dict)
                else choice
            )
            for choice in choices
        ]
    if not isinstance(choices, list) or any(
        not isinstance(choice, str) or not choice.strip() for choice in choices
    ):
        raise HTTPException(422, "Template choices must be nonempty strings")
    if answer_type == "choice" and not choices:
        raise HTTPException(422, "A choice point requires declared choices")
    for name in ("minimum", "maximum"):
        bound = field.get(name)
        if bound is not None and (
            isinstance(bound, bool)
            or not isinstance(bound, (int, float))
            or not math.isfinite(bound)
        ):
            raise HTTPException(422, f"Template {name} must be a finite number")
    definition = {
        "key": key,
        "label": label,
        "description": str(field.get("description") or label),
        "kind": field.get("kind", "fact"),
        "answer_type": answer_type,
        "required": bool(field.get("required", True)),
        "allow_assumption": bool(field.get("allow_assumption", False)),
        "allow_not_applicable": bool(field.get("allow_not_applicable", False)),
        "choices": choices,
        "minimum": field.get("minimum"),
        "maximum": field.get("maximum"),
        "unit": field.get("unit"),
        "chapter_refs": chapter_refs,
        "evidence_need": field.get("evidence_need"),
    }
    for attribute in ("city_field", "usual_document"):
        if field.get(attribute):
            definition[attribute] = field[attribute]
    if definition["kind"] not in {"fact", "decision"}:
        raise HTTPException(422, "Unsupported template point kind")
    existing = definitions.get(key)
    if existing:
        # Sharing a key requires identical value and exception policies.
        policy_fields = (
            "answer_type",
            "choices",
            "minimum",
            "maximum",
            "unit",
            "allow_assumption",
            "allow_not_applicable",
        )
        if any(existing[name] != definition[name] for name in policy_fields):
            raise HTTPException(422, f"Incompatible shared point definition: {key}")
        existing["required"] = existing["required"] or definition["required"]
        existing["chapter_refs"] = sorted(set(existing["chapter_refs"] + chapter_refs))
    else:
        definitions[key] = definition


def validate_value(
    definition: dict[str, Any], value: Any, *, human_decision: bool = False
) -> Any:
    """Accept the declared scalar schema with no string-to-number coercion."""
    answer_type = definition["answer_type"]
    if answer_type == "number":
        if (
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not math.isfinite(value)
        ):
            raise HTTPException(422, "Answer must be a finite number")
        for bound, operation in (("minimum", "below"), ("maximum", "above")):
            limit = definition.get(bound)
            if limit is not None and (
                (bound == "minimum" and value < limit)
                or (bound == "maximum" and value > limit)
            ):
                raise HTTPException(422, f"Answer is {operation} the allowed {bound}")
        return value
    if not isinstance(value, str) or not value.strip() or len(value) > 20000:
        raise HTTPException(
            422, "Answer must be nonempty text of at most 20000 characters"
        )
    if answer_type == "date":
        try:
            if date.fromisoformat(value).isoformat() != value:
                raise ValueError("Use ISO date")
        except ValueError as exc:
            raise HTTPException(422, "Answer must be an ISO date (YYYY-MM-DD)") from exc
    if (
        answer_type == "choice"
        and value not in definition.get("choices", [])
        and not (human_decision and definition.get("kind") == "decision")
    ):
        raise HTTPException(422, "Answer is not an allowed choice")
    return value
