from __future__ import annotations

import hashlib
import json
from dataclasses import replace
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from app.config import get_settings
from app.main import get_app
from app.models.cnb.concept_note_markdown import (
    STRUCTURED_DOCUMENT_SCHEMA_VERSION,
    ConceptNoteMarkdownRequest,
    ConceptNoteUploadCreateRequest,
)
from app.persistence.concept_notes.markdown import (
    ConceptNoteMarkdownRepository,
    ConceptNoteMarkdownRepositoryError,
    ConceptNoteUploadSnapshot,
    get_concept_note_markdown_repository,
)
from app.routes.concept_note_markdown import (
    JSON_REQUEST_MAX_BYTES,
    get_citycatalyst_client,
)
from app.services.citycatalyst_client import (
    CityCatalystClientError,
    ConceptNoteMarkdownArtifact,
    ConceptNoteStructuredArtifact,
)
from app.services.cnb.context_bundle import get_context_bundle_service
from fastapi.testclient import TestClient

MARKDOWN = "<!-- page: 1 -->\n# Plan"
SHA256 = hashlib.sha256(MARKDOWN.encode()).hexdigest()
S3_KEY = "pdf-ocr/results/concept_note_upload/upload/1/combined_markdown.md"
STRUCTURED_KEY = (
    "pdf-ocr/results/concept_note_upload/upload/1/document.structured.json"
)
STRUCTURED_BODY = {
    "schema_version": STRUCTURED_DOCUMENT_SCHEMA_VERSION,
    "annotation_mode": "visual_context",
    "document": {"page_count": 1, "pages": [], "relationships": []},
}
STRUCTURED_BYTES = json.dumps(STRUCTURED_BODY).encode()
STRUCTURED_SHA = hashlib.sha256(STRUCTURED_BYTES).hexdigest()


class FakeCityCatalystClient:
    """Resolve opaque identities and serve a controlled CC Markdown artifact."""

    def __init__(self) -> None:
        self.artifact = ConceptNoteMarkdownArtifact(
            markdown=MARKDOWN,
            markdown_s3_key=S3_KEY,
            sha256=SHA256,
            page_count=1,
        )
        self.markdown_error: CityCatalystClientError | None = None
        self.structured_reads = 0
        self.structured = ConceptNoteStructuredArtifact(
            body=STRUCTURED_BODY,
            raw_bytes=STRUCTURED_BYTES,
            content_type="application/json; charset=utf-8",
            s3_key=STRUCTURED_KEY,
            sha256=STRUCTURED_SHA,
            schema_version=STRUCTURED_DOCUMENT_SCHEMA_VERSION,
            annotation_mode="visual_context",
            page_count=1,
            upload_id="",
        )

    async def validate_user_identity(self, token: str) -> str:
        if token == "invalid":
            raise CityCatalystClientError("invalid", status_code=401)
        return token

    async def get_concept_note_markdown(
        self,
        *,
        upload_id: str,
        token: str,
    ) -> ConceptNoteMarkdownArtifact:
        if self.markdown_error:
            raise self.markdown_error
        return self.artifact

    async def get_concept_note_structured(
        self,
        *,
        upload_id: str,
        token: str,
    ) -> ConceptNoteStructuredArtifact:
        self.structured_reads += 1
        return replace(self.structured, upload_id=upload_id)


