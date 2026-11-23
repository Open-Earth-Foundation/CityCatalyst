"""Card provenance, retry and real PostgreSQL concurrent reply protection."""

import asyncio
import os
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
import pytest_asyncio
from app.db import Base
from app.models.db.concept_note import ConceptNoteRun
from app.models.db.message import Message, MessageRole
from app.models.db.thread import Thread
from app.services.cnb.question_reply import (
    QUESTION_MESSAGE_ID,
    question_message_id,
    release_question_reply,
    save_question_reply,
)
from app.services.message_service import MessageService
from app.services.thread_service import ThreadService
from app.utils.streaming_handler import StreamingHandler
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.schema import CreateSchema, DropSchema
from tests.streaming_fixtures import _parse_sse_payload

CARD_TABLES = [ConceptNoteRun.__table__, Thread.__table__, Message.__table__]


def card_tools(options, on_answer=None, *, message="Which one?", document_topic=None):
    result = {"message": message, "options": options}
    if on_answer:
        result["on_answer"] = on_answer
    if document_topic:
        result["document_topic"] = document_topic
    return [{"name": "concept_note_ask_question", "result_json": result}]


@pytest_asyncio.fixture
async def store(tmp_path):
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{(tmp_path / 'cards.db').as_posix()}"
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all, tables=CARD_TABLES)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


async def seed_card(factory, *, question="Which format?", tools=None):
    """Create a durable question whose timestamp precedes future replies."""
    thread_id, question_id, run_id = uuid4(), uuid4(), uuid4()
    async with factory() as session, session.begin():
        session.add(
            ConceptNoteRun(
                run_id=run_id,
                thread_id=thread_id,
                user_id="owner",
                name="Card test",
                city_id="city",
                context_summary={},
                permission_summary={},
                idempotency_key=uuid4(),
                request_fingerprint="test",
            )
        )
        await session.flush()
        session.add(
            Thread(
                thread_id=thread_id,
                user_id="owner",
                context={},
                concept_note_run_id=run_id,
            )
        )
        await session.flush()
        session.add(
            Message(
                message_id=question_id,
                thread_id=thread_id,
                user_id="owner",
                text=question,
                role=MessageRole.ASSISTANT,
                tools_used=tools
                or card_tools(["Months", "Quarters"], message=question),
                created_at=datetime.now(UTC) - timedelta(seconds=1),
            )
        )
    return thread_id, question_id


async def answer(factory, thread_id, question_id, content="Quarters", retry=False):
    """Use the same transaction and lock as the production route."""
    async with factory() as session, session.begin():
        thread = await ThreadService(session).get_thread(thread_id, for_update=True)
        return await save_question_reply(
            session,
            thread=thread,
            question_id=question_id,
            content=content,
            retry=retry,
        )


def test_binding_is_optional_for_old_clients_but_invalid_ids_are_stale():
    assert question_message_id({}) is None
    identifier = uuid4()
    assert question_message_id({QUESTION_MESSAGE_ID: str(identifier)}) == identifier
    for value in [None, "", "invalid", 12, {}]:
        with pytest.raises(HTTPException) as error:
            question_message_id({QUESTION_MESSAGE_ID: value})
        assert error.value.status_code == 409


@pytest.mark.asyncio
async def test_custom_reply_preserves_text_and_blocks_reuse(store):
    thread_id, question_id = await seed_card(store)
    content = "  My own answer\nwith details\r\n"
    claim = await answer(store, thread_id, question_id, content)
    async with store() as session:
        reply = await session.get(Message, claim[0])
        assert reply.text == content
        assert reply.tools_used[0]["question_message_id"] == str(question_id)
    with pytest.raises(HTTPException) as error:
        await answer(store, thread_id, question_id, content)
    assert error.value.detail["code"] == "concept_note_question_stale"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("role", "seconds_after_question"),
    [(MessageRole.USER, 1), (MessageRole.ASSISTANT, 1), (MessageRole.USER, 0)],
)
async def test_newer_or_ambiguous_history_rejects_reply_without_saving(
    store, role, seconds_after_question
):
    thread_id, question_id = await seed_card(store)
    async with store() as session, session.begin():
        question = await session.get(Message, question_id)
        session.add(
            Message(
                message_id=uuid4(),
                thread_id=thread_id,
                user_id="owner",
                text="Another turn",
                role=role,
                created_at=question.created_at
                + timedelta(seconds=seconds_after_question),
            )
        )
    with pytest.raises(HTTPException) as error:
        await answer(store, thread_id, question_id)
    assert error.value.detail["code"] == "concept_note_question_stale"
    async with store() as session:
        assert len(list(await session.scalars(select(Message)))) == 2


