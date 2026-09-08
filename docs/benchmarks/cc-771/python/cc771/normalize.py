"""Normalize raw Mistral OCR responses into cc-771.1 structured documents."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .relationships import nearest_caption_same_page
from .sanitize import sha256_base64_payload


PROVIDER_TO_CC = {
    "title": "title",
    "heading": "heading",
    "header": "header",
    "footer": "footer",
    "text": "text",
    "paragraph": "text",
    "list": "list",
    "table": "table",
    "image": "image",
    "figure": "image",
    "caption": "caption",
}


CAPTION_HINT = re.compile(
    r"^\s*(figure|fig\.|table|tbl\.)\s*\d+",
    re.IGNORECASE,
)


def map_cc_type(provider_type: str | None, content: str) -> str:
    if provider_type:
        mapped = PROVIDER_TO_CC.get(provider_type.lower())
        if mapped:
            return mapped
    if CAPTION_HINT.match(content or ""):
        return "caption"
    return "other"


def _clamp01(value: float) -> float:
    if value < 0:
        return 0.0
    if value > 1:
        return 1.0
    return value


def normalize_bbox(
    top_left_x: float,
    top_left_y: float,
    bottom_right_x: float,
    bottom_right_y: float,
    width: float | None,
    height: float | None,
) -> tuple[dict[str, float], dict[str, float] | None, list[str]]:
    bbox_px = {
        "top_left_x": float(top_left_x),
        "top_left_y": float(top_left_y),
        "bottom_right_x": float(bottom_right_x),
        "bottom_right_y": float(bottom_right_y),
    }
    warnings: list[str] = []
    if not width or not height or width <= 0 or height <= 0:
        warnings.append("missing_page_dimensions_for_normalization")
        return bbox_px, None, warnings

    raw_norm = {
        "x0": bbox_px["top_left_x"] / width,
        "y0": bbox_px["top_left_y"] / height,
        "x1": bbox_px["bottom_right_x"] / width,
        "y1": bbox_px["bottom_right_y"] / height,
    }
    # Policy: clamp out-of-bounds provider pixels into 0..1 and warn.
    # Invalid ordering (x1<x0 / y1<y0) remains a hard failure upstream.
    bbox_norm = {
        "x0": _clamp01(raw_norm["x0"]),
        "y0": _clamp01(raw_norm["y0"]),
        "x1": _clamp01(raw_norm["x1"]),
        "y1": _clamp01(raw_norm["y1"]),
    }
    if any(
        raw_norm[key] < 0 or raw_norm[key] > 1 for key in ("x0", "y0", "x1", "y1")
    ):
        warnings.append("clamped_out_of_bounds_normalized_coordinates")
    if bbox_norm["x1"] < bbox_norm["x0"] or bbox_norm["y1"] < bbox_norm["y0"]:
        warnings.append("invalid_bbox_ordering")
    return bbox_px, bbox_norm, warnings


def _confidence_value(raw: Any) -> float | None:
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    if isinstance(raw, dict):
        for key in ("ocr", "score", "value", "block"):
            if key in raw and isinstance(raw[key], (int, float)):
                return float(raw[key])
    return None


def _parse_annotation(raw: Any) -> tuple[dict[str, Any] | None, str | None]:
    if raw is None:
        return None, None
    if isinstance(raw, dict):
        annotation = dict(raw)
        annotation.setdefault("schema_version", "cc-771.visual.1")
        return annotation, None
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            return None, f"annotation_json_parse_error: {exc}"
        if isinstance(parsed, dict):
            parsed.setdefault("schema_version", "cc-771.visual.1")
            return parsed, None
        return None, "annotation_json_not_object"
    return None, f"unsupported_annotation_type:{type(raw).__name__}"


def normalize_mistral_response(
    raw: dict[str, Any],
    *,
    run_id: str,
    source_filename: str,
    source_sha256: str,
    requested_model: str,
    created_at: str | None = None,
) -> dict[str, Any]:
    warnings: list[str] = []
    missing_fields: list[str] = []
    unsupported: list[str] = []

    pages_raw = raw.get("pages")
    if not isinstance(pages_raw, list) or len(pages_raw) == 0:
        raise ValueError("Invalid or empty page arrays")

    pages_sorted = sorted(pages_raw, key=lambda p: int(p.get("index", -1)))
    indexes = [int(p.get("index")) for p in pages_sorted]
    if len(indexes) != len(set(indexes)):
        raise ValueError(f"Page indexes must be unique; got {indexes}")
    if indexes != list(range(len(indexes))):
        # Some providers use 1-based indexes in docs examples; accept contiguous remap.
        if indexes == list(range(1, len(indexes) + 1)):
            for page in pages_sorted:
                page["index"] = int(page["index"]) - 1
            indexes = [int(p["index"]) for p in pages_sorted]
        elif indexes == sorted(indexes) and indexes[0] >= 0:
            # Page-filtered OCR runs keep the original PDF page indexes (e.g. 5,6,7,9).
            # Preserve them for attribution; warn instead of failing.
            warnings.append(
                "sparse_page_indexes_preserved:" + ",".join(str(i) for i in indexes)
            )
        else:
            raise ValueError(
                f"Page indexes must be unique and sorted non-negative; got {indexes}"
            )

    pages_out: list[dict[str, Any]] = []
    relationships: list[dict[str, Any]] = []

    for page in pages_sorted:
        page_index = int(page["index"])
        dims = page.get("dimensions") or {}
        width = dims.get("width")
        height = dims.get("height")
        dpi = dims.get("dpi")

        blocks_out: list[dict[str, Any]] = []
        provider_blocks = page.get("blocks")
        if provider_blocks is None:
            missing_fields.append(f"pages[{page_index}].blocks")
            provider_blocks = []
        elif not isinstance(provider_blocks, list):
            raise ValueError(f"pages[{page_index}].blocks must be an array")

        for reading_order_index, block in enumerate(provider_blocks):
            content = block.get("content") or ""
            provider_type = block.get("type")
            cc_type = map_cc_type(provider_type, content)
            bbox_px, bbox_norm, bbox_warnings = normalize_bbox(
                block.get("top_left_x", 0),
                block.get("top_left_y", 0),
                block.get("bottom_right_x", 0),
                block.get("bottom_right_y", 0),
                float(width) if width is not None else None,
                float(height) if height is not None else None,
            )
            for warning in bbox_warnings:
                warnings.append(f"page {page_index} block {reading_order_index}: {warning}")
            if bbox_norm is None:
                raise ValueError(
                    f"Invalid coordinates on page {page_index} block {reading_order_index}"
                )

            confidence = _confidence_value(block.get("confidence_scores"))
            if confidence is None and "confidence_scores" in block:
                warnings.append(
                    f"page {page_index} block {reading_order_index}: missing optional confidence"
                )
            elif "confidence_scores" not in block:
                warnings.append(
                    f"page {page_index} block {reading_order_index}: confidence field absent"
                )

            related_image_id = None
            if cc_type == "image":
                match = re.search(r"!\[[^\]]*\]\(([^)]+)\)", content)
                if match:
                    related_image_id = match.group(1)

            block_id = f"p{page_index}-b{reading_order_index}"
            blocks_out.append(
                {
                    "block_id": block_id,
                    "page_index": page_index,
                    "reading_order_index": reading_order_index,
                    "provider_type": provider_type,
                    "cc_type": cc_type,
                    "content": content,
                    "bbox_px": bbox_px,
                    "bbox_norm": bbox_norm,
                    "confidence": confidence,
                    "related_image_id": related_image_id,
                    "related_table_id": None,
                    "relationship_provenance": None,
                }
            )

        images_out: list[dict[str, Any]] = []
        for image in page.get("images") or []:
            image_id = image.get("id") or f"img-p{page_index}-{len(images_out)}"
            bbox_px, bbox_norm, bbox_warnings = normalize_bbox(
                image.get("top_left_x", 0),
                image.get("top_left_y", 0),
                image.get("bottom_right_x", 0),
                image.get("bottom_right_y", 0),
                float(width) if width is not None else None,
                float(height) if height is not None else None,
            )
            for warning in bbox_warnings:
                warnings.append(f"page {page_index} image {image_id}: {warning}")
            if bbox_norm is None:
                raise ValueError(f"Invalid image coordinates on page {page_index}")

            annotation, annotation_error = _parse_annotation(
                image.get("image_annotation")
            )
            image_hash = None
            if image.get("image_base64"):
                image_hash = sha256_base64_payload(image.get("image_base64"))
            elif image.get("image_sha256"):
                image_hash = image.get("image_sha256")

            images_out.append(
                {
                    "image_id": image_id,
                    "page_index": page_index,
                    "bbox_px": bbox_px,
                    "bbox_norm": bbox_norm,
                    "annotation": annotation,
                    "annotation_error": annotation_error,
                    "image_sha256": image_hash,
                }
            )

        tables_out: list[dict[str, Any]] = []
        for table_index, table in enumerate(page.get("tables") or []):
            table_id = table.get("id") or f"table-p{page_index}-{table_index}"
            if all(
                key in table
                for key in (
                    "top_left_x",
                    "top_left_y",
                    "bottom_right_x",
                    "bottom_right_y",
                )
            ):
                bbox_px, bbox_norm, _ = normalize_bbox(
                    table["top_left_x"],
                    table["top_left_y"],
                    table["bottom_right_x"],
                    table["bottom_right_y"],
                    float(width) if width is not None else None,
                    float(height) if height is not None else None,
                )
            else:
                bbox_px, bbox_norm = None, None
            tables_out.append(
                {
                    "table_id": table_id,
                    "page_index": page_index,
                    "content": table.get("markdown")
                    or table.get("content")
                    or table.get("html"),
                    "bbox_px": bbox_px,
                    "bbox_norm": bbox_norm,
                }
            )

        relationships.extend(
            nearest_caption_same_page(
                blocks_out,
                float(height) if height is not None else None,
                page_index,
            )
        )

        pages_out.append(
            {
                "page_index": page_index,
                "dimensions": {
                    "width": width,
                    "height": height,
                    "dpi": dpi,
                },
                "header": page.get("header"),
                "footer": page.get("footer"),
                "markdown": page.get("markdown") or "",
                "blocks": blocks_out,
                "tables": tables_out,
                "images": images_out,
            }
        )

    # Resolve image/table refs on blocks after collection.
    image_ids = {
        image["image_id"]
        for page in pages_out
        for image in page["images"]
    }
    for page in pages_out:
        for block in page["blocks"]:
            if block["related_image_id"] and block["related_image_id"] not in image_ids:
                warnings.append(
                    f"unresolved image ref {block['related_image_id']} on {block['block_id']}"
                )

    document = {
        "schema_version": "cc-771.1",
        "document": {
            "source_filename": source_filename,
            "source_sha256": source_sha256,
            "requested_model": requested_model,
            "returned_model": raw.get("model"),
            "page_count": len(pages_out),
            "run_id": run_id,
            "created_at": created_at
            or datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        },
        "pages": pages_out,
        "relationships": relationships,
        "validation": {
            "schema_valid": False,
            "warnings": warnings,
            "missing_fields": missing_fields,
            "unsupported_provider_features": unsupported,
        },
    }
    return document


def load_schema(schema_path: Path) -> dict[str, Any]:
    return json.loads(schema_path.read_text(encoding="utf-8"))


def validate_structured_document(
    document: dict[str, Any], schema: dict[str, Any]
) -> tuple[bool, list[str]]:
    from jsonschema import Draft202012Validator

    validator = Draft202012Validator(schema)
    errors = sorted(validator.iter_errors(document), key=lambda e: list(e.path))
    messages = [
        f"{'/'.join(str(p) for p in err.path) or '<root>'}: {err.message}"
        for err in errors
    ]
    return len(messages) == 0, messages
