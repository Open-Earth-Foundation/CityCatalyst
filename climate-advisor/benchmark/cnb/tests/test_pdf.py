"""Production-conversion artifact checks with no storage or provider calls."""

from __future__ import annotations

import hashlib
import json
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from benchmark.cnb.golden_set import pdf
from benchmark.cnb.golden_set.core import extraction_judge_input
from benchmark.cnb.tests.helpers import load_all, selected_source


def _write_json(path: Path, value: object) -> bytes:
    payload = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode()
    path.write_bytes(payload)
    return payload


@pytest.fixture
def conversion(tmp_path):
    loaded = load_all()["richfield-flood-risk"]
    payload = b"%PDF-1.7\nmock PDF input"
    (tmp_path / "pinned.pdf").write_bytes(payload)
    original = loaded.fixture.source.original_pdf.model_copy(
        update={
            "path": "pinned.pdf",
            "sha256": hashlib.sha256(payload).hexdigest(),
        }
    )
    fixture = loaded.fixture.model_copy(
        update={
            "source": loaded.fixture.source.model_copy(
                update={"original_pdf": original}
            ),
        }
    )
    loaded = replace(loaded, fixture=fixture, directory=tmp_path)
    output = tmp_path / "conversion"
    output.mkdir()
    markdown = b"<!-- page: 1 -->\nOCR omitted every mandatory fact."
    (output / "source.md").write_bytes(markdown)
    structured = {
        "schema_version": pdf.STRUCTURED_DOCUMENT_SCHEMA_VERSION,
        "annotation_mode": "visual_context",
        "provider": {
            "requested_model": "requested-ocr",
            "returned_model": None,
            "payload": {},
        },
        "document": {"page_count": 1, "pages": [{"page_index": 0, "images": []}]},
    }
    structured_bytes = _write_json(output / "structured.json", structured)
    request = {
        "model": "requested-ocr",
        "bbox_annotation_format": {},
        "include_image_base64": False,
    }
    report = {
        "schema_version": pdf.CONVERSION_SCHEMA_VERSION,
        "status": "completed",
        "source_pdf_sha256": original.sha256,
        "source_pdf_bytes": len(payload),
        "annotation_mode": "visual_context",
        "requested_model": "requested-ocr",
        "returned_model": None,
        "request_settings": request,
        "request_sha256": hashlib.sha256(
            json.dumps(request, separators=(",", ":")).encode()
        ).hexdigest(),
        "structured_schema_version": pdf.STRUCTURED_DOCUMENT_SCHEMA_VERSION,
        "timeout_ms": 1000,
        "page_count": 1,
        "markdown": {
            "path": "source.md",
            "sha256": hashlib.sha256(markdown).hexdigest(),
            "bytes": len(markdown),
        },
        "structured": {
            "path": "structured.json",
            "sha256": hashlib.sha256(structured_bytes).hexdigest(),
            "bytes": len(structured_bytes),
        },
        "elapsed_seconds": 0.5,
        "cost": {"status": "unavailable", "usd": None},
        "code": {"git_sha": None, "files_sha256": {}},
        "temporary_object_key": "benchmark/cnb/temporary/123abc/source.pdf",
        "cleanup": "completed",
        "error": None,
    }
    _write_json(output / "conversion.json", report)
    return loaded, output, report


def test_fresh_ocr_loss_is_candidate_input_and_never_redefines_truth(conversion):
    loaded, output, report = conversion
    original_markdown, original_units = loaded.markdown, loaded.units
    result = pdf.load_pdf_conversion(loaded, output)
    assert result.status == "completed"
    assert result.markdown != original_markdown
    assert result.artifact.sha256 == report["markdown"]["sha256"]
    assert result.units[0].text.strip() == "OCR omitted every mandatory fact."
    assert loaded.markdown == original_markdown
    assert loaded.units is original_units
    assert result.metadata["returned_model"] is None
    assert result.metadata["cost"] == {"status": "unavailable", "usd": None}


def test_extraction_quotes_use_fresh_ocr_but_judge_evidence_stays_pinned(conversion):
    loaded, output, _ = conversion
    result = pdf.load_pdf_conversion(loaded, output)
    candidate = replace(
        loaded,
        input_units=result.units,
        input_markdown=result.markdown,
        input_sha256=result.artifact.sha256,
    )
    source = selected_source(
        loaded,
        summary="Candidate OCR",
        key_excerpts=[],
        chapter_excerpts=[
            {
                "chapter_ref": "project_analysis",
                "excerpts": [{"page": 1, "text": "OCR omitted every mandatory fact."}],
            }
        ],
    )
    payload, failures = extraction_judge_input(candidate, source)
    assert not failures
    assert payload.outputs[0].text == "OCR omitted every mandatory fact."
    assert payload.outputs[0].chapter_ref == "project_analysis"
    assert [unit.text for unit in payload.evidence] == [
        unit.text for unit in loaded.units
    ]
    assert all(
        "OCR omitted every mandatory fact." not in unit.text
        for unit in payload.evidence
    )
    _, reference_failures = extraction_judge_input(loaded, source)
    assert reference_failures