@pytest.mark.asyncio
async def test_question_must_be_a_valid_card_in_the_same_owned_thread(store):
    thread_id, question_id = await seed_card(store)
    _other_thread, other_question = await seed_card(store)
    for identifier in [uuid4(), other_question]:
        with pytest.raises(HTTPException):
            await answer(store, thread_id, identifier)
    async with store() as session, session.begin():
        question = await session.get(Message, question_id)
        question.tools_used = None
    with pytest.raises(HTTPException):
        await answer(store, thread_id, question_id)


@pytest.mark.asyncio
async def test_legacy_context_bound_thread_can_answer_but_inactive_thread_cannot(store):
    thread_id, question_id = await seed_card(store)
    async with store() as session, session.begin():
        thread = await session.get(Thread, thread_id)
        run_id = thread.concept_note_run_id
        thread.context = {"concept_note_run_id": str(run_id)}
        thread.concept_note_run_id = None
    claim = await answer(store, thread_id, question_id)
    await release_question_reply(store, claim)
    async with store() as session, session.begin():
        run = await session.get(ConceptNoteRun, run_id)
        run.thread_id = uuid4()
    with pytest.raises(HTTPException):
        await answer(store, thread_id, question_id, retry=True)


@pytest.mark.asyncio
async def test_retry_reuses_exact_reply_only_after_prior_stream_releases(store):
    thread_id, question_id = await seed_card(store)
    claim = await answer(store, thread_id, question_id)
    with pytest.raises(HTTPException):
        await answer(store, thread_id, question_id, retry=True)
    await release_question_reply(store, claim)
    with pytest.raises(HTTPException):
        await answer(store, thread_id, question_id, content="Quarters\n", retry=True)
    retried = await answer(store, thread_id, question_id, retry=True)
    assert retried[0] == claim[0]
    assert retried[1] != claim[1]
    # Cleanup from an older request must not release the retry's active claim.
    await release_question_reply(store, claim)
    with pytest.raises(HTTPException):
        await answer(store, thread_id, question_id, retry=True)
    await release_question_reply(store, retried)
    async with store() as session:
        assert len(list(await session.scalars(select(Message)))) == 2


@pytest.mark.asyncio
async def test_successful_answer_makes_even_retry_stale_and_done_id_matches_history(
    store,
):
    thread_id, question_id = await seed_card(store)
    claim = await answer(store, thread_id, question_id)
    handler = StreamingHandler(thread_id, "owner", store, question_reply_claim=claim)
    handler.assistant_tokens = ["Use quarters."]
    assert await handler.persist_message()
    await handler._release_question_reply()
    done = _parse_sse_payload(handler._format_completion_event("request"))["data"]
    async with store() as session:
        persisted = await session.get(Message, handler.assistant_message_id)
        assert done["assistant_message_id"] == str(persisted.message_id)
    with pytest.raises(HTTPException):
        await answer(store, thread_id, question_id, retry=True)
    handler.history_saved = False
    done = _parse_sse_payload(handler._format_completion_event("request"))["data"]
    assert done["assistant_message_id"] is None


@pytest.mark.asyncio
async def test_disconnect_releases_claim_even_before_stream_initialization(store):
    thread_id, question_id = await seed_card(store)
    claim = await answer(store, thread_id, question_id)
    handler = StreamingHandler(thread_id, "owner", store, question_reply_claim=claim)

    async def interrupted(*args):
        raise asyncio.CancelledError()
        yield  # An async generator is required by the streaming interface.

    handler._stream_response = interrupted
    with pytest.raises(asyncio.CancelledError):
        async for _ in handler.stream_response(None):
            pass
    assert (await answer(store, thread_id, question_id, retry=True))[0] == claim[0]


@pytest_asyncio.fixture
async def postgres_store():
    url = os.getenv("CNB_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Requires CNB_TEST_DATABASE_URL for real row-lock races")
    schema = f"question_reply_{uuid4().hex}"
    url = url.replace("postgresql://", "postgresql+asyncpg://")
    admin = create_async_engine(url)
    engine = create_async_engine(
        url, connect_args={"server_settings": {"search_path": schema}}
    )
    try:
        async with admin.begin() as connection:
            await connection.execute(CreateSchema(schema))
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all, tables=CARD_TABLES)
        yield async_sessionmaker(engine, expire_on_commit=False)
    finally:
        await engine.dispose()
        async with admin.begin() as connection:
            await connection.execute(DropSchema(schema, cascade=True, if_exists=True))
        await admin.dispose()


