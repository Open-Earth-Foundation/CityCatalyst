from datetime import datetime
from typing import Any, Literal, Optional
from uuid import UUID
from pydantic import BaseModel


class ThreadCreateResponse(BaseModel):
    thread_id: UUID
    inventory_id: Optional[str] = None
    context: Optional[Any] = None


class ThreadMessageVisual(BaseModel):
    title: str
    html: str


class ThreadMessageResponse(BaseModel):
    message_id: UUID
    role: str
    text: str
    created_at: datetime
    # Successful CNB render-visual results stored with this message.
    visuals: list[ThreadMessageVisual] = []
    choices: list[str] | None = None
    # What choosing does: "reply" answers only; "propose_edit" prepares a change.
    choice_action: Literal["reply", "propose_edit"] | None = None


class ThreadMessagesResponse(BaseModel):
    thread_id: UUID
    messages: list[ThreadMessageResponse]
    reply_in_progress: bool = False


class ProblemDetails(BaseModel):
    type: str
    title: str
    status: int
    detail: str | None = None
    instance: str | None = None
    request_id: str | None = None

