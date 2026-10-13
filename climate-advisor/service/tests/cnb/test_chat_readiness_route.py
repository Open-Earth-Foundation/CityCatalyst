"""Message admission checks use persisted CNB state, before any agent or turn."""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import httpx
import pytest
import pytest_asyncio
from app.db import Base
from app.db.session import get_session_factory, get_session_optional
from app.models.db.concept_note import (
    ConceptNoteContextBundle,
    ConceptNoteRun,
    ConceptNoteUpload,
)
from app.models.db.thread import Thread
from app.routes import messages
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

AUTH_HEADERS = {"Authorization": "Bearer owner-token"}


@pytest_asyncio.fixture
async def chat_api(tmp_path, monkeypatch):
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{(tmp_path / 'chat.db').as_posix()}"
    )
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    run_id, thread_id, upload_id = uuid4(), uuid4(), uuid4()
    now = datetime.now(UTC)
    async with factory() as session, session.begin():
        session.add_all(
            [
                Thread(
                    thread_id=thread_id,
                    user_id="owner",
                    context={"concept_note_run_id": str(run_id)},
                ),
                ConceptNoteRun(
                    run_id=run_id,
                    user_id="owner",
                    name="Run",
                    city_id=str(uuid4()),
                    thread_id=thread_id,
                    idempotency_key=uuid4(),
                    request_fingerprint="a" * 64,
                    permission_summary={},
                    context_summary={
                        "context_bundle": {
                            "status": "ready",
                            "document_grounding": "uploaded_evidence",
                        }
                    },
                ),
                ConceptNoteUpload(
                    upload_id=upload_id,
                    run_id=run_id,
                    uploaded_by_user_id="owner",
                    filename="B.pdf",
                    markdown_s3_key="B.md",
                    markdown_sha256="b" * 64,
                    page_count=1,
                    ingest_status="ready",
                    received_at=now,
                ),
                ConceptNoteContextBundle(
                    run_id=run_id,
                    context_bundle={
                        "selected_sources": [
                            {
                                "upload_id": str(upload_id),
                                "filename": "B.pdf",
                                "source_label": "B.pdf",
                                "sha256": "b" * 64,
                                "page_count": 1,
                                "summary": "Ready evidence",
                                "topics": [],
                                "key_excerpts": [],
                            }
                        ]
                    },
                ),
            ]
        )
    monkeypatch.setattr(
        "app.utils.citycatalyst_auth.CityCatalystClient.validate_user_identity",
        AsyncMock(return_value="owner"),
    )
    save_message = AsyncMock()
    monkeypatch.setattr(messages.MessageService, "create_user_message", save_message)

    async def empty_stream(*args):
        yield b'event: done\ndata: {"ok":true}\n\n'

    handler = Mock()
    handler.return_value.stream_response = empty_stream
    monkeypatch.setattr(messages, "StreamingHandler", handler)
    app = FastAPI()
    app.include_router(messages.router, prefix="/v1")
    app.dependency_overrides[get_session_factory] = lambda: factory
    app.dependency_overrides[get_session_optional] = lambda: None
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client, factory, run_id, thread_id, upload_id, save_message, handler
    await engine.dispose()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "scenario",
    [
        "queued",
        "processing",
        "latest_failed",
        "building",
        "failed",
        "missing_progress",
        "missing_bundle",
        "stale_sources",
        "wrong_digest",
        "older_pending",
    ],
)
async def test_rejects_unready_persisted_context_before_turn_or_agent(
    chat_api, scenario
):
    client, factory, run_id, thread_id, upload_id, save_message, handler = chat_api
    async with factory() as session, session.begin():
        run = await session.get(ConceptNoteRun, run_id)
        upload = await session.get(ConceptNoteUpload, upload_id)
        bundle = await session.get(ConceptNoteContextBundle, run_id)
        if scenario in {"queued", "processing", "latest_failed"}:
            upload.ingest_status = "failed" if scenario == "latest_failed" else scenario
        elif scenario in {"building", "failed", "missing_progress"}:
            run.context_summary = (
                {}
                if scenario == "missing_progress"
                else {"context_bundle": {"status": scenario}}
            )
        elif scenario == "missing_bundle":
            await session.delete(bundle)
        elif scenario == "stale_sources":
            bundle.context_bundle = {}
        elif scenario == "wrong_digest":
            upload.markdown_sha256 = "c" * 64
        elif scenario == "older_pending":
            session.add(
                ConceptNoteUpload(
                    upload_id=uuid4(),
                    run_id=run_id,
                    uploaded_by_user_id="owner",
                    filename="A.pdf",
                    ingest_status="processing",
                    received_at=upload.received_at - timedelta(days=1),
                )
            )

    response = await client.post(
        "/v1/messages",
        json={
            "thread_id": str(thread_id),
            "user_id": "owner",
            "content": "Use my evidence",
            # Omitted run ID forces the guard to read persisted thread scope.
        },
        headers=AUTH_HEADERS,
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "concept_note_context_not_ready"
    save_message.assert_not_awaited()
    handler.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "scenario", ["ready", "older_failed", "city_only", "general_chat"]
)
async def test_accepts_ready_context_and_supported_non_document_chat(
    chat_api, scenario
):
    client, factory, run_id, thread_id, upload_id, save_message, handler = chat_api
    async with factory() as session, session.begin():
        upload = await session.get(ConceptNoteUpload, upload_id)
        if scenario == "older_failed":
            session.add(
                ConceptNoteUpload(
                    upload_id=uuid4(),
                    run_id=run_id,
                    uploaded_by_user_id="owner",
                    filename="A.pdf",
                    ingest_status="failed",
                    received_at=upload.received_at - timedelta(days=1),
                )
            )
        elif scenario == "city_only":
            await session.delete(upload)
            run = await session.get(ConceptNoteRun, run_id)
            run.context_summary = {
                "context_bundle": {"status": "ready", "document_grounding": "none"}
            }
            bundle = await session.get(ConceptNoteContextBundle, run_id)
            bundle.context_bundle = {}
        elif scenario == "general_chat":
            thread = await session.get(Thread, thread_id)
            thread.context = {}

    response = await client.post(
        "/v1/messages",
        json={
            "thread_id": str(thread_id),
            "user_id": "owner",
            "content": "Hello",
        },
        headers=AUTH_HEADERS,
    )
    assert response.status_code == 200
    assert "event: done" in response.text
    save_message.assert_awaited_once()
    handler.assert_called_once()


