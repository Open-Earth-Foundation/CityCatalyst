"""Atomically bind explicit card replies to the latest saved CNB question."""

import logging
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.db.concept_note import ConceptNoteRun
from app.models.db.message import Message, MessageRole
from app.models.db.thread import Thread
from app.services.message_service import MessageService
from app.tools.concept_note_question import saved_question_choices
from app.utils.concept_note_context import extract_concept_note_run_id

logger = logging.getLogger(__name__)
QUESTION_MESSAGE_ID = "concept_note_question_message_id"
REPLY_MARKER = "concept_note_question_reply"
# Recover crashed workers; the claim ID fences late persistence after takeover.
CLAIM_LIFETIME = timedelta(minutes=15)


def thread_run_id(thread: Thread) -> str | None:
    """Read CNB scope from canonical thread data, including older context bindings."""
    return (
        str(thread.concept_note_run_id)
        if thread.concept_note_run_id
        else extract_concept_note_run_id(thread.context)
    )


async def cnb_message_time(session: AsyncSession, thread_id: UUID) -> datetime:
    """Order a CNB append after a row-lock wait using the database write clock."""
    # Callers hold the thread row lock. Transaction-start now() may predate a prior write.
    if session.get_bind().dialect.name == "postgresql":
        return await session.scalar(
            select(
                func.greatest(
                    func.clock_timestamp(),
                    func.max(Message.created_at) + timedelta(microseconds=1),
                )
            ).where(Message.thread_id == thread_id)
        )
    previous = await session.scalar(
        select(func.max(Message.created_at)).where(Message.thread_id == thread_id)
    )
    now = datetime.now(UTC)
    return (
        max(now, previous.replace(tzinfo=UTC) + timedelta(microseconds=1))
        if previous
        else now
    )


def question_message_id(context: object) -> UUID | None:
    """Read an explicit card binding; legacy ordinary messages omit it."""
    if not isinstance(context, dict) or QUESTION_MESSAGE_ID not in context:
        return None
    try:
        return UUID(context[QUESTION_MESSAGE_ID])
    except (TypeError, ValueError, AttributeError) as exc:
        raise stale_question() from exc


def stale_question() -> HTTPException:
    """Return the safe conflict shared by invalid, consumed and stale cards."""
    return HTTPException(
        409,
        detail={
            "code": "concept_note_question_stale",
            "message": "This question has changed or was already answered. Reload the conversation before replying.",
        },
    )


async def save_question_reply(
    session: AsyncSession,
    *,
    thread: Thread,
    question_id: UUID,
    content: str,
    retry: bool,
) -> tuple[UUID, str]:
    """Check and save one reply under the caller's thread row lock.

    A failed stream may retry the exact saved reply after releasing its claim.
    The claim prevents two simultaneous retries from starting two model turns.
    """
    # Require the canonical current CNB binding before reading the submitted card.
    run_id = thread_run_id(thread)
    try:
        run = (
            await session.scalar(
                select(ConceptNoteRun)
                .where(ConceptNoteRun.run_id == UUID(run_id))
                .with_for_update()
            )
            if run_id
            else None
        )
    except (TypeError, ValueError):
        raise stale_question() from None
    if (
        run is None
        or run.status != "active"
        or run.user_id != thread.user_id
        or run.thread_id != thread.thread_id
    ):
        raise stale_question()
    # Read only this owner's thread; the submitted identifier is never authority.
    question = await session.get(Message, question_id)
    if (
        question is None
        or question.thread_id != thread.thread_id
        or question.user_id != thread.user_id
        or question.role != MessageRole.ASSISTANT
        or not saved_question_choices(question.tools_used)
    ):
        raise stale_question()
    recent = list(
        await session.scalars(
            select(Message)
            .where(Message.thread_id == thread.thread_id)
            .order_by(Message.created_at.desc(), Message.message_id.desc())
            .limit(2)
        )
    )
    # Old rows may share transaction timestamps. Do not guess which card is current.
    if len(recent) == 2 and recent[0].created_at == recent[1].created_at:
        raise stale_question()
    latest = recent[0] if recent else None
    now = (
        await session.scalar(select(func.clock_timestamp()))
        if session.get_bind().dialect.name == "postgresql"
        else datetime.now(UTC)
    )
    marker = None
    if latest and isinstance(latest.tools_used, list):
        marker = next(
            (
                item
                for item in latest.tools_used
                if isinstance(item, dict) and item.get("name") == REPLY_MARKER
            ),
            None,
        )
    if latest and latest.message_id == question_id:
        reply = await MessageService(session).create_user_message(
            thread_id=thread.thread_id,
            user_id=thread.user_id,
            text=content,
            created_at=await cnb_message_time(session, thread.thread_id),
        )
    elif (
        retry
        and latest
        and latest.role == MessageRole.USER
        and latest.text == content
        and marker
        and marker.get("question_message_id") == str(question_id)
    ):
        # A live claim is a competing request, not a failed turn to replay.
        if marker.get("active") and marker.get("expires_at", "") > now.isoformat():
            raise stale_question()
        reply = latest
    else:
        raise stale_question()

    # Record provenance and the request claim on the reply, not mutable credentials.
    claim_id = str(uuid4())
    reply.tools_used = [
        {
            "name": REPLY_MARKER,
            "question_message_id": str(question_id),
            "claim_id": claim_id,
            "active": True,
            "expires_at": (now + CLAIM_LIFETIME).isoformat(),
        }
    ]
    await session.flush()
    return reply.message_id, claim_id


async def release_question_reply(
    session_factory: async_sessionmaker[AsyncSession] | None,
    claim: tuple[UUID, str] | None,
) -> None:
    """Release only this request's claim after completion, failure or disconnect."""
    if session_factory is None or claim is None:
        return
    try:
        async with session_factory() as session, session.begin():
            reply = await session.scalar(
                select(Message).where(Message.message_id == claim[0]).with_for_update()
            )
            if reply and isinstance(reply.tools_used, list):
                marker = reply.tools_used[0] if reply.tools_used else None
                if isinstance(marker, dict) and marker.get("claim_id") == claim[1]:
                    reply.tools_used = [{**marker, "active": False}]
    except Exception:
        # Keep a failed release closed until the crashed-request lease expires.
        logger.exception("Failed to release CNB question reply claim")
