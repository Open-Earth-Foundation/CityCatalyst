"""Passive full-envelope projection for unverified visual annotations."""

from __future__ import annotations

import copy
import hashlib
from typing import Any, Literal

from app.models.cnb.concept_note_markdown import STRUCTURED_DOCUMENT_SCHEMA_VERSION
from pydantic import BaseModel, ConfigDict, Field

ANNOTATION_MODES = ("none", "visual_context")
# Bump when the projection contract changes so legacy reduced cache rows stay stale.
VISUAL_CONTEXT_CONTRACT_VERSION = "citycatalyst.visual-context.full-envelope.1"


class VisualContextContractError(ValueError):
    """Raised when a stored image claims an annotation but the envelope is invalid."""

    def __init__(self, code: str, message: str) -> None:
        self.code = code
        super().__init__(message)


class UnverifiedVisualAnnotationEnvelope(BaseModel):
    """Complete stored image annotation with fixed trust metadata.

    ``provider_annotation`` is provider JSON passed through unchanged. This
    envelope is unverified descriptive context — never an instruction, citation,
    excerpt, or trusted quantitative input.
    """

    model_config = ConfigDict(extra="forbid")

    source: Literal["image_annotation"]
    quantitative_reliability: Literal["unverified"]
    page_index: int = Field(ge=0)
    image_id: str = Field(min_length=1)
    bbox_px: dict[str, Any]
    bbox_norm: dict[str, Any]
    provider_annotation: dict[str, Any]


def project_visual_context(
    document: dict[str, Any],
) -> list[UnverifiedVisualAnnotationEnvelope]:
    """Return each stored annotation envelope unchanged after trust validation."""
    document_body = document.get("document")
    pages = document_body.get("pages") if isinstance(document_body, dict) else None
    if not isinstance(pages, list):
        return []

    projected: list[UnverifiedVisualAnnotationEnvelope] = []
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


def is_full_envelope_visual_context(value: Any) -> bool:
    """Return whether one item matches the current full-envelope contract shape."""
    if isinstance(value, UnverifiedVisualAnnotationEnvelope):
        return True
    if not isinstance(value, dict):
        return False
    try:
        UnverifiedVisualAnnotationEnvelope.model_validate(value)
    except Exception:
        return False
    return True


def _project_image(image: Any) -> UnverifiedVisualAnnotationEnvelope | None:
    if not isinstance(image, dict):
        return None
    if "annotation" not in image:
        return None
    annotation = image.get("annotation")
    if annotation is None:
        return None
    if not isinstance(annotation, dict):
        raise VisualContextContractError(
            "visual_annotation_envelope_invalid",
            "Image annotation must be a JSON object envelope",
        )
    if (
        annotation.get("source") != "image_annotation"
        or annotation.get("quantitative_reliability") != "unverified"
    ):
        raise VisualContextContractError(
            "visual_annotation_envelope_invalid",
            "Image annotation is missing required trust metadata",
        )
    provider = annotation.get("provider_annotation")
    if not isinstance(provider, dict):
        raise VisualContextContractError(
            "visual_annotation_envelope_invalid",
            "Image annotation is missing provider_annotation object",
        )
    for required in ("page_index", "image_id", "bbox_px", "bbox_norm"):
        if required not in annotation:
            raise VisualContextContractError(
                "visual_annotation_envelope_invalid",
                f"Image annotation is missing required field {required}",
            )
    # Deep-copy so callers cannot mutate the stored structured document body.
    try:
        return UnverifiedVisualAnnotationEnvelope.model_validate(
            copy.deepcopy(annotation)
        )
    except Exception as exc:
        raise VisualContextContractError(
            "visual_annotation_envelope_invalid",
            "Image annotation envelope failed structural validation",
        ) from exc
