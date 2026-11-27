"""Versioned document setup files and the adapter for existing chapter consumers."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any
from uuid import NAMESPACE_URL, UUID, uuid5

from app.models.cnb.concept_note_application_context import ApplicationContextTemplate


@lru_cache(maxsize=1)
def setup_catalogue() -> dict[str, dict[str, Any]]:
    """Validate configured keys and categories once when the process loads them."""
    records = {}
    for path in sorted(Path(__file__).with_name("setups").glob("*.json")):
        setup = json.loads(path.read_text(encoding="utf-8"))
        categories = {item["key"] for item in setup["file_categories"]}
        field_keys = [
            [point["key"] for point in chapter["required_fields"]]
            for chapter in setup["chapters"]
        ]
        if (
            path.stem != setup["document_type"]
            or setup["version"] < 1
            or any(len(keys) != len(set(keys)) for keys in field_keys)
            or "other" not in categories
            or any(
                point["category"] not in categories
                for chapter in setup["chapters"]
                for point in chapter["required_fields"]
            )
        ):
            raise ValueError(f"Invalid document setup: {path.name}")
        records[path.stem] = setup
    return records


def setup_template_id(document_type: str) -> UUID:
    """Return the stable identity shared by every version of a registered setup."""
    return uuid5(NAMESPACE_URL, "citycatalyst:document-setup:" + document_type)


def template_from_setup(setup: dict[str, Any]) -> ApplicationContextTemplate:
    """Translate a setup's semantic points to the Builder's compatible chapter shape."""
    categories = {item["key"]: item for item in setup["file_categories"]}
    chapters = []
    for chapter in setup["chapters"]:
        fields = []
        for point in chapter["required_fields"]:
            category = categories[point["category"]]
            need = {
                name: category[name] for name in ("key", "label", "guidance", "holder")
            }
            need["description"] = category["label"]
            fields.append(
                {
                    **point,
                    "usual_document": point.get("evidence_need", category["label"]),
                    "evidence_need": need,
                }
            )
        keys = {point["key"] for point in fields}
        rules = [
            rule
            for rule in setup.get("rules", [])
            if rule.get("left") in keys or rule.get("total") in keys
        ]
        section = {**chapter, "required_fields": fields}
        if rules:
            section["point_rules"] = rules
        chapters.append(section)
    return ApplicationContextTemplate(
        id=setup_template_id(setup["document_type"]),
        name=setup["name"],
        document_type=setup["document_type"],
        output_format="markdown",
        chapter_schema=chapters,
    )
