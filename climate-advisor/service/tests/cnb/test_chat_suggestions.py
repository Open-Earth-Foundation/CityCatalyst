import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest
import tiktoken
from app.config.settings import Settings, _load_llm_config
from app.models.cnb.chat_suggestions import ChatSuggestionsRequest
from app.models.cnb.concept_note_draft import ConceptNoteDraftResponse
from app.models.db.concept_note import ConceptNoteRun
from app.models.db.message import Message, MessageRole
from app.services.cnb.chat_suggestions import (
    build_suggestion_context,
    generate_chat_suggestions,
)
from fastapi import HTTPException


def test_context_caps_document_in_order_and_omits_source_bodies():
    run = ConceptNoteRun(run_id=uuid4(), workflow_step="drafting")
    draft = ConceptNoteDraftResponse(
        run_id=run.run_id,
        status="complete",
        completed_chapters=2,
        total_chapters=2,
        chapters=[
            {
                "chapter_id": uuid4(),
                "title": "Later",
                "position": 1,
                "status": "draft",
                "required": True,
                "user_locked": False,
                "body_markdown": "DO_NOT_INCLUDE_TAIL",
            },
            {
                "chapter_id": uuid4(),
                "title": "First",
                "position": 0,
                "status": "draft",
                "required": True,
                "user_locked": False,
                "body_markdown": "海岸 adaptation " * 25000,
                "open_gap_count": 2,
            },
        ],
    )
    context = build_suggestion_context(
        ChatSuggestionsRequest(),
        run,
        draft,
        {
            "selected_sources": [{"body": "PRIVATE_SOURCE"}],
            "cc_context": {"ghgi": {"secret": "PRIVATE_CITY"}},
        },
        [Message(role=MessageRole.USER, text="question " * 10000)],
    )
    encoder = tiktoken.get_encoding("o200k_base")
    assert len(encoder.encode(context["document_prefix"])) <= 20000
    assert context["document_prefix"].startswith("# First")
    assert "DO_NOT_INCLUDE_TAIL" not in context["document_prefix"]
    assert "\ufffd" not in context["document_prefix"]
    assert len(encoder.encode(context["recent_messages"][0]["content"])) <= 2000
    assert "PRIVATE" not in json.dumps(context)
    assert context["workspace"]["open_gap_count"] == 2
    assert context["workspace"]["available_city_modules"] == ["ghgi"]


def test_empty_run_and_special_token_text_are_safe():
    context = build_suggestion_context(
        ChatSuggestionsRequest(language="pl", tab="context"),
        ConceptNoteRun(workflow_step="assembling_context"),
        None,
        {},
        [Message(role=MessageRole.USER, text="<|endoftext|>")],
    )
    assert context["document_prefix"] == ""
    assert context["recent_messages"][0]["content"] == "<|endoftext|>"
    assert context["language"] == "pl"


@pytest.mark.parametrize(
    "content,expected",
    [
        ('{"suggestions":["What is missing?","How can I improve the budget?"]}', 2),
        ('{"suggestions":["Duplicate?","duplicate?"]}', 0),
        ('{"suggestions":["Only one?"]}', 0),
        ('{"suggestions":["  ","Question?"]}', 0),
        ("not json", 0),
        (None, 0),
    ],
)
async def test_generation_validates_output_and_uses_luna_medium(
    monkeypatch, content, expected
):
    settings = Settings(llm=_load_llm_config(), openrouter_api_key="test-key")
    client = AsyncMock()
    client.__aenter__.return_value = client
    client.chat.completions.create.return_value = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=content))]
    )
    constructor = Mock(return_value=client)
    monkeypatch.setattr("app.services.cnb.chat_suggestions.AsyncOpenAI", constructor)
    result = await generate_chat_suggestions(settings, {"document_prefix": "test"})
    assert len(result.suggestions) == expected
    kwargs = client.chat.completions.create.call_args.kwargs
    assert kwargs["model"] == "openai/gpt-5.6-luna"
    assert kwargs["extra_body"]["reasoning"]["effort"] == "medium"
    assert constructor.call_args.kwargs["max_retries"] == 0
    client.__aexit__.assert_awaited_once()


async def test_provider_timeout_falls_back(monkeypatch):
    settings = Settings(llm=_load_llm_config(), openrouter_api_key="test-key")
    client = AsyncMock()
    client.__aenter__.return_value = client
    client.chat.completions.create.side_effect = TimeoutError()
    monkeypatch.setattr(
        "app.services.cnb.chat_suggestions.AsyncOpenAI", Mock(return_value=client)
    )
    assert (await generate_chat_suggestions(settings, {})).suggestions == []