@pytest.mark.asyncio
@pytest.mark.parametrize("scope", ["context", "options"])
async def test_checks_explicit_request_scope_too(chat_api, scope):
    client, factory, run_id, thread_id, _upload_id, save_message, handler = chat_api
    async with factory() as session, session.begin():
        thread = await session.get(Thread, thread_id)
        thread.context = {}
        run = await session.get(ConceptNoteRun, run_id)
        run.context_summary = {}
    response = await client.post(
        "/v1/messages",
        json={
            "thread_id": str(thread_id),
            "user_id": "owner",
            "content": "Hello",
            scope: {"concept_note_run_id": str(run_id)},
        },
        headers=AUTH_HEADERS,
    )
    assert response.status_code == 409
    save_message.assert_not_awaited()
    handler.assert_not_called()


@pytest.mark.asyncio
async def test_run_ownership_is_checked_before_readiness(chat_api):
    client, factory, run_id, thread_id, _upload_id, save_message, handler = chat_api
    async with factory() as session, session.begin():
        run = await session.get(ConceptNoteRun, run_id)
        run.user_id = "someone-else"
    response = await client.post(
        "/v1/messages",
        json={
            "thread_id": str(thread_id),
            "user_id": "owner",
            "content": "Hello",
        },
        headers=AUTH_HEADERS,
    )
    assert response.status_code == 403
    save_message.assert_not_awaited()
    handler.assert_not_called()


@pytest.mark.asyncio
async def test_explicit_run_scope_must_match_the_thread(chat_api):
    client, factory, run_id, thread_id, _upload_id, save_message, handler = chat_api
    async with factory() as session, session.begin():
        run = await session.get(ConceptNoteRun, run_id)
        assert run is not None
        run.thread_id = uuid4()
    response = await client.post(
        "/v1/messages",
        json={
            "thread_id": str(thread_id),
            "user_id": "owner",
            "content": "Hello",
            "context": {"concept_note_run_id": str(run_id)},
        },
        headers=AUTH_HEADERS,
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "concept_note_thread_mismatch"
    save_message.assert_not_awaited()
    handler.assert_not_called()