@pytest.mark.asyncio
async def test_postgres_simultaneous_replies_and_retries_accept_one(postgres_store):
    factory = postgres_store
    thread_id, question_id = await seed_card(factory)
    outcomes = await asyncio.gather(
        answer(factory, thread_id, question_id),
        answer(factory, thread_id, question_id),
        return_exceptions=True,
    )
    claims = [value for value in outcomes if isinstance(value, tuple)]
    assert len(claims) == 1
    assert sum(isinstance(value, HTTPException) for value in outcomes) == 1
    await release_question_reply(factory, claims[0])
    outcomes = await asyncio.gather(
        answer(factory, thread_id, question_id, retry=True),
        answer(factory, thread_id, question_id, retry=True),
        return_exceptions=True,
    )
    assert sum(isinstance(value, tuple) for value in outcomes) == 1
    assert sum(isinstance(value, HTTPException) for value in outcomes) == 1
    async with factory() as session:
        assert len(list(await session.scalars(select(Message)))) == 2


@pytest.mark.asyncio
async def test_postgres_changed_history_while_reply_waits_for_thread_lock(
    postgres_store,
):
    factory = postgres_store
    thread_id, question_id = await seed_card(factory)
    locked = asyncio.Event()
    release_writer = asyncio.Event()

    async def newer_turn():
        async with factory() as session, session.begin():
            thread = await ThreadService(session).get_thread(thread_id, for_update=True)
            locked.set()
            await release_writer.wait()
            from app.services.cnb.question_reply import cnb_message_time

            await MessageService(session).create_user_message(
                thread_id=thread.thread_id,
                user_id="owner",
                text="Newer message",
                created_at=await cnb_message_time(session, thread.thread_id),
            )

    writer = asyncio.create_task(newer_turn())
    await locked.wait()
    stale = asyncio.create_task(answer(factory, thread_id, question_id))
    release_writer.set()
    await writer
    with pytest.raises(HTTPException):
        await stale


@pytest.mark.asyncio
@pytest.mark.parametrize("retry_first", [False, True])
async def test_postgres_expired_writer_and_retry_save_one_answer(
    postgres_store, retry_first
):
    factory = postgres_store
    thread_id, question_id = await seed_card(factory)
    old_claim = await answer(factory, thread_id, question_id)
    async with factory() as session, session.begin():
        reply = await session.get(Message, old_claim[0])
        reply.tools_used = [
            {**reply.tools_used[0], "expires_at": "2000-01-01T00:00:00+00:00"}
        ]
    old_handler = StreamingHandler(
        thread_id, "owner", factory, question_reply_claim=old_claim
    )
    old_handler.assistant_tokens = ["Old worker answer"]
    if retry_first:
        takeover = await answer(factory, thread_id, question_id, retry=True)
        saved = await old_handler.persist_message()
    else:
        saved, takeover = await asyncio.gather(
            old_handler.persist_message(),
            answer(factory, thread_id, question_id, retry=True),
            return_exceptions=True,
        )
    if isinstance(takeover, tuple):
        assert saved is False
        new_handler = StreamingHandler(
            thread_id, "owner", factory, question_reply_claim=takeover
        )
        new_handler.assistant_tokens = ["New worker answer"]
        assert await new_handler.persist_message()
    else:
        assert saved is True
        assert isinstance(takeover, HTTPException)
    async with factory() as session:
        replies = list(
            await session.scalars(
                select(Message).where(
                    Message.role == MessageRole.ASSISTANT,
                    Message.message_id != question_id,
                )
            )
        )
        assert len(replies) == 1


@pytest.mark.asyncio
async def test_postgres_simultaneous_turn_claims_accept_one(postgres_store):
    from app.services.cnb.chat_turn import claim_reply_turn

    thread_id, _ = await seed_card(postgres_store)

    async def claim():
        async with postgres_store() as session, session.begin():
            thread = await ThreadService(session).get_thread(thread_id, for_update=True)
            return await claim_reply_turn(session, thread)

    outcomes = await asyncio.gather(claim(), claim(), return_exceptions=True)
    accepted = [result for result in outcomes if not isinstance(result, BaseException)]
    rejections = [result for result in outcomes if isinstance(result, HTTPException)]
    assert len(accepted) == len(rejections) == 1
    assert rejections[0].status_code == 409
    assert rejections[0].detail["code"] == "concept_note_reply_in_progress"
    async with postgres_store() as session:
        assert (await session.get(Thread, thread_id)).reply_turn_id == accepted[0]
