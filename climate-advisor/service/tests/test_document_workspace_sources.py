"""Current source lifecycle validation at point acceptance and export boundaries."""

from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import httpx
import pytest
from fastapi import HTTPException

from app.routes.document_workspace import _authorized_run
from app.services.citycatalyst_client import CityCatalystClient, CityCatalystClientError
from app.services.document_workspace.source_access import document_source_validator


@pytest.mark.asyncio
async def test_source_check_sends_bound_credentials_and_verifies_digest() -> None:
    """Use the caller bearer and service authentication without fetching bytes."""
    requests = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if not request.url.path.endswith("/"):
            return httpx.Response(308, headers={"Location": str(request.url) + "/"})
        return httpx.Response(
            200, json={"available": True, "markdown_sha256": "a" * 64}
        )

    client = CityCatalystClient(
        base_url="https://cc.example", api_key="test-service-key"
    )
    client._client = httpx.AsyncClient(transport=httpx.MockTransport(respond))
    try:
        await client.verify_concept_note_source(
            upload_id="upload", token="test-user-token", expected_sha256="a" * 64
        )
    finally:
        await client.close()
    assert len(requests) == 1
    assert (
        requests[0].url.path
        == "/api/v1/internal/ca/concept-note-uploads/upload/availability/"
    )
    assert requests[0].headers["Authorization"] == "Bearer test-user-token"
    assert requests[0].headers["X-Service-Key"] == "test-service-key"
    assert requests[0].headers["X-Service-Name"] == "climate-advisor"


@pytest.mark.asyncio
async def test_source_availability_never_forwards_credentials_to_a_redirect_origin() -> (
    None
):
    """Even a redirect-enabled shared client cannot forward the internal headers."""
    requests = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            308, headers={"Location": "https://other.example/collect/"}
        )

    client = CityCatalystClient(
        base_url="https://cc.example", api_key="test-service-key"
    )
    client._client = httpx.AsyncClient(
        transport=httpx.MockTransport(respond), follow_redirects=True
    )
    try:
        with pytest.raises(CityCatalystClientError) as error:
            await client.verify_concept_note_source(
                upload_id="upload", token="test-user-token", expected_sha256="a" * 64
            )
        assert error.value.status_code == 308
    finally:
        await client.close()
    assert len(requests) == 1 and requests[0].url.host == "cc.example"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status", "body", "expected_status"),
    [
        (403, {}, 403),
        (404, {}, 404),
        (409, {}, 409),
        (503, {}, 503),
        (200, {"available": False, "markdown_sha256": "a" * 64}, 409),
        (200, {"available": True, "markdown_sha256": "b" * 64}, 409),
        (200, [], 409),
    ],
)
async def test_source_check_fails_closed(status, body, expected_status) -> None:
    """Lifecycle rejection and changed artifacts cannot authorize old evidence."""
    client = CityCatalystClient(
        base_url="https://cc.example", api_key="test-service-key"
    )
    client._client = httpx.AsyncClient(
        transport=httpx.MockTransport(lambda _: httpx.Response(status, json=body))
    )
    try:
        with pytest.raises(CityCatalystClientError) as exc:
            await client.verify_concept_note_source(
                upload_id="upload", token="test-user-token", expected_sha256="a" * 64
            )
        assert exc.value.status_code == expected_status
    finally:
        await client.close()


@pytest.mark.asyncio
async def test_source_check_maps_unreachable_core_to_unavailable() -> None:
    """A transport failure is temporary unavailability, never acceptance."""

    def respond(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("unreachable", request=request)

    client = CityCatalystClient(
        base_url="https://cc.example", api_key="test-service-key"
    )
    client._client = httpx.AsyncClient(transport=httpx.MockTransport(respond))
    try:
        with pytest.raises(CityCatalystClientError) as exc:
            await client.verify_concept_note_source(
                upload_id="upload", token="test-user-token", expected_sha256="a" * 64
            )
        assert exc.value.status_code == 503
    finally:
        await client.close()


@pytest.mark.asyncio
async def test_bound_source_validation_deduplicates_and_closes_client(
    monkeypatch,
) -> None:
    """Only current selected identities are checked, once each."""
    client = SimpleNamespace(verify_concept_note_source=AsyncMock(), close=AsyncMock())
    monkeypatch.setattr(
        "app.services.document_workspace.source_access.CityCatalystClient",
        lambda: client,
    )
    source = {"upload_id": "source", "sha256": "a" * 64}
    validate = document_source_validator("Bearer caller-token")
    await validate([source, source])
    client.verify_concept_note_source.assert_awaited_once_with(
        upload_id="source", expected_sha256="a" * 64, token="caller-token"
    )
    client.close.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status", "expected_status"), [(403, 409), (404, 409), (503, 503)]
)
async def test_validation_sanitizes_errors_and_closes_client(
    monkeypatch, status, expected_status
) -> None:
    """Provider error bodies do not cross the public point/export boundary."""
    client = SimpleNamespace(
        verify_concept_note_source=AsyncMock(
            side_effect=CityCatalystClientError(
                "private upstream text", status_code=status
            )
        ),
        close=AsyncMock(),
    )
    monkeypatch.setattr(
        "app.services.document_workspace.source_access.CityCatalystClient",
        lambda: client,
    )
    with pytest.raises(HTTPException) as exc:
        await document_source_validator("Bearer caller-token")(
            [{"upload_id": "source", "sha256": "a" * 64}]
        )
    assert exc.value.status_code == expected_status
    assert "private" not in exc.value.detail
    client.close.assert_awaited_once()


@pytest.mark.asyncio
async def test_human_answers_do_not_require_a_source_client(monkeypatch) -> None:
    """No retired/historical source can block a point without current evidence."""

    def unexpected_client():
        raise AssertionError("No current source needs validation")

    monkeypatch.setattr(
        "app.services.document_workspace.source_access.CityCatalystClient",
        unexpected_client,
    )
    await document_source_validator("Bearer caller-token")([])


@pytest.mark.asyncio
@pytest.mark.parametrize("authorized", [True, False])
async def test_workspace_authorization_always_releases_core_client(
    monkeypatch, authorized
) -> None:
    """Both allowed and revoked run requests release their Core HTTP resources."""
    run = SimpleNamespace(run_id=uuid4())
    authorize = AsyncMock(return_value=run)
    if not authorized:
        authorize.side_effect = HTTPException(404, "Run not found")
    close = AsyncMock()
    monkeypatch.setattr(
        "app.routes.document_workspace.ConceptNoteRunService",
        lambda session: SimpleNamespace(
            get_authorized_run=authorize, cc_client=SimpleNamespace(close=close)
        ),
    )
    if authorized:
        assert (
            await _authorized_run(object(), run.run_id, "owner", "Bearer token") is run
        )
    else:
        with pytest.raises(HTTPException):
            await _authorized_run(object(), run.run_id, "owner", "Bearer token")
    close.assert_awaited_once()
