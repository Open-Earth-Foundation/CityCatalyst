from __future__ import annotations

import hashlib
import hmac
import logging
import re
from collections.abc import AsyncIterator
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.config import get_settings
from app.models.concept_note_markdown import (
    ConceptNoteMarkdownRequest,
    ConceptNoteMarkdownResponse,
    ConceptNoteUploadCreateRequest,
    ConceptNoteUploadDeliveryContext,
    ConceptNoteUploadFailureRequest,
    ConceptNoteUploadStatusResponse,
)
from app.persistence.concept_notes.markdown import (
    ConceptNoteMarkdownRepository,
    ConceptNoteMarkdownRepositoryError,
    ConceptNoteUploadSnapshot,
    get_concept_note_markdown_repository,
)
from app.services.citycatalyst_client import (
    CityCatalystClient,
    CityCatalystClientError,
    ConceptNoteMarkdownArtifact,
)
from app.services.cnb.context_bundle import (
    ContextBundleService,
    get_context_bundle_service,
    schedule_context_bundle_build,
)


logger = logging.getLogger(__name__)
router = APIRouter()
PAGE_MARKER = re.compile(r"<!-- page: (\d+) -->")
JSON_REQUEST_MAX_BYTES = 16 * 1024


async def get_citycatalyst_client() -> AsyncIterator[CityCatalystClient]:
    """Provide and close the CC client used for identity and artifact checks."""
    client = CityCatalystClient()
    try:
        yield client
    finally:
        await client.close()


def problem(status_code: int, code: str, message: str) -> JSONResponse:
    """Return a stable machine-readable CNB upload error."""
    return JSONResponse(
        status_code=status_code,
        content={"code": code, "detail": message, "status": status_code},
        media_type="application/problem+json",
    )


async def authenticate_user(
    request: Request,
    cc_client: CityCatalystClient,
) -> tuple[str | None, JSONResponse | None]:
    """Resolve the canonical CC user before any stateful repository action."""
    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Bearer ") or not authorization[7:].strip():
        return None, problem(401, "invalid_bearer_token", "Bearer token is required")
    try:
        user_id = await cc_client.validate_user_identity(authorization[7:].strip())
    except CityCatalystClientError as exc:
        status_code = 401 if exc.status_code in (401, 403) else 503
        code = (
            "invalid_bearer_token" if status_code == 401 else "cc_identity_unavailable"
        )
        message = (
            "Bearer token is invalid or expired"
            if status_code == 401
            else "Identity service is temporarily unavailable"
        )
        return None, problem(status_code, code, message)
    return user_id, None


async def read_json_model(
    request: Request,
    model_type: type[Any],
) -> Any | JSONResponse:
    """Read a bounded JSON body and parse one strict Pydantic model."""
    content_type = request.headers.get("Content-Type", "")
    if content_type.split(";", 1)[0].strip().lower() != "application/json":
        return problem(
            415,
            "unsupported_media_type",
            "Content-Type must be application/json",
        )

    # Reject a trustworthy declared size before allocating the request body.
    content_length = request.headers.get("Content-Length")
    if content_length:
        try:
            declared_size = int(content_length)
        except ValueError:
            return problem(400, "invalid_content_length", "Content-Length is invalid")
        if declared_size < 0:
            return problem(400, "invalid_content_length", "Content-Length is invalid")
        if declared_size > JSON_REQUEST_MAX_BYTES:
            return problem(
                413,
                "upload_request_too_large",
                "JSON request exceeds the allowed maximum",
            )

    # Apply the same bound while consuming chunked or misdeclared requests.
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > JSON_REQUEST_MAX_BYTES:
            return problem(
                413,
                "upload_request_too_large",
                "JSON request exceeds the allowed maximum",
            )
        body.extend(chunk)

    # Parse only the authenticated, bounded payload.
    try:
        return model_type.model_validate_json(body)
    except (ValidationError, ValueError):
        return problem(422, "invalid_upload_payload", "Upload payload is invalid")


def validate_markdown_artifact(
    artifact: ConceptNoteMarkdownArtifact,
    payload: ConceptNoteMarkdownRequest,
) -> str | None:
    """Validate the fetched artifact and immutable pointer identity."""
    if (
        artifact.markdown_s3_key != payload.markdown_s3_key
        or artifact.sha256 != payload.sha256
        or artifact.page_count != payload.page_count
    ):
        return "markdown_identity_conflict"

    digest = hashlib.sha256(artifact.markdown.encode("utf-8")).hexdigest()
    if digest != payload.sha256:
        return "markdown_digest_mismatch"
    if not artifact.markdown.lstrip().startswith("<!-- page: 1 -->"):
        return "invalid_markdown_pages"

    marker_count = 0
    for marker_count, match in enumerate(
        PAGE_MARKER.finditer(artifact.markdown), start=1
    ):
        if int(match.group(1)) != marker_count:
            return "invalid_markdown_pages"
    if marker_count != payload.page_count:
        return "invalid_markdown_pages"
    if not PAGE_MARKER.sub("", artifact.markdown).strip():
        return "empty_markdown"
    return None


