from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID

from ...db import Base


class Thread(Base):
    __tablename__ = "threads"

    thread_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    inventory_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    context: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    last_updated: Mapped[datetime] = mapped_column(
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

    def get_access_token(self) -> Optional[str]:
        """Extract JWT access token from thread context.
        
        Thread context should have structure:
        {
            "access_token": "eyJ...",
            "expires_at": "2025-01-01T12:00:00+00:00",
            "issued_at": "2025-01-01T10:00:00+00:00"
        }
        
        Returns:
            Access token string or None if not present
        """
        if not self.context or not isinstance(self.context, dict):
            return None
        return self.context.get("access_token")
    
    def has_access_token(self) -> bool:
        """Check if thread has a valid access token in context."""
        return self.get_access_token() is not None


from .message import Message  # noqa: E402  (circular import resolution)