class FakeMarkdownRepository(ConceptNoteMarkdownRepository):
    """In-memory implementation of the authoritative upload lifecycle."""

    def __init__(self, run_id: UUID, owner_id: str) -> None:
        self.run_id = run_id
        self.owner_id = owner_id
        self.uploads: dict[UUID, ConceptNoteUploadSnapshot] = {}

    def authorize(self, user_id: str, run_id: UUID) -> None:
        if run_id != self.run_id:
            raise ConceptNoteMarkdownRepositoryError(
                "concept_note_run_not_found", 404, "Run not found"
            )
        if user_id != self.owner_id:
            raise ConceptNoteMarkdownRepositoryError(
                "concept_note_run_forbidden", 403, "Run owner does not match"
            )

    async def create_upload(
        self,
        *,
        user_id: str,
        run_id: UUID,
        payload: ConceptNoteUploadCreateRequest,
    ) -> ConceptNoteUploadSnapshot:
        self.authorize(user_id, run_id)
        existing = self.uploads.get(payload.upload_id)
        if existing:
            if (
                existing.filename != payload.filename
                or existing.source_label != payload.source_label
                or existing.source_format != payload.source_format
            ):
                raise ConceptNoteMarkdownRepositoryError(
                    "upload_identity_conflict", 409, "Upload changed"
                )
            return existing
        snapshot = ConceptNoteUploadSnapshot(
            upload_id=payload.upload_id,
            run_id=run_id,
            user_id=user_id,
            filename=payload.filename,
            source_label=payload.source_label,
            source_format=payload.source_format,
            markdown_s3_key=None,
            markdown_sha256=None,
            page_count=None,
            status="queued",
            error_code=None,
            received_at=datetime.now(UTC),
            completed_at=None,
        )
        self.uploads[payload.upload_id] = snapshot
        return snapshot

    async def get_upload(
        self,
        *,
        user_id: str,
        run_id: UUID,
        upload_id: UUID,
    ) -> ConceptNoteUploadSnapshot:
        self.authorize(user_id, run_id)
        try:
            return self.uploads[upload_id]
        except KeyError as exc:
            raise ConceptNoteMarkdownRepositoryError(
                "concept_note_upload_not_found", 404, "Upload not found"
            ) from exc

    async def register_markdown(
        self,
        *,
        user_id: str,
        run_id: UUID,
        upload_id: UUID,
        payload: ConceptNoteMarkdownRequest,
    ) -> ConceptNoteUploadSnapshot:
        current = await self.get_upload(
            user_id=user_id,
            run_id=run_id,
            upload_id=upload_id,
        )
        if current.markdown_sha256:
            if (
                current.markdown_s3_key != payload.markdown_s3_key
                or current.markdown_sha256 != payload.sha256
                or current.page_count != payload.page_count
            ):
                raise ConceptNoteMarkdownRepositoryError(
                    "markdown_identity_conflict", 409, "Markdown changed"
                )
            current_structured = (
                current.annotation_mode,
                current.structured_s3_key,
                current.structured_sha256,
                current.structured_size_bytes,
                current.structured_schema_version,
            )
            incoming_structured = (
                payload.annotation_mode,
                payload.structured_s3_key,
                payload.structured_sha256,
                payload.structured_size_bytes,
                payload.structured_schema_version,
            )
            if current_structured != incoming_structured:
                raise ConceptNoteMarkdownRepositoryError(
                    "structured_identity_conflict", 409, "Structured identity changed"
                )
            return current
        updated = replace(
            current,
            markdown_s3_key=payload.markdown_s3_key,
            markdown_sha256=payload.sha256,
            source_format=payload.source_format,
            page_count=payload.page_count,
            annotation_mode=payload.annotation_mode,
            structured_s3_key=payload.structured_s3_key,
            structured_sha256=payload.structured_sha256,
            structured_size_bytes=payload.structured_size_bytes,
            structured_schema_version=payload.structured_schema_version,
            status="ready",
            completed_at=datetime.now(UTC),
        )
        self.uploads[upload_id] = updated
        return updated

    async def mark_failed(
        self,
        *,
        user_id: str,
        run_id: UUID,
        upload_id: UUID,
        error_code: str,
    ) -> ConceptNoteUploadSnapshot:
        current = await self.get_upload(
            user_id=user_id,
            run_id=run_id,
            upload_id=upload_id,
        )
        updated = replace(current, status="failed", error_code=error_code)
        self.uploads[upload_id] = updated
        return updated

    async def retry_upload(
        self,
        *,
        user_id: str,
        run_id: UUID,
        upload_id: UUID,
    ) -> ConceptNoteUploadSnapshot:
        current = await self.get_upload(
            user_id=user_id,
            run_id=run_id,
            upload_id=upload_id,
        )
        if current.status == "ready":
            raise ConceptNoteMarkdownRepositoryError(
                "upload_not_retryable", 409, "Ready upload"
            )
        updated = replace(current, status="queued", error_code=None)
        self.uploads[upload_id] = updated
        return updated

    async def get_delivery_context(
        self,
        *,
        upload_id: UUID,
    ) -> ConceptNoteUploadSnapshot:
        try:
            return self.uploads[upload_id]
        except KeyError as exc:
            raise ConceptNoteMarkdownRepositoryError(
                "concept_note_upload_not_found", 404, "Upload not found"
            ) from exc


