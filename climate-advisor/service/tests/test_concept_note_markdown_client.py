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


def settings(max_bytes: int) -> SimpleNamespace:
    """Return the CityCatalyst settings used by these focused client tests."""
    return SimpleNamespace(
        cc_base_url=None,
        cc_api_key=None,
        cnb_markdown_request_max_bytes=max_bytes,
    )


@pytest.mark.asyncio
async def test_markdown_client_streams_and_parses_a_bounded_artifact() -> None:
    markdown = b"<!-- page: 1 -->\n# Plan"
    digest = hashlib.sha256(markdown).hexdigest()
    stream = TrackingStream([markdown[:10], markdown[10:]])

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == "Bearer user-token"
        assert request.headers["X-Service-Key"] == "service-key"
        return httpx.Response(
            200,
            headers={
                "Content-Length": str(len(markdown)),
                "X-Markdown-S3-Key": "results/upload/combined.md",
                "X-Markdown-SHA256": digest,
                "X-Page-Count": "1",
            },
            stream=stream,
        )

    with patch(
        "app.services.citycatalyst_client.get_settings",
        return_value=settings(len(markdown)),
    ):
        client = CityCatalystClient(
            base_url="https://cc.example",
            api_key="service-key",
        )
        client._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        try:
            artifact = await client.get_concept_note_markdown(
                upload_id="upload-id",
                token="user-token",
            )
        finally:
            await client.close()

    assert artifact.markdown == markdown.decode()
    assert artifact.markdown_s3_key == "results/upload/combined.md"
    assert artifact.sha256 == digest
    assert artifact.page_count == 1
    assert stream.chunks_read == 2


@pytest.mark.asyncio
async def test_markdown_client_rejects_declared_oversize_before_streaming() -> None:
    stream = TrackingStream([b"never consumed"])

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={"Content-Length": "6"},
            stream=stream,
        )

    with patch(
        "app.services.citycatalyst_client.get_settings",
        return_value=settings(5),
    ):
        client = CityCatalystClient(base_url="https://cc.example")
        client._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        try:
            with pytest.raises(CityCatalystClientError) as error:
                await client.get_concept_note_markdown(
                    upload_id="upload-id",
                    token="user-token",
                )
        finally:
            await client.close()

    assert error.value.status_code == 413
    assert stream.chunks_read == 0


@pytest.mark.asyncio
async def test_markdown_client_stops_an_undeclared_oversize_stream() -> None:
    stream = TrackingStream([b"1234", b"5678", b"not consumed"])

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, stream=stream)

    with patch(
        "app.services.citycatalyst_client.get_settings",
        return_value=settings(5),
    ):
        client = CityCatalystClient(base_url="https://cc.example")
        client._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        try:
            with pytest.raises(CityCatalystClientError) as error:
                await client.get_concept_note_markdown(
                    upload_id="upload-id",
                    token="user-token",
                )
        finally:
            await client.close()

    assert error.value.status_code == 413
    assert stream.chunks_read == 2
