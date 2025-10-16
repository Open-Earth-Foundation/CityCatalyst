from typing import Any, Optional
from uuid import UUID
from pydantic import BaseModel


class ThreadCreateResponse(BaseModel):
    thread_id: UUID
    inventory_id: Optional[str] = None
    context: Optional[Any] = None


class ProblemDetails(BaseModel):
    type: str
    title: str
    status: int
    detail: str | None = None
    instance: str | None = None
    request_id: str | None = None

