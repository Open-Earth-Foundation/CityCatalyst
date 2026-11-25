"""Shared public models used across HIAP Brazil v3 API modules."""

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
    """Caller-owned metadata accepted by workflow requests."""

    model_config = ConfigDict(extra="ignore")

    requestId: RequestId


class ApiResponseMeta(BaseModel):
    """Server-owned metadata returned by successful business API responses.

    While the methodology is a scaffold, `mock` is always true and
    `methodologyStatus` is always "scaffold": the ranking is fictitious.
    """

    model_config = ConfigDict(extra="forbid")

    requestId: RequestId
    generatedAtUtc: datetime = Field(
        description="UTC timestamp when the response was built."
    )
    totalRecords: int = Field(
        ge=0,
        description="Number of primary records returned by the operation.",
    )
    mock: bool = Field(
        description="True when the returned data is fictitious scaffold data."
    )
    methodologyStatus: str = Field(
        description="Lifecycle of the methodology behind the response, e.g. scaffold."
    )
