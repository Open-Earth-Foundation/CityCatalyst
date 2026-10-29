"""Run and validate fresh production PDF conversions without changing golden truth.

The TypeScript runner stages only the pinned local PDF bytes and calls the CNB
``visual_context`` converter. This adapter checks its artifacts independently of
the frozen Markdown fixture; missing OCR facts remain evaluation failures rather
than becoming a new answer key. Neither adapter certifies upload HTTP, queue, or
database delivery behavior.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import math
import shutil
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

from app.models.cnb.concept_note_markdown import STRUCTURED_DOCUMENT_SCHEMA_VERSION
from app.services.citycatalyst_client import ConceptNoteMarkdownArtifact
from app.services.cnb.source_analysis import SourceUnit, verify_source_artifact
from pydantic import BaseModel, ConfigDict, Field

from benchmark.cnb.golden_set.core import LoadedFixture

logger = logging.getLogger(__name__)
CONVERSION_SCHEMA_VERSION = "citycatalyst.cnb-pdf-benchmark.1"
APP_ROOT = Path(__file__).resolve().parents[4] / "app"


class _ArtifactFile(BaseModel):
    """A fixed-name output with a checksum over its exact UTF-8 bytes."""

    model_config = ConfigDict(extra="forbid", strict=True)
    path: Literal["source.md", "structured.json"]
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    bytes: int = Field(ge=1)


class _ConversionReport(BaseModel):
    """Persisted converter metadata; raw provider errors and URLs are absent."""

    model_config = ConfigDict(extra="forbid", strict=True)
    schema_version: Literal["citycatalyst.cnb-pdf-benchmark.1"]
    status: Literal["running", "completed", "failed"]
    source_pdf_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    source_pdf_bytes: int | None = Field(ge=1)
    annotation_mode: Literal["visual_context"]
    requested_model: str = Field(min_length=1)
    returned_model: str | None
    request_settings: dict[str, object]
    request_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    structured_schema_version: str
    timeout_ms: int = Field(ge=1, le=3_600_000)
    page_count: int | None = Field(ge=1)
    markdown: _ArtifactFile | None
    structured: _ArtifactFile | None
    elapsed_seconds: float = Field(ge=0, allow_inf_nan=False)
    cost: dict[str, object]
    code: dict[str, object]
    temporary_object_key: str | None = Field(
        pattern=r"^benchmark/cnb/temporary/[0-9a-f-]+/source\.pdf$"
    )
    cleanup: Literal["not_needed", "pending", "completed", "failed"]
    error: dict[str, str] | None


@dataclass(frozen=True)
class PdfConversion:
    """Candidate input and provenance kept separate from the authoritative fixture."""

    status: Literal["completed", "not_applicable"]
    reason: str | None = None
    markdown: str = ""
    units: list[SourceUnit] = field(default_factory=list)
    artifact: ConceptNoteMarkdownArtifact | None = None
    structured: dict[str, object] | None = None
    metadata: dict[str, object] = field(default_factory=dict)


def pinned_pdf_path(loaded: LoadedFixture) -> Path | None:
    """Return the verified local PDF, or None for a fixture with no original PDF.

    A declared but absent or changed PDF is an error, never a remote download.
    This preserves redacted checked-in PDF bytes even when an origin URL exists.
    """
    original = loaded.fixture.source.original_pdf
    if original is None:
        return None
    directory = loaded.directory.resolve()
    path = (directory / original.path).resolve()
    if not path.is_relative_to(directory):
        raise ValueError("Pinned PDF must stay inside its fixture directory")
    payload = path.read_bytes()
    if hashlib.sha256(payload).hexdigest() != original.sha256:
        raise ValueError("Pinned PDF digest mismatch")
    return path


def _artifact_bytes(directory: Path, artifact: _ArtifactFile, name: str) -> bytes:
    """Read a fixed output only after checking its declared name and byte digest."""
    if artifact.path != name:
        raise ValueError("Conversion artifact filename mismatch")
    payload = (directory / name).read_bytes()
    if (
        len(payload) != artifact.bytes
        or hashlib.sha256(payload).hexdigest() != artifact.sha256
    ):
        raise ValueError(f"Conversion {name} digest or byte-count mismatch")
    return payload


def load_pdf_conversion(loaded: LoadedFixture, output_dir: Path) -> PdfConversion:
    """Validate a saved conversion and parse candidate pages without replacing truth.

    Raises ValueError for failed/incomplete conversions or conflicting metadata;
    production page validation also rejects missing or reordered page markers.
    """
    # Validate the trusted local input before accepting any candidate artifact.
    pdf = pinned_pdf_path(loaded)
    if pdf is None:
        return PdfConversion(
            status="not_applicable", reason="fixture_has_no_original_pdf"
        )
    report = _ConversionReport.model_validate_json(
        (output_dir / "conversion.json").read_bytes()
    )
    if (
        report.status != "completed"
        or report.cleanup != "completed"
        or report.error is not None
    ):
        raise ValueError(
            "PDF conversion failed or is incomplete; inspect conversion.json"
        )
    if not report.temporary_object_key:
        raise ValueError("Conversion has no staging provenance")
    original = loaded.fixture.source.original_pdf
    assert original is not None
    if (
        report.source_pdf_sha256 != original.sha256
        or report.source_pdf_bytes != pdf.stat().st_size
    ):
        raise ValueError("Conversion input PDF identity mismatch")
    if (
        report.markdown is None
        or report.structured is None
        or report.page_count is None
    ):
        raise ValueError("Completed conversion is missing output metadata")
    if report.structured_schema_version != STRUCTURED_DOCUMENT_SCHEMA_VERSION:
        raise ValueError("Conversion structured schema mismatch")

    # Check effective production settings and distinguish unknown returned models.
    request = report.request_settings
    encoded_request = json.dumps(
        request, ensure_ascii=False, separators=(",", ":")
    ).encode("utf-8")
    if hashlib.sha256(encoded_request).hexdigest() != report.request_sha256:
        raise ValueError("Conversion request settings digest mismatch")
    if (
        "document" in request
        or request.get("model") != report.requested_model
        or not isinstance(request.get("bbox_annotation_format"), dict)
        or request.get("include_image_base64") is not False
    ):
        raise ValueError("Conversion does not use the CNB visual-context request")
    if report.cost != {"status": "unavailable", "usd": None}:
        raise ValueError("Conversion cost must be explicitly unavailable")

    # Reuse production Markdown validation against the generated identity, not truth.
    markdown_bytes = _artifact_bytes(output_dir, report.markdown, "source.md")
    markdown = markdown_bytes.decode("utf-8")
    pointer = f"benchmark/cnb/pdf/{loaded.fixture.fixture_id}/{report.markdown.sha256}/source.md"
    artifact = ConceptNoteMarkdownArtifact(
        markdown=markdown,
        markdown_s3_key=pointer,
        sha256=report.markdown.sha256,
        source_format="pdf",
        page_count=report.page_count,
    )
    units = verify_source_artifact(
        artifact=artifact,
        markdown_s3_key=pointer,
        sha256=artifact.sha256,
        source_format="pdf",
        page_count=report.page_count,
    )
    structured = json.loads(
        _artifact_bytes(output_dir, report.structured, "structured.json")
    )
    if not isinstance(structured, dict):
        raise ValueError("Conversion structured artifact is not an object")
    provider, document = structured.get("provider"), structured.get("document")
    if (
        structured.get("schema_version") != report.structured_schema_version
        or structured.get("annotation_mode") != "visual_context"
        or not isinstance(provider, dict)
        or provider.get("requested_model") != report.requested_model
        or provider.get("returned_model") != report.returned_model
        or not isinstance(document, dict)
        or document.get("page_count") != report.page_count
    ):
        raise ValueError("Conversion structured metadata mismatch")
    pages = document.get("pages")
    if (
        not isinstance(pages, list)
        or len(pages) != report.page_count
        or not all(isinstance(page, dict) for page in pages)
        or [page.get("page_index") for page in pages] != list(range(report.page_count))
    ):
        raise ValueError("Conversion structured pages are not contiguous")
    return PdfConversion(
        status="completed",
        markdown=markdown,
        units=units,
        artifact=artifact,
        structured=structured,
        metadata=report.model_dump(mode="json"),
    )


async def convert_pdf_fixture(
    loaded: LoadedFixture,
    output_dir: Path,
    *,
    timeout_seconds: float = 240,
) -> PdfConversion:
    """Run the installed TypeScript converter once and return validated candidate input.

    Requires Node, app's installed tsx dependency, provider and AWS environment.
    The per-upload/OCR timeout allows an additional cleanup grace period. A hard
    process timeout can leave staging cleanup unconfirmed and is reported as an
    error; provider/storage exception output is never copied to Python logs.
    """
    pdf = pinned_pdf_path(loaded)
    if pdf is None:
        return PdfConversion(
            status="not_applicable", reason="fixture_has_no_original_pdf"
        )
    if not math.isfinite(timeout_seconds) or not 0 < timeout_seconds <= 3600:
        raise ValueError("PDF conversion timeout must be between 0 and 3600 seconds")
    node = shutil.which("node")
    if (
        node is None
        or not (APP_ROOT / "node_modules" / "tsx" / "package.json").exists()
    ):
        raise ValueError("PDF conversion requires Node and app dependencies (npm ci)")
    original = loaded.fixture.source.original_pdf
    assert original is not None
    logger.info("Converting pinned PDF fixture %s", loaded.fixture.fixture_id)
    # --import loads tsx in this process, so a timeout cannot orphan a tsx child.
    process = await asyncio.create_subprocess_exec(
        node,
        "--import",
        "tsx",
        str(APP_ROOT / "scripts" / "benchmark-cnb-pdf.ts"),
        "--pdf",
        str(pdf),
        "--expected-sha256",
        original.sha256,
        "--output-dir",
        str(output_dir.resolve()),
        "--timeout-ms",
        str(max(1, int(timeout_seconds * 1000))),
        cwd=APP_ROOT,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    try:
        await asyncio.wait_for(process.wait(), timeout=timeout_seconds * 2 + 45)
    except (TimeoutError, asyncio.CancelledError):
        if process.returncode is None:
            process.kill()
        await process.wait()
        raise
    if process.returncode != 0:
        raise ValueError(
            "PDF converter failed; inspect its content-free conversion.json report"
        )
    return load_pdf_conversion(loaded, output_dir)
