"""Shared public models used across HIAP-MEED API modules."""

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

RequestId = Annotated[
    str,
    Field(
        min_length=1,
        max_length=128,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]*$",
        description="Opaque caller correlation ID safe for headers and logs.",
    ),
]


class ApiRequestMeta(BaseModel):
    """Minimal caller-owned metadata accepted by workflow requests."""

    # Existing callers may still send the former, larger metadata envelope.
    # Ignore those fields so the backend contract can shrink without a coordinated
    # frontend release.
    model_config = ConfigDict(extra="ignore")

    requestId: RequestId


class ApiResponseMeta(BaseModel):
    """Server-owned metadata returned by successful business API responses."""

    model_config = ConfigDict(extra="forbid")

    requestId: RequestId
    generatedAtUtc: datetime = Field(
        description="UTC timestamp when the response was built."
    )
    totalRecords: int = Field(
        ge=0,
        description="Number of primary records returned by the operation.",
    )
