"""Database claim for a Concept Note chat reply."""

import logging
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.db.thread import Thread

logger = logging.getLogger(__name__)

REPLY_TURN_TIMEOUT_SECONDS = 12 * 60
REPLY_TURN_LEASE = timedelta(minutes=15)


async def reply_clock(session: AsyncSession) -> datetime:
    if session.get_bind().dialect.name == "postgresql":
        return await session.scalar(select(func.clock_timestamp()))
    return datetime.now(UTC)


def reply_in_progress(thread: Thread, now: datetime) -> bool:
    expires_at = thread.reply_turn_expires_at
    return (
        thread.reply_turn_id is not None
        and expires_at is not None
        and expires_at.replace(tzinfo=expires_at.tzinfo or UTC) > now
    )


async def claim_reply_turn(session: AsyncSession, thread: Thread) -> UUID:
    """Claim while the caller holds the thread row lock."""
    now = await reply_clock(session)
    if reply_in_progress(thread, now):
        raise HTTPException(
            409,
            detail={
                "code": "concept_note_reply_in_progress",
                "message": "Clima is still replying.",
            },
        )
    turn_id = uuid4()
    thread.reply_turn_id = turn_id
    thread.reply_turn_expires_at = now + REPLY_TURN_LEASE
    return turn_id


async def release_reply_turn(
    session_factory: async_sessionmaker[AsyncSession],
    thread_id: UUID,
    turn_id: UUID,
) -> None:
    try:
        async with session_factory() as session, session.begin():
            await session.execute(
                update(Thread)
                .where(Thread.thread_id == thread_id, Thread.reply_turn_id == turn_id)
                .values(
                    reply_turn_id=None,
                    reply_turn_expires_at=None,
                    last_updated=Thread.last_updated,
                )
            )
    except Exception:
        logger.exception(
            "Failed to release Concept Note reply turn thread_id=%s", thread_id
        )
