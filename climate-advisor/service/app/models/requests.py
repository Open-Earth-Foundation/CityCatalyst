from typing import Any, Optional
from pydantic import BaseModel, Field


class ThreadCreateRequest(BaseModel):
    user_id: str = Field(..., min_length=1)
    inventory_id: Optional[str] = None
    context: Optional[Any] = None


class MessageCreateRequest(BaseModel):
    user_id: str = Field(..., min_length=1)
    content: str = Field(..., min_length=1)
    thread_id: Optional[str] = None
    inventory_id: Optional[str] = None
    context: Optional[Any] = None
    options: Optional[dict] = None

