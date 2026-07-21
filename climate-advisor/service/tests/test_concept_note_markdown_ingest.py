from __future__ import annotations

import hashlib
from collections.abc import Iterable
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import get_app
from app.models.concept_note_markdown import ConceptNoteMarkdownRequest
from app.repositories.concept_note_markdown import (
    ConceptNoteMarkdownRepository,
    ConceptNoteMarkdownRepositoryError,
    get_concept_note_markdown_repository,
)
from app.routes.concept_note_markdown import get_citycatalyst_client
from app.services.citycatalyst_client import CityCatalystClientError


class FakeIdentityClient:
    """Resolve test tokens without sharing a CC signing secret."""

    async def validate_user_identity(self, token: str) -> str:
        """Return the canonical subject or reject an invalid token."""
        if token == "invalid":
            raise CityCatalystClientError("invalid", status_code=401)
        return token


class FakeMarkdownRepository(ConceptNoteMarkdownRepository):
    """Atomic in-memory implementation used only for API contract tests."""

    def __init__(self, run_id: UUID, owner_id: str) -> None:
        self.run_id = run_id
        self.owner_id = owner_id
        self.uploads: dict[UUID, tuple[UUID, str]] = {}

    async def register_markdown(
        self,
        *,
        user_id: str,
        run_id: UUID,
        upload_id: UUID,
        payload: ConceptNoteMarkdownRequest,
    ) -> None:
        """Enforce run ownership, upload binding, and digest idempotency atomically."""
        if run_id != self.run_id:
            raise ConceptNoteMarkdownRepositoryError(
                "concept_note_run_not_found", 404, "Run not found"
            )
        if user_id != self.owner_id:
            raise ConceptNoteMarkdownRepositoryError(
                "concept_note_run_forbidden", 403, "Run owner does not match"
            )
        existing = self.uploads.get(upload_id)
        if existing and existing[0] != run_id:
            raise ConceptNoteMarkdownRepositoryError(
                "upload_run_binding_conflict", 409, "Upload belongs to another run"
            )
        if existing and existing[1] != payload.sha256:
            raise ConceptNoteMarkdownRepositoryError(
                "markdown_identity_conflict", 409, "Upload digest cannot change"
            )
        self.uploads[upload_id] = (run_id, payload.sha256)


def payload(
    markdown: str = "<!-- page: 1 -->\n# Plan", page_count: int = 1
) -> dict[str, object]:
    """Build a valid request with a digest over the exact UTF-8 Markdown."""
    return {
        "markdown": markdown,
        "filename": "plan.pdf",
        "source_label": "Climate Action Plan",
        "page_count": page_count,
        "sha256": hashlib.sha256(markdown.encode()).hexdigest(),
    }


@pytest.fixture
def ingest_client():
    """Provide a client and fake atomic repository for each contract test."""
    run_id = uuid4()
    repository = FakeMarkdownRepository(run_id, "owner-user")
    app = get_app()
    app.dependency_overrides[get_citycatalyst_client] = FakeIdentityClient
    app.dependency_overrides[get_concept_note_markdown_repository] = lambda: repository
    with TestClient(app) as client:
        yield client, repository, run_id
    app.dependency_overrides.clear()


def post(
    client: TestClient, run_id: UUID, upload_id: UUID, body: dict, token="owner-user"
):
    """Post one Markdown artifact with the requested identity token."""
    return client.post(
        f"/v1/concept-notes/{run_id}/uploads/{upload_id}/markdown",
        json=body,
        headers={"Authorization": f"Bearer {token}"} if token else {},
    )


def post_stream(
    client: TestClient,
    run_id: UUID,
    upload_id: UUID,
    chunks: Iterable[bytes],
    token: str = "owner-user",
):
    """Post a lazily consumed JSON byte stream without a Content-Length header."""
    return client.post(
        f"/v1/concept-notes/{run_id}/uploads/{upload_id}/markdown",
        content=chunks,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )


def test_missing_and_invalid_bearer_token(ingest_client) -> None:
    client, _, run_id = ingest_client
    assert post(client, run_id, uuid4(), payload(), token="").status_code == 401
    assert post(client, run_id, uuid4(), payload(), token="invalid").status_code == 401


