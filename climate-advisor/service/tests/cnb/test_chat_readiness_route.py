"""Message admission checks use persisted CNB state, before any agent or turn."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import httpx
import pytest
import pytest_asyncio
from app.models.db.concept_note import (
    ConceptNoteContextBundle,
    ConceptNoteRun,
    ConceptNoteUpload,
)
from app.models.db.thread import Thread
from app.routes import messages

AUTH_HEADERS = {"Authorization": "Bearer owner-token"}


@pytest_asyncio.fixture
async def chat_api(chat_client, monkeypatch) -> SimpleNamespace:
    """Seed one owned run whose single upload is ready and bundled."""
    run_id, thread_id, upload_id = uuid4(), uuid4(), uuid4()
    async with chat_client.factory() as session, session.begin():
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
                    received_at=datetime.now(UTC),
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
    save_message = AsyncMock()
    monkeypatch.setattr(messages.MessageService, "create_user_message", save_message)
    return SimpleNamespace(
        factory=chat_client.factory,
        handler=chat_client.handler,
        save_message=save_message,
        run_id=run_id,
        thread_id=thread_id,
        upload_id=upload_id,
        post=lambda **extra: chat_client.client.post(
            "/v1/messages",
            json={
                "thread_id": str(thread_id),
                "user_id": "owner",
                "content": "Hello",
                **extra,
            },
            headers=AUTH_HEADERS,
        ),
    )


def assert_rejected_before_turn(api: SimpleNamespace, response: httpx.Response, status: int) -> None:
    assert response.status_code == status
    api.save_message.assert_not_awaited()
    api.handler.assert_not_called()


def older_upload(api: SimpleNamespace, received_at: datetime, status: str) -> ConceptNoteUpload:
    return ConceptNoteUpload(
        upload_id=uuid4(),
        run_id=api.run_id,
        uploaded_by_user_id="owner",
        filename="A.pdf",
        ingest_status=status,
        received_at=received_at - timedelta(days=1),
    )


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
    async with chat_api.factory() as session, session.begin():
        run = await session.get(ConceptNoteRun, chat_api.run_id)
        upload = await session.get(ConceptNoteUpload, chat_api.upload_id)
        bundle = await session.get(ConceptNoteContextBundle, chat_api.run_id)
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
            session.add(older_upload(chat_api, upload.received_at, "processing"))

    # Omitted run ID forces the guard to read persisted thread scope.
    response = await chat_api.post(content="Use my evidence")

    assert_rejected_before_turn(chat_api, response, 409)
    assert response.json()["detail"]["code"] == "concept_note_context_not_ready"


@pytest.mark.parametrize(
    "scenario", ["ready", "older_failed", "city_only", "general_chat"]
)
async def test_accepts_ready_context_and_supported_non_document_chat(
    chat_api, scenario
):
    async with chat_api.factory() as session, session.begin():
        upload = await session.get(ConceptNoteUpload, chat_api.upload_id)
        if scenario == "older_failed":
            session.add(older_upload(chat_api, upload.received_at, "failed"))
        elif scenario == "city_only":
            await session.delete(upload)
            run = await session.get(ConceptNoteRun, chat_api.run_id)
            run.context_summary = {
                "context_bundle": {"status": "ready", "document_grounding": "none"}
            }
            bundle = await session.get(ConceptNoteContextBundle, chat_api.run_id)
            bundle.context_bundle = {}
        elif scenario == "general_chat":
            thread = await session.get(Thread, chat_api.thread_id)
            thread.context = {}

    response = await chat_api.post()

    assert response.status_code == 200
    assert "event: done" in response.text
    chat_api.save_message.assert_awaited_once()
    chat_api.handler.assert_called_once()


@pytest.mark.parametrize("scope", ["context", "options"])
async def test_checks_explicit_request_scope_too(chat_api, scope):
    async with chat_api.factory() as session, session.begin():
        thread = await session.get(Thread, chat_api.thread_id)
        thread.context = {}
        run = await session.get(ConceptNoteRun, chat_api.run_id)
        run.context_summary = {}

    response = await chat_api.post(**{scope: {"concept_note_run_id": str(chat_api.run_id)}})

    assert_rejected_before_turn(chat_api, response, 409)


async def test_run_ownership_is_checked_before_readiness(chat_api):
    async with chat_api.factory() as session, session.begin():
        run = await session.get(ConceptNoteRun, chat_api.run_id)
        run.user_id = "someone-else"

    response = await chat_api.post()

    assert_rejected_before_turn(chat_api, response, 403)


async def test_explicit_run_scope_must_match_the_thread(chat_api):
    async with chat_api.factory() as session, session.begin():
        run = await session.get(ConceptNoteRun, chat_api.run_id)
        run.thread_id = uuid4()

    response = await chat_api.post(context={"concept_note_run_id": str(chat_api.run_id)})

    assert_rejected_before_turn(chat_api, response, 409)
    assert response.json()["detail"]["code"] == "concept_note_thread_mismatch"