def create_payload(upload_id: UUID) -> dict[str, object]:
    return {
        "upload_id": str(upload_id),
        "user_id": "owner-user",
        "filename": "plan.pdf",
        "source_label": "Climate Action Plan",
        "source_format": "pdf",
    }


def pointer_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "markdown_s3_key": S3_KEY,
        "filename": "plan.pdf",
        "source_label": "Climate Action Plan",
        "source_format": "pdf",
        "page_count": 1,
        "sha256": SHA256,
        "annotation_mode": "visual_context",
        "structured_s3_key": STRUCTURED_KEY,
        "structured_sha256": STRUCTURED_SHA,
        "structured_size_bytes": len(STRUCTURED_BYTES),
        "structured_schema_version": STRUCTURED_DOCUMENT_SCHEMA_VERSION,
    }
    payload.update(overrides)
    return payload


def legacy_pointer_payload(**overrides: object) -> dict[str, object]:
    """Return a PDF delivery candidate with no structured artifact identity."""
    payload = pointer_payload()
    payload.update(
        {
            "annotation_mode": None,
            "structured_s3_key": None,
            "structured_sha256": None,
            "structured_size_bytes": None,
            "structured_schema_version": None,
            **overrides,
        }
    )
    return payload


@pytest.fixture
def ingest_client(monkeypatch):
    run_id = uuid4()
    repository = FakeMarkdownRepository(run_id, "owner-user")
    cc_client = FakeCityCatalystClient()
    app = get_app()
    app.dependency_overrides[get_citycatalyst_client] = lambda: cc_client
    app.dependency_overrides[get_concept_note_markdown_repository] = lambda: repository
    app.dependency_overrides[get_context_bundle_service] = lambda: object()
    scheduled_builds: list[dict[str, object]] = []
    monkeypatch.setattr(
        "app.routes.concept_note_markdown.schedule_context_bundle_build",
        lambda **kwargs: scheduled_builds.append(kwargs),
    )
    cc_client.scheduled_builds = scheduled_builds
    settings = get_settings()
    original_key = settings.cc_api_key
    settings.cc_api_key = "service-key"
    with TestClient(app) as client:
        yield client, repository, cc_client, run_id
    settings.cc_api_key = original_key
    app.dependency_overrides.clear()


def auth(token: str = "owner-user") -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def create_upload(client: TestClient, run_id: UUID, upload_id: UUID):
    return client.post(
        f"/v1/concept-notes/{run_id}/uploads",
        json=create_payload(upload_id),
        headers=auth(),
    )


def test_create_requires_auth_and_run_owner(ingest_client) -> None:
    client, _, _, run_id = ingest_client
    upload_id = uuid4()
    assert (
        client.post(
            f"/v1/concept-notes/{run_id}/uploads",
            json=create_payload(upload_id),
        ).status_code
        == 401
    )
    assert (
        client.post(
            f"/v1/concept-notes/{run_id}/uploads",
            json=create_payload(upload_id),
            headers=auth("other-user"),
        ).status_code
        == 403
    )


def test_create_is_idempotent_and_metadata_is_immutable(ingest_client) -> None:
    client, _, _, run_id = ingest_client
    upload_id = uuid4()
    assert create_upload(client, run_id, upload_id).status_code == 200
    assert create_upload(client, run_id, upload_id).status_code == 200
    changed = create_payload(upload_id)
    changed["filename"] = "changed.pdf"
    response = client.post(
        f"/v1/concept-notes/{run_id}/uploads",
        json=changed,
        headers=auth(),
    )
    assert response.status_code == 409
    assert response.json()["code"] == "upload_identity_conflict"


def test_json_body_limit_applies_without_content_length(ingest_client) -> None:
    client, _, _, run_id = ingest_client
    body = iter(
        [
            b'{"padding":"',
            b"a" * JSON_REQUEST_MAX_BYTES,
            b'"}',
        ]
    )

    response = client.post(
        f"/v1/concept-notes/{run_id}/uploads",
        content=body,
        headers={**auth(), "Content-Type": "application/json"},
    )

    assert response.status_code == 413
    assert response.json()["code"] == "upload_request_too_large"


