from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
PYTHON_DIR = ROOT / "python"
import sys

sys.path.insert(0, str(PYTHON_DIR))

from cc771.enrich import build_enriched_markdown  # noqa: E402
from cc771.mistral_client import build_ocr_payload  # noqa: E402
from cc771.normalize import normalize_bbox  # noqa: E402
from cc771.sanitize import sanitize_for_persistence  # noqa: E402


def test_enriched_markdown_orders_header_body_footer():
    document = {
        "pages": [
            {
                "page_index": 0,
                "header": "HEADER_TEXT",
                "footer": "FOOTER_TEXT",
                "markdown": "BODY_TEXT\n\n![img-0.jpeg](img-0.jpeg)\n",
                "blocks": [
                    {
                        "block_id": "p0-b0",
                        "cc_type": "text",
                        "reading_order_index": 0,
                    }
                ],
                "images": [
                    {
                        "image_id": "img-0.jpeg",
                        "annotation": {
                            "schema_version": "cc-771.visual.1",
                            "kind": "chart",
                            "title": None,
                            "short_description": "desc",
                            "text_visible": [],
                            "chart": None,
                            "uncertainties": [],
                        },
                        "annotation_error": None,
                    }
                ],
            }
        ]
    }
    text = build_enriched_markdown(document)
    header_at = text.index("HEADER_TEXT")
    body_at = text.index("BODY_TEXT")
    footer_at = text.index("FOOTER_TEXT")
    assert header_at < body_at < footer_at
    assert text.index("<!-- header -->") < text.index("<!-- footer -->")


def test_normalize_bbox_warns_when_clamping():
    _, bbox_norm, warnings = normalize_bbox(-10, 0, 1100, 500, 1000, 1000)
    assert bbox_norm is not None
    assert bbox_norm["x0"] == 0.0
    assert bbox_norm["x1"] == 1.0
    assert "clamped_out_of_bounds_normalized_coordinates" in warnings


def test_sanitize_strips_secrets_and_base64():
    payload = {
        "pages": [
            {
                "images": [
                    {
                        "id": "img-0.jpeg",
                        "image_base64": "data:image/jpeg;base64,aGVsbG8=",
                        "image_annotation": {"kind": "chart"},
                    }
                ]
            }
        ],
        "document": {
            "type": "document_url",
            "document_url": "https://example.com/file?X-Amz-Signature=abc",
        },
        "authorization": "Bearer secret-token",
    }
    cleaned = sanitize_for_persistence(payload)
    text = json.dumps(cleaned)
    assert "secret-token" not in text
    assert "X-Amz-Signature" not in text
    assert "image_base64" not in cleaned["pages"][0]["images"][0]
    assert cleaned["pages"][0]["images"][0]["image_base64_omitted"] is True
    assert cleaned["pages"][0]["images"][0]["image_sha256"]


def test_run_all_does_not_annotate_full_structure_runs():
    script = (ROOT / "python" / "run_all.sh").read_text(encoding="utf-8")
    assert "NO bbox annotate" in script
    real_structure = script.split("Real 2025 full structural OCR", 1)[1]
    real_structure = real_structure.split("annotation-focused pages", 1)[0]
    for block in real_structure.split("run_structured_ocr.py")[1:]:
        cmd = block.split("assert_run_contract", 1)[0]
        assert "--annotate" not in cmd, cmd
    annotate_part = script.split("annotation-focused pages", 1)[1]
    assert "--annotate" in annotate_part


def test_artifact_sizes_match_disk_for_committed_runs():
    runs = ROOT / "cc-771-runs"
    targets = sorted(runs.glob("2026-09-08-mistral-ocr-4-1-*/run.json"))
    assert targets, "expected committed runs"
    for run_json in targets:
        meta = json.loads(run_json.read_text(encoding="utf-8"))
        sizes = meta.get("artifact_sizes_bytes") or {}
        assert sizes, run_json
        for name, recorded in sizes.items():
            path = run_json.parent / name
            assert path.exists(), path
            assert path.stat().st_size == recorded, (path, recorded)


def test_build_ocr_payload_omits_bbox_unless_requested():
    payload = build_ocr_payload(
        document_url="https://example.com/doc.pdf",
        bbox_annotation_format=None,
        include_image_base64=False,
        pages=None,
    )
    assert "bbox_annotation_format" not in payload
    assert payload["include_blocks"] is True


def test_api_failure_writes_auditable_run_bundle(tmp_path, monkeypatch):
    """Invalid credentials / API errors must still emit the full audit bundle."""
    from run_structured_ocr import classify_retryability, process_run

    pdf = ROOT / "fixtures" / "v2" / "cc-771-structured-benchmark-v2.pdf"
    assert pdf.exists()
    run_dir = tmp_path / "failed-run"

    monkeypatch.setattr(
        "run_structured_ocr.require_api_key",
        lambda: "invalid-test-key",
    )

    def boom(*_args, **_kwargs):
        raise RuntimeError("HTTP 401 from https://api.mistral.ai/v1/files: Unauthorized")

    monkeypatch.setattr("run_structured_ocr.run_ocr", boom)

    meta = process_run(
        pdf_path=pdf,
        run_dir=run_dir,
        run_id="test-api-failure",
        annotate=False,
        selected_pages=None,
        copy_input=True,
        chart_facts_path=None,
    )

    assert meta["status"] == "failed"
    assert "401" in (meta["error"] or "")
    assert meta["retryability"]["retryable"] is False
    assert (run_dir / "input.pdf").exists()
    assert (run_dir / "response.raw.json").exists()
    assert (run_dir / "run.json").exists()
    assert (run_dir / "document.structured.json").exists()
    assert (run_dir / "evaluation.md").exists()
    assert (run_dir / "output.md").exists()
    assert (run_dir / "output.enriched.md").exists()

    run_meta = json.loads((run_dir / "run.json").read_text(encoding="utf-8"))
    document = json.loads(
        (run_dir / "document.structured.json").read_text(encoding="utf-8")
    )
    evaluation = (run_dir / "evaluation.md").read_text(encoding="utf-8")

    assert run_meta["status"] == "failed"
    assert run_meta["error"]
    assert run_meta["retryability"]["retryable"] is False
    assert document["schema_version"] == "cc-771.1"
    assert document["pages"] == []
    assert document["validation"]["warnings"]
    assert "Provider failure" in evaluation
    assert "Retryable: False" in evaluation
    assert "HTTP 401" in evaluation

    auth = classify_retryability("HTTP 401 Unauthorized")
    assert auth["retryable"] is False
    transient = classify_retryability("HTTP 429 rate limit")
    assert transient["retryable"] is True
