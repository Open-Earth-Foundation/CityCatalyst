from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

try:
    from sqlalchemy.dialects.postgresql import JSONB
except ImportError:  # pragma: no cover - fallback when PG dialect unavailable
    from sqlalchemy import JSON as JSONB  # type: ignore

from ...db import Base


class Thread(Base):
    __tablename__ = "threads"

    thread_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    inventory_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    context: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    messages: Mapped[List["Message"]] = relationship(
        "Message",
        back_populates="thread",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


from .message import Message  # noqa: E402  (circular import resolution)