def test_json_body_limit_rejects_declared_oversize_before_reading(
    ingest_client,
) -> None:
    client, _, _, run_id = ingest_client

    response = client.post(
        f"/v1/concept-notes/{run_id}/uploads",
        content=b"{}",
        headers={
            **auth(),
            "Content-Type": "application/json",
            "Content-Length": str(JSON_REQUEST_MAX_BYTES + 1),
        },
    )

    assert response.status_code == 413
    assert response.json()["code"] == "upload_request_too_large"


def test_pointer_delivery_verifies_cc_then_persists_ready(ingest_client) -> None:
    client, repository, cc_client, run_id = ingest_client
    upload_id = uuid4()
    create_upload(client, run_id, upload_id)
    path = f"/v1/concept-notes/{run_id}/uploads/{upload_id}/markdown"

    first = client.post(path, json=pointer_payload(), headers=auth())
    second = client.post(path, json=pointer_payload(), headers=auth())

    assert first.status_code == second.status_code == 202
    assert first.json() == {"upload_id": str(upload_id), "status": "ready"}
    assert repository.uploads[upload_id].markdown_s3_key == S3_KEY
    assert repository.uploads[upload_id].status == "ready"
    assert [item["run_id"] for item in cc_client.scheduled_builds] == [
        run_id,
        run_id,
    ]
    assert all(item["token"] == "owner-user" for item in cc_client.scheduled_builds)


def test_verified_legacy_pdf_delivery_is_markdown_only_and_idempotent(
    ingest_client,
) -> None:
    client, repository, cc_client, run_id = ingest_client
    upload_id = uuid4()
    create_upload(client, run_id, upload_id)
    cc_client.artifact = replace(
        cc_client.artifact,
        legacy_markdown_only=True,
    )
    path = f"/v1/concept-notes/{run_id}/uploads/{upload_id}/markdown"
    payload = legacy_pointer_payload()

    first = client.post(path, json=payload, headers=auth())
    replay = client.post(path, json=payload, headers=auth())

    assert first.status_code == replay.status_code == 202
    stored = repository.uploads[upload_id]
    assert stored.status == "ready"
    assert stored.markdown_s3_key == S3_KEY
    assert stored.markdown_sha256 == SHA256
    assert stored.page_count == 1
    assert stored.annotation_mode is None
    assert stored.structured_s3_key is None
    assert stored.structured_sha256 is None
    assert stored.structured_size_bytes is None
    assert stored.structured_schema_version is None
    assert cc_client.structured_reads == 0


@pytest.mark.parametrize("legacy_marker", [False, None])
def test_pdf_without_structured_artifact_requires_cc_legacy_attestation(
    ingest_client,
    legacy_marker: bool | None,
) -> None:
    client, repository, cc_client, run_id = ingest_client
    upload_id = uuid4()
    create_upload(client, run_id, upload_id)
    if legacy_marker is not None:
        cc_client.artifact = replace(
            cc_client.artifact,
            legacy_markdown_only=legacy_marker,
        )

    response = client.post(
        f"/v1/concept-notes/{run_id}/uploads/{upload_id}/markdown",
        json=legacy_pointer_payload(),
        headers=auth(),
    )

    assert response.status_code == 422
    assert response.json()["code"] == "structured_metadata_incomplete"
    assert repository.uploads[upload_id].status == "queued"
    assert cc_client.structured_reads == 0


def test_legacy_markdown_pointer_conflict_is_rejected_on_replay(ingest_client) -> None:
    client, _, cc_client, run_id = ingest_client
    upload_id = uuid4()
    create_upload(client, run_id, upload_id)
    cc_client.artifact = replace(cc_client.artifact, legacy_markdown_only=True)
    path = f"/v1/concept-notes/{run_id}/uploads/{upload_id}/markdown"
    assert (
        client.post(path, json=legacy_pointer_payload(), headers=auth()).status_code
        == 202
    )

    response = client.post(
        path,
        json=legacy_pointer_payload(page_count=2),
        headers=auth(),
    )

    assert response.status_code == 409
    assert response.json()["code"] == "markdown_identity_conflict"


