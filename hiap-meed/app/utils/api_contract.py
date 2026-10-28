"""Helpers for request correlation and public response metadata."""

from datetime import datetime, timezone
from uuid import uuid4

from app.models import ApiResponseMeta


def new_request_id() -> str:
    """Return a new opaque request correlation ID."""
    return str(uuid4())


def build_response_meta(*, request_id: str, total_records: int) -> ApiResponseMeta:
    """Build minimal server-owned metadata for a successful API response."""
    return ApiResponseMeta(
        requestId=request_id,
        generatedAtUtc=datetime.now(timezone.utc),
        totalRecords=total_records,
    )