def status_response(
    snapshot: ConceptNoteUploadSnapshot,
) -> ConceptNoteUploadStatusResponse:
    """Map persistence state to the safe CC-facing upload contract."""
    return ConceptNoteUploadStatusResponse(
        upload_id=snapshot.upload_id,
        run_id=snapshot.run_id,
        status=snapshot.status,
        filename=snapshot.filename,
        source_label=snapshot.source_label,
        page_count=snapshot.page_count,
        error_code=snapshot.error_code,
        received_at=snapshot.received_at,
        completed_at=snapshot.completed_at,
    )


@router.post(
    "/concept-notes/{run_id}/uploads",
    response_model=ConceptNoteMarkdownResponse,
)
async def create_concept_note_upload(
    run_id: UUID,
    request: Request,
    repository: ConceptNoteMarkdownRepository = Depends(
        get_concept_note_markdown_repository
    ),
    cc_client: CityCatalystClient = Depends(get_citycatalyst_client),
) -> JSONResponse | ConceptNoteMarkdownResponse:
    """Create or replay the authoritative pre-conversion upload row."""
    user_id, auth_error = await authenticate_user(request, cc_client)
    if auth_error:
        return auth_error
    payload = await read_json_model(request, ConceptNoteUploadCreateRequest)
    if isinstance(payload, JSONResponse):
        return payload
    if payload.user_id != user_id:
        return problem(403, "concept_note_upload_forbidden", "User identity mismatch")
    try:
        snapshot = await repository.create_upload(
            user_id=user_id,
            run_id=run_id,
            payload=payload,
        )
    except ConceptNoteMarkdownRepositoryError as exc:
        return problem(exc.status_code, exc.code, str(exc))
    return ConceptNoteMarkdownResponse(
        upload_id=snapshot.upload_id,
        status=snapshot.status,
    )


@router.get(
    "/concept-notes/{run_id}/uploads/{upload_id}",
    response_model=ConceptNoteUploadStatusResponse,
)
async def get_concept_note_upload(
    run_id: UUID,
    upload_id: UUID,
    request: Request,
    repository: ConceptNoteMarkdownRepository = Depends(
        get_concept_note_markdown_repository
    ),
    cc_client: CityCatalystClient = Depends(get_citycatalyst_client),
) -> JSONResponse | ConceptNoteUploadStatusResponse:
    """Return safe lifecycle metadata for one owned upload."""
    user_id, auth_error = await authenticate_user(request, cc_client)
    if auth_error:
        return auth_error
    try:
        snapshot = await repository.get_upload(
            user_id=user_id,
            run_id=run_id,
            upload_id=upload_id,
        )
    except ConceptNoteMarkdownRepositoryError as exc:
        return problem(exc.status_code, exc.code, str(exc))
    return status_response(snapshot)


@router.post(
    "/concept-notes/{run_id}/uploads/{upload_id}/markdown",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=ConceptNoteMarkdownResponse,
)
async def ingest_concept_note_markdown(
    run_id: UUID,
    upload_id: UUID,
    request: Request,
    repository: ConceptNoteMarkdownRepository = Depends(
        get_concept_note_markdown_repository
    ),
    context_bundle_service: ContextBundleService | None = Depends(
        get_context_bundle_service
    ),
    cc_client: CityCatalystClient = Depends(get_citycatalyst_client),
) -> JSONResponse | ConceptNoteMarkdownResponse:
    """Verify the CC object, then persist its immutable pointer as ready."""
    user_id, auth_error = await authenticate_user(request, cc_client)
    if auth_error:
        return auth_error
    payload = await read_json_model(request, ConceptNoteMarkdownRequest)
    if isinstance(payload, JSONResponse):
        return payload

    authorization = request.headers["Authorization"][7:].strip()
    try:
        artifact = await cc_client.get_concept_note_markdown(
            upload_id=str(upload_id),
            token=authorization,
        )
    except CityCatalystClientError as exc:
        status_code = exc.status_code if exc.status_code in (409, 413, 422) else 503
        return problem(
            status_code,
            "cc_markdown_verification_failed",
            "CC Markdown artifact could not be verified",
        )

    validation_error = validate_markdown_artifact(artifact, payload)
    if validation_error:
        status_code = 409 if validation_error == "markdown_identity_conflict" else 422
        return problem(status_code, validation_error, "Markdown verification failed")

    try:
        snapshot = await repository.register_markdown(
            user_id=user_id,
            run_id=run_id,
            upload_id=upload_id,
            payload=payload,
        )
    except ConceptNoteMarkdownRepositoryError as exc:
        return problem(exc.status_code, exc.code, str(exc))
    if context_bundle_service is not None:
        schedule_context_bundle_build(
            service=context_bundle_service,
            user_id=user_id,
            run_id=run_id,
            token=authorization,
        )
    else:
        logger.error(
            "Context-bundle build was not scheduled because storage is unavailable "
            "run_id=%s upload_id=%s",
            run_id,
            upload_id,
        )
    return ConceptNoteMarkdownResponse(
        upload_id=snapshot.upload_id,
        status=snapshot.status,
    )