async def test_route_authorizes_before_reading_draft_or_calling_model(monkeypatch):
    from app.routes.concept_note_runs import propose_chat_questions

    authorize = AsyncMock(side_effect=HTTPException(status_code=403))
    monkeypatch.setattr(
        "app.routes.concept_note_runs.ConceptNoteRunService",
        Mock(return_value=SimpleNamespace(get_authorized_run=authorize)),
    )
    generate = AsyncMock()
    monkeypatch.setattr(
        "app.routes.concept_note_runs.generate_chat_suggestions", generate
    )
    draft_service, session = AsyncMock(), AsyncMock()
    with pytest.raises(HTTPException) as error:
        await propose_chat_questions(
            uuid4(),
            ChatSuggestionsRequest(),
            SimpleNamespace(is_disconnected=AsyncMock(return_value=False)),
            draft_service,
            user_id="other",
            authorization="Bearer test",
            session=session,
        )
    assert error.value.status_code == 403
    draft_service.load_state.assert_not_called()
    session.get.assert_not_called()
    generate.assert_not_called()


async def test_route_reads_only_authorized_run_and_active_thread(monkeypatch):
    from app.models.cnb.chat_suggestions import ChatSuggestionsResponse
    from app.routes.concept_note_runs import propose_chat_questions

    run = ConceptNoteRun(
        run_id=uuid4(), thread_id=uuid4(), workflow_step="interviewing"
    )
    authorize = AsyncMock(return_value=run)
    monkeypatch.setattr(
        "app.routes.concept_note_runs.ConceptNoteRunService",
        Mock(return_value=SimpleNamespace(get_authorized_run=authorize)),
    )
    history = AsyncMock(
        return_value=[Message(role=MessageRole.USER, text="Discuss the budget")]
    )
    monkeypatch.setattr(
        "app.routes.concept_note_runs.MessageService",
        Mock(return_value=SimpleNamespace(get_thread_messages=history)),
    )
    generate = AsyncMock(
        return_value=ChatSuggestionsResponse(suggestions=["First?", "Second?"])
    )
    monkeypatch.setattr(
        "app.routes.concept_note_runs.generate_chat_suggestions", generate
    )
    session = AsyncMock()
    session.get.return_value = None
    result = await propose_chat_questions(
        run.run_id,
        ChatSuggestionsRequest(),
        SimpleNamespace(is_disconnected=AsyncMock(return_value=False)),
        None,
        user_id="owner",
        authorization="Bearer test",
        session=session,
    )
    assert result.suggestions == ["First?", "Second?"]
    history.assert_awaited_once_with(thread_id=run.thread_id, limit=6)
    payload = generate.call_args.args[1]
    assert payload["recent_messages"] == [
        {"role": "user", "content": "Discuss the budget"}
    ]
    assert str(run.run_id) not in json.dumps(payload)


async def test_disconnect_cancels_in_flight_model_request(monkeypatch):
    from app.routes.concept_note_runs import propose_chat_questions

    run = ConceptNoteRun(run_id=uuid4(), workflow_step="drafting")
    monkeypatch.setattr(
        "app.routes.concept_note_runs.ConceptNoteRunService",
        Mock(
            return_value=SimpleNamespace(get_authorized_run=AsyncMock(return_value=run))
        ),
    )
    monkeypatch.setattr(
        "app.routes.concept_note_runs.get_settings",
        Mock(
            return_value=Settings(llm=_load_llm_config(), openrouter_api_key="test-key")
        ),
    )

    started = asyncio.Event()
    cancelled = asyncio.Event()
    disconnected = asyncio.Event()

    async def model_request(**_kwargs):
        started.set()
        try:
            await asyncio.Future()
        except asyncio.CancelledError:
            cancelled.set()
            raise

    client = AsyncMock()
    client.__aenter__.return_value = client
    client.chat.completions.create.side_effect = model_request
    monkeypatch.setattr(
        "app.services.cnb.chat_suggestions.AsyncOpenAI", Mock(return_value=client)
    )
    request = SimpleNamespace(
        is_disconnected=AsyncMock(side_effect=lambda: disconnected.is_set())
    )
    session = AsyncMock()
    session.get.return_value = None

    generation = asyncio.create_task(
        propose_chat_questions(
            run.run_id,
            ChatSuggestionsRequest(),
            request,
            None,
            user_id="owner",
            authorization="Bearer test",
            session=session,
        )
    )
    await asyncio.wait_for(started.wait(), timeout=2)
    disconnected.set()
    await asyncio.wait_for(cancelled.wait(), timeout=2)
    with pytest.raises(asyncio.CancelledError):
        await generation
    client.__aexit__.assert_awaited_once()
