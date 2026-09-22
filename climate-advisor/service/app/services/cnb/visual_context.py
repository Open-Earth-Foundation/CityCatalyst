"""Deterministic qualitative projection for unverified visual annotations."""

from __future__ import annotations

import hashlib
import re
from typing import Any, Literal

from app.models.cnb.concept_note_markdown import STRUCTURED_DOCUMENT_SCHEMA_VERSION
from pydantic import BaseModel, ConfigDict, Field

ANNOTATION_MODES = ("none", "visual_context")
_DIGIT = re.compile(r"\d")
_KINDS = {
    "chart",
    "diagram",
    "map",
    "photo",
    "logo",
    "illustration",
    "other",
}


class QualitativeVisualContext(BaseModel):
    """Chart meaning that cannot be used as a number, excerpt, or citation."""

    model_config = ConfigDict(extra="forbid")

    source: Literal["image_annotation"]
    quantitative_reliability: Literal["unverified"]
    kind: Literal[
        "chart",
        "diagram",
        "map",
        "photo",
        "logo",
        "illustration",
        "other",
    ]
    chart_type: str | None = None
    title: str | None = None
    meaning: str | None = None
    trend_directions: list[str] = Field(default_factory=list)
    relative_relationships: list[str] = Field(default_factory=list)


def project_visual_context(document: dict[str, Any]) -> list[QualitativeVisualContext]:
    """Remove quantitative annotation content before any model or tool sees it."""
    document_body = document.get("document")
    pages = document_body.get("pages") if isinstance(document_body, dict) else None
    if not isinstance(pages, list):
        return []

    projected: list[QualitativeVisualContext] = []
    for page in pages:
        if not isinstance(page, dict):
            continue
        images = page.get("images")
        if not isinstance(images, list):
            continue
        for image in images:
            item = _project_image(image)
            if item is not None:
                projected.append(item)
    return projected


def validate_structured_delivery(
    *,
    body: dict[str, Any],
    raw_bytes: bytes,
    content_type: str | None,
    s3_key: str,
    sha256: str,
    schema_version: str,
    annotation_mode: str,
    page_count: int,
    upload_id: str,
    header_s3_key: str | None,
    header_sha256: str | None,
    header_schema_version: str | None,
    header_annotation_mode: str | None,
    header_page_count: str | None,
    header_upload_id: str | None,
) -> str | None:
    """Return a stable error code when a structured artifact disagrees with its pointer."""
    media_type = (content_type or "").split(";", 1)[0].strip().lower()
    if media_type != "application/json":
        return "structured_content_type_invalid"
    if (
        header_s3_key != s3_key
        or header_sha256 != sha256
        or header_schema_version != schema_version
        or header_annotation_mode != annotation_mode
        or header_upload_id != upload_id
    ):
        return "structured_identity_conflict"
    try:
        declared_pages = int(header_page_count or "")
    except ValueError:
        return "structured_identity_conflict"
    if declared_pages != page_count:
        return "structured_identity_conflict"
    if hashlib.sha256(raw_bytes).hexdigest() != sha256:
        return "structured_digest_mismatch"
    if (
        schema_version != STRUCTURED_DOCUMENT_SCHEMA_VERSION
        or body.get("schema_version") != schema_version
        or body.get("annotation_mode") not in ANNOTATION_MODES
        or body.get("annotation_mode") != annotation_mode
    ):
        return "structured_schema_mismatch"
    document = body.get("document")
    if not isinstance(document, dict) or document.get("page_count") != page_count:
        return "structured_page_count_mismatch"
    return None


def _project_image(image: Any) -> QualitativeVisualContext | None:
    if not isinstance(image, dict):
        return None
    annotation = image.get("annotation")
    if not isinstance(annotation, dict):
        return None
    if (
        annotation.get("source") != "image_annotation"
        or annotation.get("quantitative_reliability") != "unverified"
    ):
        return None
    provider = annotation.get("provider_annotation")
    if not isinstance(provider, dict) or provider.get("kind") not in _KINDS:
        return None
    chart = provider.get("chart") if isinstance(provider.get("chart"), dict) else {}
    return QualitativeVisualContext(
        source="image_annotation",
        quantitative_reliability="unverified",
        kind=provider["kind"],
        chart_type=_clean_text(chart.get("chart_type")),
        title=_clean_text(provider.get("title")),
        meaning=_clean_text(provider.get("short_description")),
        trend_directions=_clean_list(chart.get("trends")),
        relative_relationships=_clean_list(chart.get("legend")),
    )


def _clean_text(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text or _DIGIT.search(text):
        return None
    return text


def _clean_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    cleaned = [_clean_text(item) for item in value]
    return [item for item in cleaned if item is not None]
