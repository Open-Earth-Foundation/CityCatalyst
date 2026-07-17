from __future__ import annotations

import hashlib
import re
from collections.abc import AsyncIterator
from uuid import UUID

from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.config import get_settings
from app.models.concept_note_markdown import (
    ConceptNoteMarkdownRequest,
    ConceptNoteMarkdownResponse,
)
from app.repositories.concept_note_markdown import (
    ConceptNoteMarkdownRepository,
    ConceptNoteMarkdownRepositoryError,
    get_concept_note_markdown_repository,
)
from app.services.citycatalyst_client import (
    CityCatalystClient,
    CityCatalystClientError,
)


router = APIRouter()
PAGE_MARKER = re.compile(r"<!-- page: (\d+) -->")


async def get_citycatalyst_client() -> AsyncIterator[CityCatalystClient]:
    """Provide and close the CC client used for opaque bearer validation."""
    client = CityCatalystClient()
    try:
        yield client
    finally:
        await client.close()


def problem(status_code: int, code: str, message: str) -> JSONResponse:
    """Return a stable machine-readable Markdown-ingest error."""
    return JSONResponse(
        status_code=status_code,
        content={"code": code, "detail": message, "status": status_code},
        media_type="application/problem+json",
    )


async def read_limited_body(request: Request, max_bytes: int) -> bytes | None:
    """Stream a request body, returning ``None`` once the byte limit is exceeded."""
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > max_bytes:
            return None
        body.extend(chunk)
    return bytes(body)


def validate_markdown(payload: ConceptNoteMarkdownRequest) -> str | None:
    """Validate digest, page markers, page count, and non-empty content."""
    # Validate the immutable artifact identity.
    digest = hashlib.sha256(payload.markdown.encode("utf-8")).hexdigest()
    if digest != payload.sha256:
        return "markdown_digest_mismatch"

    # Validate ordered page markers without allocating an expected page range.
    if not payload.markdown.lstrip().startswith("<!-- page: 1 -->"):
        return "invalid_markdown_pages"
    marker_count = 0
    for marker_count, match in enumerate(
        PAGE_MARKER.finditer(payload.markdown), start=1
    ):
        if int(match.group(1)) != marker_count:
            return "invalid_markdown_pages"
    if marker_count != payload.page_count:
        return "invalid_markdown_pages"

    # Require content beyond the page separators.
    content = PAGE_MARKER.sub("", payload.markdown)
    if not content.strip():
        return "empty_markdown"
    return None


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
    cc_client: CityCatalystClient = Depends(get_citycatalyst_client),
) -> JSONResponse | ConceptNoteMarkdownResponse:
    """Validate and atomically register CC-produced Markdown for a CNB run."""
    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Bearer ") or not authorization[7:].strip():
        return problem(401, "invalid_bearer_token", "Bearer token is required")
    if "application/json" not in request.headers.get("Content-Type", ""):
        return problem(
            415,
            "unsupported_media_type",
            "Content-Type must be application/json",
        )

    settings = get_settings()
    max_bytes = settings.cnb_markdown_request_max_bytes
    content_length = request.headers.get("Content-Length")
    if content_length:
        try:
            declared_size = int(content_length)
        except ValueError:
            return problem(400, "invalid_content_length", "Content-Length is invalid")
        if declared_size < 0:
            return problem(400, "invalid_content_length", "Content-Length is invalid")
        if declared_size > max_bytes:
            return problem(
                413,
                "markdown_request_too_large",
                "JSON request exceeds the configured maximum",
            )

    # Authenticate before consuming, parsing, or hashing the request body.
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
        return problem(status_code, code, message)

    # Enforce the limit while consuming bodies without a trustworthy size header.
    body = await read_limited_body(request, max_bytes)
    if body is None:
        return problem(
            413,
            "markdown_request_too_large",
            "JSON request exceeds the configured maximum",
        )
    try:
        payload = ConceptNoteMarkdownRequest.model_validate_json(body)
    except ValidationError:
        return problem(422, "invalid_markdown_payload", "Markdown payload is invalid")

    validation_error = validate_markdown(payload)
    if validation_error:
        return problem(422, validation_error, "Markdown validation failed")

    try:
        await repository.register_markdown(
            user_id=user_id,
            run_id=run_id,
            upload_id=upload_id,
            payload=payload,
        )
    except ConceptNoteMarkdownRepositoryError as exc:
        return problem(
            exc.status_code, exc.code, "Unable to register markdown at this time"
        )

    return ConceptNoteMarkdownResponse(upload_id=upload_id)
