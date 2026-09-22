"""Qualitative projection keeps annotation numbers out of model context."""

import hashlib

from app.services.cnb.visual_context import (
    _clean_text,
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


def test_projection_drops_spelled_quantities_on_every_string_field() -> None:
    """Words, ratios, percentages, and units are exact quantities too."""
    projected = project_visual_context(
        {
            "document": {
                "pages": [
                    {
                        "images": [
                            {
                                "annotation": {
                                    "source": "image_annotation",
                                    "quantitative_reliability": "unverified",
                                    "provider_annotation": {
                                        "kind": "chart",
                                        "title": "Waste drops by one hundred tonnes",
                                        "short_description": (
                                            "Emissions fall by fifty percent"
                                        ),
                                        "chart": {
                                            "chart_type": "line by fifty percent",
                                            "legend": [
                                                "Transport",
                                                "one half of waste",
                                            ],
                                            "trends": [
                                                "Transport declines",
                                                "Waste drops by one hundred tonnes",
                                            ],
                                        },
                                    },
                                }
                            }
                        ]
                    }
                ]
            }
        }
    )

    assert len(projected) == 1
    dumped = projected[0].model_dump_json()
    assert projected[0].chart_type is None
    assert projected[0].title is None
    assert projected[0].meaning is None
    assert projected[0].trend_directions == ["Transport declines"]
    assert projected[0].relative_relationships == ["Transport"]
    for leaked in ("fifty", "percent", "hundred", "tonnes", "half"):
        assert leaked not in dumped


def test_projection_drops_unicode_number_symbols_on_every_string_field() -> None:
    """Omitted Unicode number symbols are exact quantities, including ⅞."""
    projected = project_visual_context(
        {
            "document": {
                "pages": [
                    {
                        "images": [
                            {
                                "annotation": {
                                    "source": "image_annotation",
                                    "quantitative_reliability": "unverified",
                                    "provider_annotation": {
                                        "kind": "chart",
                                        "title": "Emissions fall by ⅞",
                                        "short_description": "Waste drops by Ⅳ",
                                        "chart": {
                                            "chart_type": "line ①",
                                            "legend": ["Transport", "Share is ⅛"],
                                            "trends": [
                                                "Transport declines",
                                                "Falls by ²",
                                                "Drops by 十",
                                            ],
                                        },
                                    },
                                }
                            }
                        ]
                    }
                ]
            }
        }
    )

    assert len(projected) == 1
    dumped = projected[0].model_dump_json()
    assert projected[0].chart_type is None
    assert projected[0].title is None
    assert projected[0].meaning is None
    assert projected[0].trend_directions == ["Transport declines"]
    assert projected[0].relative_relationships == ["Transport"]
    for leaked in ("⅞", "Ⅳ", "①", "⅛", "²", "十"):
        assert leaked not in dumped


def test_clean_text_rejects_ordinal_fractions_and_numerical_nouns() -> None:
    """Exact quantities in ordinary words stay out of the qualitative contract."""
    assert _clean_text("Waste falls by a fifth") is None
    assert _clean_text("A pair of sectors decline") is None
    assert _clean_text("Waste drops by a score") is None
    assert _clean_text("Transport declines") == "Transport declines"


def test_projection_drops_ordinal_fractions_and_numerical_nouns() -> None:
    """Ordinal fractions and numerical nouns cannot reach any exposed field."""
    projected = project_visual_context(
        {
            "document": {
                "pages": [
                    {
                        "images": [
                            {
                                "annotation": {
                                    "source": "image_annotation",
                                    "quantitative_reliability": "unverified",
                                    "provider_annotation": {
                                        "kind": "chart",
                                        "title": "Waste drops by a score",
                                        "short_description": "Waste falls by a fifth",
                                        "chart": {
                                            "chart_type": "a pair",
                                            "legend": [
                                                "Transport",
                                                "A pair of sectors decline",
                                            ],
                                            "trends": [
                                                "Transport declines",
                                                "A pair of sectors decline",
                                            ],
                                        },
                                    },
                                }
                            }
                        ]
                    }
                ]
            }
        }
    )

    assert len(projected) == 1
    dumped = projected[0].model_dump_json()
    assert projected[0].chart_type is None
    assert projected[0].title is None
    assert projected[0].meaning is None
    assert projected[0].trend_directions == ["Transport declines"]
    assert projected[0].relative_relationships == ["Transport"]
    for leaked in ("fifth", "pair", "score"):
        assert leaked not in dumped


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