@router.post(
    "/concept-notes/{run_id}/uploads/{upload_id}/failed",
    response_model=ConceptNoteMarkdownResponse,
)
async def mark_concept_note_upload_failed(
    run_id: UUID,
    upload_id: UUID,
    request: Request,
    repository: ConceptNoteMarkdownRepository = Depends(
        get_concept_note_markdown_repository
    ),
    cc_client: CityCatalystClient = Depends(get_citycatalyst_client),
) -> JSONResponse | ConceptNoteMarkdownResponse:
    """Persist a stable upload or OCR failure code."""
    user_id, auth_error = await authenticate_user(request, cc_client)
    if auth_error:
        return auth_error
    payload = await read_json_model(request, ConceptNoteUploadFailureRequest)
    if isinstance(payload, JSONResponse):
        return payload
    try:
        snapshot = await repository.mark_failed(
            user_id=user_id,
            run_id=run_id,
            upload_id=upload_id,
            error_code=payload.error_code,
        )
    except ConceptNoteMarkdownRepositoryError as exc:
        return problem(exc.status_code, exc.code, str(exc))
    return ConceptNoteMarkdownResponse(
        upload_id=snapshot.upload_id,
        status=snapshot.status,
    )


@router.post(
    "/concept-notes/{run_id}/uploads/{upload_id}/retry",
    response_model=ConceptNoteMarkdownResponse,
)
async def retry_concept_note_upload(
    run_id: UUID,
    upload_id: UUID,
    request: Request,
    repository: ConceptNoteMarkdownRepository = Depends(
        get_concept_note_markdown_repository
    ),
    cc_client: CityCatalystClient = Depends(get_citycatalyst_client),
) -> JSONResponse | ConceptNoteMarkdownResponse:
    """Return a failed authoritative upload row to queued state."""
    user_id, auth_error = await authenticate_user(request, cc_client)
    if auth_error:
        return auth_error
    try:
        snapshot = await repository.retry_upload(
            user_id=user_id,
            run_id=run_id,
            upload_id=upload_id,
        )
    except ConceptNoteMarkdownRepositoryError as exc:
        return problem(exc.status_code, exc.code, str(exc))
    return ConceptNoteMarkdownResponse(
        upload_id=snapshot.upload_id,
        status=snapshot.status,
    )


@router.get(
    "/concept-note-uploads/{upload_id}/delivery-context",
    response_model=ConceptNoteUploadDeliveryContext,
)
async def get_concept_note_delivery_context(
    upload_id: UUID,
    request: Request,
    repository: ConceptNoteMarkdownRepository = Depends(
        get_concept_note_markdown_repository
    ),
) -> JSONResponse | ConceptNoteUploadDeliveryContext:
    """Return delivery metadata to CC after reverse service authentication."""
    # Authenticate the reverse service without recording its credential.
    expected_key = get_settings().cc_api_key or ""
    supplied_key = request.headers.get("X-CC-Service-Key", "")
    if not expected_key or not hmac.compare_digest(expected_key, supplied_key):
        logger.warning(
            "Rejected CC delivery-context request for upload_id=%s",
            upload_id,
        )
        return problem(401, "invalid_service_key", "CC service authentication failed")

    # Return only the delivery metadata associated with the opaque upload ID.
    try:
        snapshot = await repository.get_delivery_context(upload_id=upload_id)
    except ConceptNoteMarkdownRepositoryError as exc:
        return problem(exc.status_code, exc.code, str(exc))
    return ConceptNoteUploadDeliveryContext(
        upload_id=snapshot.upload_id,
        run_id=snapshot.run_id,
        user_id=snapshot.user_id,
        filename=snapshot.filename,
        source_label=snapshot.source_label,
    )