def test_native_markdown_delivery_has_no_synthetic_page_count(ingest_client) -> None:
    client, repository, cc_client, run_id = ingest_client
    upload_id = uuid4()
    native_markdown = "# Plan\n\nDirect source context"
    digest = hashlib.sha256(native_markdown.encode()).hexdigest()
    create = create_payload(upload_id)
    create.update(
        {
            "filename": "plan.md",
            "source_format": "markdown",
        }
    )
    created = client.post(
        f"/v1/concept-notes/{run_id}/uploads",
        json=create,
        headers=auth(),
    )
    assert created.status_code == 200
    cc_client.artifact = ConceptNoteMarkdownArtifact(
        markdown=native_markdown,
        markdown_s3_key=S3_KEY,
        sha256=digest,
        source_format="markdown",
        page_count=None,
    )

    response = client.post(
        f"/v1/concept-notes/{run_id}/uploads/{upload_id}/markdown",
        json={
            "markdown_s3_key": S3_KEY,
            "filename": "plan.md",
            "source_label": "Climate Action Plan",
            "source_format": "markdown",
            "page_count": None,
            "sha256": digest,
        },
        headers=auth(),
    )

    assert response.status_code == 202
    assert repository.uploads[upload_id].source_format == "markdown"
    assert repository.uploads[upload_id].page_count is None


def test_pointer_or_fetched_bytes_conflict_is_rejected(ingest_client) -> None:
    client, _, cc_client, run_id = ingest_client
    upload_id = uuid4()
    create_upload(client, run_id, upload_id)
    path = f"/v1/concept-notes/{run_id}/uploads/{upload_id}/markdown"

    response = client.post(
        path,
        json=pointer_payload(markdown_s3_key="different/key.md"),
        headers=auth(),
    )
    assert response.status_code == 409
    assert response.json()["code"] == "markdown_identity_conflict"

    cc_client.artifact = replace(cc_client.artifact, markdown="# Tampered")
    response = client.post(path, json=pointer_payload(), headers=auth())
    assert response.status_code == 422
    assert response.json()["code"] == "markdown_digest_mismatch"


def test_terminal_cc_verification_error_is_not_made_retryable(ingest_client) -> None:
    client, _, cc_client, run_id = ingest_client
    upload_id = uuid4()
    create_upload(client, run_id, upload_id)
    cc_client.markdown_error = CityCatalystClientError(
        "Stored Markdown failed its integrity check",
        status_code=409,
    )

    response = client.post(
        f"/v1/concept-notes/{run_id}/uploads/{upload_id}/markdown",
        json=pointer_payload(),
        headers=auth(),
    )

    assert response.status_code == 409
    assert response.json()["code"] == "cc_markdown_verification_failed"


def test_failure_status_and_retry_lifecycle(ingest_client) -> None:
    client, _, _, run_id = ingest_client
    upload_id = uuid4()
    create_upload(client, run_id, upload_id)
    base = f"/v1/concept-notes/{run_id}/uploads/{upload_id}"

    failed = client.post(
        f"{base}/failed",
        json={"error_code": "mistral_unavailable"},
        headers=auth(),
    )
    assert failed.json()["status"] == "failed"
    status_response = client.get(base, headers=auth())
    assert status_response.json()["error_code"] == "mistral_unavailable"
    retried = client.post(f"{base}/retry", headers=auth())
    assert retried.json()["status"] == "queued"


def test_delivery_context_requires_reverse_service_key(ingest_client) -> None:
    client, _, _, run_id = ingest_client
    upload_id = uuid4()
    create_upload(client, run_id, upload_id)
    path = f"/v1/concept-note-uploads/{upload_id}/delivery-context"

    assert client.get(path).status_code == 401
    response = client.get(path, headers={"X-CC-Service-Key": "service-key"})
    assert response.status_code == 200
    assert response.json()["run_id"] == str(run_id)
    assert response.json()["user_id"] == "owner-user"


def test_delivery_context_audits_rejected_key_without_logging_credential(
    ingest_client,
    caplog: pytest.LogCaptureFixture,
) -> None:
    client, _, _, run_id = ingest_client
    upload_id = uuid4()
    create_upload(client, run_id, upload_id)
    supplied_key = "unexpected-service-key"
    path = f"/v1/concept-note-uploads/{upload_id}/delivery-context"

    with caplog.at_level("WARNING", logger="app.routes.concept_note_markdown"):
        response = client.get(path, headers={"X-CC-Service-Key": supplied_key})

    assert response.status_code == 401
    assert response.json()["code"] == "invalid_service_key"
    assert str(upload_id) in caplog.text
    assert supplied_key not in caplog.text
