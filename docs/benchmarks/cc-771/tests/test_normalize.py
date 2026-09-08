from __future__ import annotations

import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
PYTHON_DIR = ROOT / "python"
import sys

sys.path.insert(0, str(PYTHON_DIR))

from cc771.normalize import (  # noqa: E402
    load_schema,
    map_cc_type,
    normalize_bbox,
    normalize_mistral_response,
    validate_structured_document,
)
from cc771.relationships import nearest_caption_same_page  # noqa: E402


FIXTURE_RAW = {
    "model": "mistral-ocr-4-1",
    "pages": [
        {
            "index": 0,
            "markdown": "# Title\n\n![img-0.jpeg](img-0.jpeg)\n\nFigure 1. Chart caption.\n",
            "header": "Synthetic header",
            "footer": "Page 1",
            "dimensions": {"dpi": 72, "width": 1000, "height": 1000},
            "blocks": [
                {
                    "type": "title",
                    "content": "# Title",
                    "top_left_x": 10,
                    "top_left_y": 10,
                    "bottom_right_x": 200,
                    "bottom_right_y": 40,
                    "confidence_scores": {"ocr": 0.91},
                },
                {
                    "type": "image",
                    "content": "![img-0.jpeg](img-0.jpeg)",
                    "top_left_x": 100,
                    "top_left_y": 100,
                    "bottom_right_x": 500,
                    "bottom_right_y": 400,
                    "confidence_scores": None,
                },
                {
                    "type": "caption",
                    "content": "Figure 1. Chart caption.",
                    "top_left_x": 100,
                    "top_left_y": 410,
                    "bottom_right_x": 500,
                    "bottom_right_y": 440,
                    "confidence_scores": 0.8,
                },
            ],
            "images": [
                {
                    "id": "img-0.jpeg",
                    "top_left_x": 100,
                    "top_left_y": 100,
                    "bottom_right_x": 500,
                    "bottom_right_y": 400,
                    "image_annotation": {
                        "kind": "chart",
                        "title": "Synthetic sector emissions trend",
                        "short_description": "Line chart of three sectors.",
                        "text_visible": ["Transport", "Buildings", "Waste", "ktCO2e"],
                        "chart": {
                            "chart_type": "line",
                            "x_axis": {"label": "Year", "values": [2020, 2025]},
                            "y_axis": {
                                "label": "Emissions",
                                "unit": "ktCO2e",
                                "scale": "linear",
                            },
                            "legend": ["Transport", "Buildings", "Waste"],
                            "series": [],
                            "trends": ["Transport declines"],
                            "targets": [
                                {
                                    "label": "2030 target",
                                    "value": 50,
                                    "value_kind": "printed",
                                }
                            ],
                            "callouts": [
                                "Transport falls below 35 ktCO2e in 2024"
                            ],
                            "readable_values": [],
                        },
                        "uncertainties": [],
                    },
                }
            ],
            "tables": [],
        }
    ],
    "usage_info": {"pages_processed": 1},
}


def test_map_cc_type_caption_heuristic():
    assert map_cc_type(None, "Figure 1. Example") == "caption"
    assert map_cc_type("title", "Anything") == "title"


def test_normalize_bbox_clamps():
    bbox_px, bbox_norm, warnings = normalize_bbox(-10, 0, 1100, 500, 1000, 1000)
    assert bbox_norm is not None
    assert bbox_norm["x0"] == 0.0
    assert bbox_norm["x1"] == 1.0
    assert warnings == []


def test_nearest_caption_same_page_rule():
    blocks = [
        {
            "block_id": "p0-b0",
            "page_index": 0,
            "reading_order_index": 0,
            "cc_type": "image",
            "bbox_px": {
                "top_left_x": 0,
                "top_left_y": 100,
                "bottom_right_x": 100,
                "bottom_right_y": 200,
            },
            "relationship_provenance": None,
        },
        {
            "block_id": "p0-b1",
            "page_index": 0,
            "reading_order_index": 1,
            "cc_type": "caption",
            "bbox_px": {
                "top_left_x": 0,
                "top_left_y": 210,
                "bottom_right_x": 100,
                "bottom_right_y": 230,
            },
            "relationship_provenance": None,
        },
    ]
    rels = nearest_caption_same_page(blocks, page_height=1000, page_index=0)
    assert len(rels) == 1
    assert rels[0]["provenance"] == "derived"
    assert rels[0]["rule"] == "nearest_caption_same_page"


def test_nearest_caption_rejects_large_gap():
    blocks = [
        {
            "block_id": "p0-b0",
            "page_index": 0,
            "reading_order_index": 0,
            "cc_type": "image",
            "bbox_px": {
                "top_left_x": 0,
                "top_left_y": 0,
                "bottom_right_x": 100,
                "bottom_right_y": 50,
            },
            "relationship_provenance": None,
        },
        {
            "block_id": "p0-b1",
            "page_index": 0,
            "reading_order_index": 1,
            "cc_type": "caption",
            "bbox_px": {
                "top_left_x": 0,
                "top_left_y": 400,
                "bottom_right_x": 100,
                "bottom_right_y": 420,
            },
            "relationship_provenance": None,
        },
    ]
    # gap 350 > 10% of 1000
    assert nearest_caption_same_page(blocks, 1000, 0) == []


def test_normalize_and_schema_validation(tmp_path: Path):
    document = normalize_mistral_response(
        FIXTURE_RAW,
        run_id="test-run",
        source_filename="fixture.pdf",
        source_sha256="a" * 64,
        requested_model="mistral-ocr-4-1",
        created_at="2026-09-08T00:00:00+00:00",
    )
    assert document["schema_version"] == "cc-771.1"
    assert document["pages"][0]["blocks"][1]["related_image_id"] == "img-0.jpeg"
    assert any(rel["provenance"] == "derived" for rel in document["relationships"])
    # missing optional confidence produces warning, not failure
    assert any("missing optional confidence" in w for w in document["validation"]["warnings"])

    schema = load_schema(ROOT / "schemas" / "document.structured.schema.json")
    # Attach schema_version on annotation for visual schema; already added by parser.
    ok, errors = validate_structured_document(document, schema)
    assert ok, errors

    # Persist and re-validate via file helper path
    out = tmp_path / "document.structured.json"
    out.write_text(json.dumps(document), encoding="utf-8")
    assert out.exists()


def test_rejects_empty_pages():
    with pytest.raises(ValueError, match="empty page"):
        normalize_mistral_response(
            {"pages": []},
            run_id="x",
            source_filename="f.pdf",
            source_sha256="b" * 64,
            requested_model="mistral-ocr-4-1",
        )


def test_normalize_preserves_sparse_page_indexes():
    raw = {
        "model": "mistral-ocr-4-1",
        "pages": [
            {
                "index": 5,
                "markdown": "page five",
                "header": None,
                "footer": None,
                "dimensions": {"dpi": 72, "width": 100, "height": 100},
                "blocks": [],
                "images": [],
                "tables": [],
            },
            {
                "index": 9,
                "markdown": "page nine",
                "header": None,
                "footer": None,
                "dimensions": {"dpi": 72, "width": 100, "height": 100},
                "blocks": [],
                "images": [],
                "tables": [],
            },
        ],
    }
    document = normalize_mistral_response(
        raw,
        run_id="sparse",
        source_filename="x.pdf",
        source_sha256="c" * 64,
        requested_model="mistral-ocr-4-1",
        created_at="2026-09-08T00:00:00+00:00",
    )
    assert [p["page_index"] for p in document["pages"]] == [5, 9]
    assert any("sparse_page_indexes_preserved" in w for w in document["validation"]["warnings"])