def test_invalid_bearer_is_rejected_before_stream_consumption(ingest_client) -> None:
    client, _, run_id = ingest_client
    consumed_chunks: list[bytes] = []

    def body_chunks() -> Iterable[bytes]:
        chunk = b"untrusted request body"
        consumed_chunks.append(chunk)
        yield chunk

    response = post_stream(
        client, run_id, uuid4(), body_chunks(), token="invalid"
    )

    assert response.status_code == 401
    assert consumed_chunks == []


def test_owner_missing_run_and_upload_binding(ingest_client) -> None:
    client, repository, run_id = ingest_client
    assert post(client, uuid4(), uuid4(), payload()).status_code == 404
    assert (
        post(client, run_id, uuid4(), payload(), token="other-user").status_code == 403
    )
    upload_id = uuid4()
    repository.uploads[upload_id] = (uuid4(), payload()["sha256"])
    response = post(client, run_id, upload_id, payload())
    assert response.status_code == 409
    assert response.json()["code"] == "upload_run_binding_conflict"


def test_digest_validation_idempotency_and_identity_conflict(ingest_client) -> None:
    client, _, run_id = ingest_client
    upload_id = uuid4()
    invalid = payload()
    invalid["sha256"] = "0" * 64
    assert (
        post(client, run_id, upload_id, invalid).json()["code"]
        == "markdown_digest_mismatch"
    )

    first = post(client, run_id, upload_id, payload())
    second = post(client, run_id, upload_id, payload())
    assert first.status_code == second.status_code == 202

    changed = payload("<!-- page: 1 -->\n# Changed")
    conflict = post(client, run_id, upload_id, changed)
    assert conflict.status_code == 409
    assert conflict.json()["code"] == "markdown_identity_conflict"


def test_page_and_body_size_validation(ingest_client) -> None:
    client, _, run_id = ingest_client
    invalid_pages = payload("<!-- page: 2 -->\n# Plan")
    assert (
        post(client, run_id, uuid4(), invalid_pages).json()["code"]
        == "invalid_markdown_pages"
    )
    mismatched_count = payload()
    mismatched_count["page_count"] = 2
    assert (
        post(client, run_id, uuid4(), mismatched_count).json()["code"]
        == "invalid_markdown_pages"
    )

    settings = get_settings()
    original_limit = settings.cnb_markdown_request_max_bytes
    settings.cnb_markdown_request_max_bytes = 32
    try:
        response = post(client, run_id, uuid4(), payload())
        assert response.status_code == 413
        assert response.json()["code"] == "markdown_request_too_large"
    finally:
        settings.cnb_markdown_request_max_bytes = original_limit


def test_page_count_has_no_acceptance_cap(ingest_client) -> None:
    client, _, run_id = ingest_client
    page_count = 1_001
    markdown = "\n".join(
        f"<!-- page: {page_number} -->\nPage {page_number}"
        for page_number in range(1, page_count + 1)
    )

    response = post(
        client,
        run_id,
        uuid4(),
        payload(markdown=markdown, page_count=page_count),
    )

    assert response.status_code == 202


def test_chunked_body_without_content_length_is_bounded(ingest_client) -> None:
    client, _, run_id = ingest_client
    settings = get_settings()
    original_limit = settings.cnb_markdown_request_max_bytes
    settings.cnb_markdown_request_max_bytes = 8
    try:
        response = post_stream(
            client,
            run_id,
            uuid4(),
            iter((b"12345", b"67890")),
        )
    finally:
        settings.cnb_markdown_request_max_bytes = original_limit

    assert "Content-Length" not in response.request.headers
    assert response.status_code == 413
    assert response.json()["code"] == "markdown_request_too_large"


def test_unavailable_production_repository_returns_503() -> None:
    app = get_app()
    app.dependency_overrides[get_citycatalyst_client] = FakeIdentityClient
    with TestClient(app) as client:
        response = post(client, uuid4(), uuid4(), payload())
    app.dependency_overrides.clear()
    assert response.status_code == 503
    assert response.json()["code"] == "cnb_storage_unavailable"
