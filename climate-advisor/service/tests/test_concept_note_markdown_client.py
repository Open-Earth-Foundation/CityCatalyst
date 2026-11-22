from __future__ import annotations

import hashlib
from collections.abc import AsyncIterator
from types import SimpleNamespace
from unittest.mock import patch

import httpx
import pytest
from app.services.citycatalyst_client import (
    CityCatalystClient,
    CityCatalystClientError,
)


class TrackingStream(httpx.AsyncByteStream):
    """Yield controlled chunks and record how far the client consumed them."""

    def __init__(self, chunks: list[bytes]) -> None:
        self.chunks = chunks
        self.chunks_read = 0

    async def __aiter__(self) -> AsyncIterator[bytes]:
        for chunk in self.chunks:
            self.chunks_read += 1
            yield chunk

    async def aclose(self) -> None:
        """Satisfy the HTTPX streaming response contract."""


async def fetch(handler, *, max_bytes: int, artifact: str = "markdown"):
    """Fetch one artifact through a client whose transport is `handler`."""
    with patch(
        "app.services.citycatalyst_client.get_settings",
        return_value=settings(max_bytes),
    ):
        client = CityCatalystClient(base_url="https://cc.example", api_key="service-key")
        client._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        try:
            return await getattr(client, f"get_concept_note_{artifact}")(
                upload_id="upload-id",
                token="user-token",
            )
        finally:
            await client.close()


def settings(max_bytes: int) -> SimpleNamespace:
    """Return the CityCatalyst settings used by these focused client tests."""
    return SimpleNamespace(
        cc_base_url=None,
        cc_api_key=None,
        cnb_markdown_request_max_bytes=max_bytes,
        cnb_structured_request_max_bytes=max_bytes,
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("source_format", "page_count", "markdown"),
    [
        ("pdf", 1, b"<!-- page: 1 -->\n# Plan"),
        ("markdown", None, b"# Plan\n\nNative context"),
    ],
)
async def test_markdown_client_parses_pdf_and_native_markdown_artifacts(
    source_format: str,
    page_count: int | None,
    markdown: bytes,
) -> None:
    digest = hashlib.sha256(markdown).hexdigest()
    stream = TrackingStream([markdown[:10], markdown[10:]])

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == "Bearer user-token"
        assert request.headers["X-Service-Key"] == "service-key"
        headers = {
            "Content-Length": str(len(markdown)),
            "X-Markdown-S3-Key": "results/upload/combined.md",
            "X-Markdown-SHA256": digest,
            "X-Source-Format": source_format,
        }
        if page_count is not None:
            headers["X-Page-Count"] = str(page_count)
        return httpx.Response(200, headers=headers, stream=stream)

    artifact = await fetch(handler, max_bytes=len(markdown))

    assert artifact.markdown == markdown.decode()
    assert artifact.markdown_s3_key == "results/upload/combined.md"
    assert artifact.sha256 == digest
    assert artifact.source_format == source_format
    assert artifact.page_count == page_count
    assert artifact.legacy_markdown_only is False
    assert stream.chunks_read == 2


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("marker", "accepted"), [("pre-structured-pdf-v1", True), ("true", False)]
)
async def test_markdown_client_accepts_only_the_exact_legacy_pdf_marker(
    marker: str, accepted: bool
) -> None:
    markdown = b"<!-- page: 1 -->\n# Legacy plan"

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={
                "X-Markdown-S3-Key": "results/upload/combined.md",
                "X-Markdown-SHA256": hashlib.sha256(markdown).hexdigest(),
                "X-Source-Format": "pdf",
                "X-Page-Count": "1",
                "X-CC-Legacy-Pdf-Delivery": marker,
            },
            content=markdown,
        )

    if accepted:
        artifact = await fetch(handler, max_bytes=len(markdown))
        assert artifact.legacy_markdown_only is True
        return
    with pytest.raises(CityCatalystClientError) as error:
        await fetch(handler, max_bytes=len(markdown))
    assert error.value.status_code == 502


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("chunks", "declared_length", "chunks_read"),
    [
        ([b"never consumed"], "6", 0),
        ([b"1234", b"5678", b"not consumed"], None, 2),
    ],
)
async def test_markdown_client_stops_an_oversize_artifact(
    chunks: list[bytes], declared_length: str | None, chunks_read: int
) -> None:
    """A declared oversize is refused before streaming; an undeclared one is cut off."""
    stream = TrackingStream(chunks)
    headers = {"Content-Length": declared_length} if declared_length else {}

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, headers=headers, stream=stream)

    with pytest.raises(CityCatalystClientError) as error:
        await fetch(handler, max_bytes=5)

    assert error.value.status_code == 413
    assert stream.chunks_read == chunks_read


@pytest.mark.asyncio
async def test_structured_client_reads_json_and_rejects_an_oversize_artifact() -> None:
    """Structured reads use their own byte limit and require a JSON object."""
    body = b'{"schema_version":"citycatalyst.structured-document.1"}'
    digest = hashlib.sha256(body).hexdigest()

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/structured")
        return httpx.Response(
            200,
            headers={
                "Content-Type": "application/json; charset=utf-8",
                "Content-Length": str(len(body)),
                "X-Structured-S3-Key": "document.structured.json",
                "X-Structured-SHA256": digest,
                "X-Structured-Schema-Version": "citycatalyst.structured-document.1",
                "X-Annotation-Mode": "visual_context",
                "X-Page-Count": "1",
                "X-Upload-Id": "upload-id",
            },
            content=body,
        )

    artifact = await fetch(handler, max_bytes=len(body), artifact="structured")

    assert artifact.sha256 == digest
    assert artifact.annotation_mode == "visual_context"
    assert artifact.page_count == 1

    with pytest.raises(CityCatalystClientError) as error:
        await fetch(handler, max_bytes=len(body) - 1, artifact="structured")

    assert error.value.status_code == 413
