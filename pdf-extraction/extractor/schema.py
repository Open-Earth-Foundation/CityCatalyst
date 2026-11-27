"""Validate user JSON Schemas without fetching external references."""

import json
from typing import Any

from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError
from referencing import Registry
from referencing.exceptions import NoSuchResource

MAX_SCHEMA_BYTES = 256 * 1024


def deny_remote_reference(uri: str):
    """Prevent JSON Schema validation from opening arbitrary external URLs."""
    raise NoSuchResource(ref=uri)


def parse_schema(raw: str) -> dict:
    """Accept a bounded object JSON Schema with local references only."""
    if len(raw.encode("utf-8")) > MAX_SCHEMA_BYTES:
        raise ValueError("JSON Schema must be 256 KiB or smaller.")
    try:
        schema = json.loads(raw)
    except (ValueError, RecursionError) as exc:
        raise ValueError("Provide a valid JSON Schema object.") from exc
    if not isinstance(schema, dict) or schema.get("type") != "object":
        raise ValueError('JSON Schema must have a root "type": "object".')
    pending = [schema]
    while pending:
        node = pending.pop()
        if isinstance(node, dict):
            for key, value in node.items():
                if key in {"$ref", "$dynamicRef"} and (
                    not isinstance(value, str) or not value.startswith("#")
                ):
                    raise ValueError(
                        "Only local JSON Schema references beginning with # are supported."
                    )
                pending.append(value)
        elif isinstance(node, list):
            pending.extend(node)
    try:
        Draft202012Validator.check_schema(schema)
    except (SchemaError, RecursionError) as exc:
        raise ValueError(
            "The supplied JSON Schema is not valid Draft 2020-12."
        ) from exc
    return schema


def schema_errors(data: Any, schema: dict) -> list[str]:
    """Return concise data-contract errors while keeping partial results visible."""
    validator = Draft202012Validator(
        schema, registry=Registry(retrieve=deny_remote_reference)
    )
    errors = []
    try:
        for error in validator.iter_errors(data):
            path = "/" + "/".join(str(part) for part in error.absolute_path)
            errors.append(f"{path}: {error.message}")
            if len(errors) == 100:
                break
    except Exception as exc:
        # An invalid local pointer must remain a schema-validation failure.
        raise ValueError(
            "Could not resolve the supplied JSON Schema references."
        ) from exc
    return errors


def leaf_paths(data: Any, pointer: str = "", include_null: bool = False) -> list[str]:
    """Find data leaves using JSON Pointers, including explicit empty containers."""
    if isinstance(data, dict):
        if not data:
            return [pointer] if pointer else []
        return [
            path
            for key, value in data.items()
            for path in leaf_paths(
                value,
                pointer + "/" + key.replace("~", "~0").replace("/", "~1"),
                include_null,
            )
        ]
    if isinstance(data, list):
        if not data:
            return [pointer]
        return [
            path
            for index, value in enumerate(data)
            for path in leaf_paths(value, f"{pointer}/{index}", include_null)
        ]
    return [pointer] if data is not None or include_null else []
