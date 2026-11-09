"""Normalize catalogue/template fields and retain their native provenance values."""

from __future__ import annotations

from collections.abc import Sequence
from decimal import Decimal
from typing import Any

from app.models.cnb.funder_creation import (
    ExtractedFact,
    FunderCreateRequest,
    FunderImportDraft,
    TemplateChapterFields,
    TemplateFields,
)
from app.services.cnb.source_analysis import markdown_heading_slug
from pydantic import BaseModel

OPPORTUNITY_FIELDS = (
    "applicant_type",
    "category",
    "sector",
    "hazards",
    "interventions",
    "finance_route",
    "instrument_type",
    "region_scope",
    "min_award",
    "max_award",
    "currency",
    "status",
    "summary",
)
# Catalogue columns a draft reports as ``missing`` when the document is silent.
CATALOGUE_PATHS = (
    "funder.name",
    "funder.funder_type",
    "funder.country",
    "funder.region",
    "opportunity.name",
    *(f"opportunity.{name}" for name in OPPORTUNITY_FIELDS),
    "template.template_name",
    "template.output_format",
    "template.chapter_schema",
)
# The subset a template-only import reports as ``missing``.
TEMPLATE_PATHS = tuple(path for path in CATALOGUE_PATHS if path.startswith("template."))


def normalize_chapters(
    chapters: Sequence[TemplateChapterFields],
) -> list[TemplateChapterFields]:
    """Give every chapter a unique slug ref and clean required-field names."""
    normalized: list[TemplateChapterFields] = []
    seen: set[str] = set()
    for index, chapter in enumerate(chapters, start=1):
        base = markdown_heading_slug(chapter.chapter_ref or chapter.title)
        if base == "section":
            base = f"chapter-{index}"
        ref, suffix = base, 2
        while ref in seen:
            ref, suffix = f"{base}-{suffix}", suffix + 1
        seen.add(ref)
        normalized.append(
            chapter.model_copy(
                update={
                    "chapter_ref": ref,
                    "title": chapter.title.strip(),
                    "required_fields": clean_list(chapter.required_fields),
                }
            )
        )
    return normalized


def template_required_fields(template: TemplateFields) -> list[str]:
    """Build the template inventory from chapter fields so each has an owner."""
    return list(
        dict.fromkeys(
            field for chapter in template.chapter_schema for field in chapter.required_fields
        )
    )


def field_values(record: FunderImportDraft | FunderCreateRequest) -> dict[str, Any]:
    """Index catalogue fields, profile facts and chapters without coercing values."""
    values: dict[str, Any] = {}
    for path in CATALOGUE_PATHS:
        entity, _, field = path.partition(".")
        values[path] = getattr(getattr(record, entity), field)
    profile = record.funder.profile
    for group, facts in (("stated", profile.stated), ("derived", profile.derived)):
        for key, value in facts.items():
            values[f"funder.profile.{group}.{key}"] = value
    for chapter in record.template.chapter_schema:
        values.setdefault(f"template.chapter_schema.{chapter.chapter_ref}", chapter)
    return values


def json_value(value: Any) -> Any:
    """Return a JSON-comparable form of one field value."""
    if isinstance(value, TemplateChapterFields):
        return value.model_dump(mode="json")
    if isinstance(value, Decimal):
        return str(value)
    return value


def has_value(value: Any) -> bool:
    """Distinguish absent fields from valid zero amounts."""
    return value not in (None, "", [], {})


def optional_text(value: str | None) -> str | None:
    """Strip text and treat blanks as missing."""
    return (value or "").strip() or None


def squash_text(text: str) -> str:
    """Collapse whitespace so quotes match across line breaks."""
    return " ".join(text.split())


def cleaned_fields(model: BaseModel, *, exclude: set[str] | None = None) -> dict[str, Any]:
    """Field values with text stripped (blank as None) and lists de-duplicated."""
    values = model.model_dump(exclude=exclude)
    for key, value in values.items():
        if isinstance(value, str):
            values[key] = optional_text(value)
        elif isinstance(value, list):
            values[key] = clean_list(value)
    return values


def clean_list(values: Sequence[str]) -> list[str]:
    """Strip, drop blanks and keep the first copy of each value."""
    return list(dict.fromkeys(stripped for value in values if (stripped := value.strip())))


def profile_facts(facts: Sequence[ExtractedFact]) -> dict[str, str]:
    """Turn model key/value facts into a map, keeping the first of duplicates."""
    result: dict[str, str] = {}
    for fact in facts:
        key, value = fact.key.strip(), fact.value.strip()
        if key and value and key not in result:
            result[key] = value
    return result


def award_amount(value: float | None) -> Decimal | None:
    """Convert a model number to a non-negative two-decimal amount."""
    if value is None or value < 0:
        return None
    return Decimal(str(round(value, 2)))
