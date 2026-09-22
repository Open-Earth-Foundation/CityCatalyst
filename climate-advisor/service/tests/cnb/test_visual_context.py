"""Qualitative projection keeps annotation numbers out of model context."""

import hashlib

from app.services.cnb.visual_context import (
    project_visual_context,
    validate_structured_delivery,
)


def test_projection_drops_numeric_annotation_content() -> None:
    """Chart values and numeric strings never reach the qualitative contract."""
    projected = project_visual_context(
        {
            "schema_version": "citycatalyst.structured-document.1",
            "annotation_mode": "visual_context",
            "document": {
                "page_count": 1,
                "pages": [
                    {
                        "images": [
                            {
                                "annotation": {
                                    "source": "image_annotation",
                                    "quantitative_reliability": "unverified",
                                    "provider_annotation": {
                                        "kind": "chart",
                                        "title": "Emissions 2024",
                                        "short_description": "Sectors move in different directions.",
                                        "chart": {
                                            "chart_type": "line",
                                            "legend": ["Transport", "35 kt"],
                                            "trends": [
                                                "Transport declines",
                                                "Falls below 35 kt",
                                            ],
                                            "series": [{"name": "Transport", "points": []}],
                                            "readable_values": [
                                                {
                                                    "label": "Fuel",
                                                    "value": 12.5,
                                                    "value_kind": "printed",
                                                }
                                            ],
                                        },
                                    },
                                }
                            }
                        ]
                    }
                ],
            },
        }
    )

    assert len(projected) == 1
    dumped = projected[0].model_dump_json()
    assert projected[0].source == "image_annotation"
    assert projected[0].quantitative_reliability == "unverified"
    assert projected[0].title is None
    assert projected[0].meaning == "Sectors move in different directions."
    assert projected[0].trend_directions == ["Transport declines"]
    assert projected[0].relative_relationships == ["Transport"]
    assert "12.5" not in dumped
    assert "2024" not in dumped
    assert "35" not in dumped
    assert "printed" not in dumped


def test_structured_delivery_rejects_a_digest_mismatch() -> None:
    """A pointer digest must match the fetched structured bytes."""
    raw = b'{"schema_version":"citycatalyst.structured-document.1"}'
    code = validate_structured_delivery(
        body={
            "schema_version": "citycatalyst.structured-document.1",
            "annotation_mode": "visual_context",
            "document": {"page_count": 1},
        },
        raw_bytes=raw,
        content_type="application/json; charset=utf-8",
        s3_key="document.structured.json",
        sha256="a" * 64,
        schema_version="citycatalyst.structured-document.1",
        annotation_mode="visual_context",
        page_count=1,
        upload_id="upload-id",
        header_s3_key="document.structured.json",
        header_sha256="a" * 64,
        header_schema_version="citycatalyst.structured-document.1",
        header_annotation_mode="visual_context",
        header_page_count="1",
        header_upload_id="upload-id",
    )

    assert code == "structured_digest_mismatch"
    assert hashlib.sha256(raw).hexdigest() != "a" * 64