async def test_pdf_drafting_uses_candidate_while_judging_uses_reference(
    conversion, monkeypatch, tmp_path
):
    from app.config import get_settings
    from benchmark.cnb.golden_set.models import StageReport
    from benchmark.cnb.scripts import evaluate as evaluator

    loaded, output, _ = conversion
    candidate = pdf.load_pdf_conversion(loaded, output)
    source = object()
    monkeypatch.setattr(evaluator, "fixture_problems", lambda _: [])
    monkeypatch.setattr(
        evaluator,
        "_evaluate_extraction",
        AsyncMock(return_value=(StageReport(), source)),
    )
    writing = AsyncMock(wraps=evaluator._evaluate_chapter_writing)
    monkeypatch.setattr(evaluator, "_evaluate_chapter_writing", writing)
    producer = AsyncMock(return_value=([], []))
    monkeypatch.setattr(evaluator, "write_chapters", producer)
    judge_input = Mock(return_value=(object(), []))
    monkeypatch.setattr(evaluator, "chapter_writing_judge_input", judge_input)
    monkeypatch.setattr(
        evaluator,
        "_judge",
        AsyncMock(
            return_value=StageReport(evaluation_errors=["test judge unavailable"])
        ),
    )
    await evaluator._evaluate_fixture(
        loaded,
        get_settings(),
        ["extraction", "chapter_writing"],
        tmp_path / "run",
        candidate=candidate,
    )
    writing.assert_awaited_once()
    producing = producer.await_args.args[0]
    assert producing.markdown == candidate.markdown
    assert producing.units is candidate.units
    assert producing.fixture.source.sha256 == candidate.artifact.sha256
    assert judge_input.call_args.args[0] is loaded
    assert loaded.markdown != candidate.markdown


@pytest.mark.parametrize("filename", ["source.md", "structured.json"])
def test_rejects_corrupt_generated_artifact(conversion, filename):
    loaded, output, _ = conversion
    with (output / filename).open("ab") as handle:
        handle.write(b"altered")
    with pytest.raises(ValueError, match="digest or byte-count"):
        pdf.load_pdf_conversion(loaded, output)


def test_rejects_invalid_page_markers_even_with_updated_content_hash(conversion):
    loaded, output, report = conversion
    content = b"<!-- page: 2 -->\nWrong first page."
    (output / "source.md").write_bytes(content)
    report["markdown"].update(
        sha256=hashlib.sha256(content).hexdigest(), bytes=len(content)
    )
    _write_json(output / "conversion.json", report)
    with pytest.raises(Exception, match="page"):
        pdf.load_pdf_conversion(loaded, output)


@pytest.mark.parametrize(
    "change",
    [
        {"source_pdf_sha256": "0" * 64},
        {"page_count": 2},
        {"request_sha256": "0" * 64},
        {"cleanup": "failed"},
        {"status": "failed"},
        {"returned_model": "invented-returned-model"},
    ],
)
def test_rejects_conflicting_or_incomplete_provenance(conversion, change):
    loaded, output, report = conversion
    report.update(change)
    _write_json(output / "conversion.json", report)
    with pytest.raises(Exception):
        pdf.load_pdf_conversion(loaded, output)


def test_missing_or_changed_pinned_pdf_never_falls_back_to_origin_url(conversion):
    loaded, output, _ = conversion
    path = loaded.directory / "pinned.pdf"
    path.write_bytes(b"changed PDF")
    with pytest.raises(ValueError, match="Pinned PDF digest"):
        pdf.load_pdf_conversion(loaded, output)
    path.unlink()
    with pytest.raises(FileNotFoundError):
        pdf.load_pdf_conversion(loaded, output)


@pytest.mark.asyncio
async def test_synthetic_markdown_is_explicitly_not_applicable(tmp_path, monkeypatch):
    spawn = AsyncMock()
    monkeypatch.setattr(pdf.asyncio, "create_subprocess_exec", spawn)
    result = await pdf.convert_pdf_fixture(
        load_all()["harbor-point-heat-resilience"], tmp_path / "unused"
    )
    assert result.status == "not_applicable"
    assert result.reason == "fixture_has_no_original_pdf"
    assert result.artifact is None
    spawn.assert_not_called()


@pytest.mark.asyncio
async def test_converter_receives_pinned_local_path_and_runs_independently(
    conversion, monkeypatch, tmp_path
):
    loaded, output, _ = conversion
    app = tmp_path / "app"
    tsx = app / "node_modules" / "tsx"
    tsx.mkdir(parents=True)
    (tsx / "package.json").write_text("{}")
    monkeypatch.setattr(pdf, "APP_ROOT", app)
    monkeypatch.setattr(pdf.shutil, "which", lambda _: "node")
    process = SimpleNamespace(wait=AsyncMock(return_value=0), returncode=0)
    spawn = AsyncMock(return_value=process)
    monkeypatch.setattr(pdf.asyncio, "create_subprocess_exec", spawn)
    for _ in range(2):
        result = await pdf.convert_pdf_fixture(loaded, output, timeout_seconds=1)
        assert result.status == "completed"
    assert spawn.call_count == 2
    args, kwargs = spawn.call_args
    assert args[:3] == ("node", "--import", "tsx")
    assert str(loaded.directory / "pinned.pdf") in args
    assert loaded.fixture.source.original_pdf.sha256 in args
    assert kwargs["cwd"] == app


@pytest.mark.asyncio
async def test_timeout_kills_direct_node_process_and_propagates(
    conversion, monkeypatch, tmp_path
):
    loaded, output, _ = conversion
    app = tmp_path / "app"
    tsx = app / "node_modules" / "tsx"
    tsx.mkdir(parents=True)
    (tsx / "package.json").write_text("{}")
    monkeypatch.setattr(pdf, "APP_ROOT", app)
    monkeypatch.setattr(pdf.shutil, "which", lambda _: "node")
    process = SimpleNamespace(
        wait=AsyncMock(side_effect=[TimeoutError(), 0]), returncode=None, kill=Mock()
    )
    monkeypatch.setattr(
        pdf.asyncio, "create_subprocess_exec", AsyncMock(return_value=process)
    )
    with pytest.raises(TimeoutError):
        await pdf.convert_pdf_fixture(loaded, output, timeout_seconds=1)
    process.kill.assert_called_once()
