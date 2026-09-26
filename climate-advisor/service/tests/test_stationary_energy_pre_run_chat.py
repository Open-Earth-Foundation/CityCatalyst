"""Stationary Energy page chat before a run exists and when its request resumes."""

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, Mock, patch
from uuid import uuid4

import httpx
import pytest
import pytest_asyncio
from app.config import get_settings
from app.db import Base
from app.db.session import get_session_factory, get_session_optional
from app.models.db.thread import Thread
from app.models.requests import MessageCreateRequest
from app.routes import messages
from app.services.agent_service import AgentService
from app.services.stationary_energy.stationary_energy_chat_context import (
    STATIONARY_ENERGY_RUN_NOT_STARTED_MARKER,
    build_stationary_energy_ui_context,
)
from app.utils.chat_workflow_context import ChatWorkflowContext
from app.utils.stationary_energy_context import (
    STATIONARY_ENERGY_RESUME_AFTER_DRAFT_START_OPTION,
)
from app.utils.streaming_handler import StreamingHandler
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

RESUME_OPTIONS = {STATIONARY_ENERGY_RESUME_AFTER_DRAFT_START_OPTION: True}


def _pre_run_handler(*, surface: bool) -> StreamingHandler:
    handler = StreamingHandler(
        thread_id=str(uuid4()),
        user_id="owner",
        session_factory=MagicMock(),
        inventory_id="inventory-1",
    )
    handler.stationary_energy_surface = surface
    handler.stationary_energy_city_id = "city-1" if surface else None
    return handler


async def test_pre_run_page_chat_loads_run_not_started_context():
    handler = _pre_run_handler(surface=True)
    payload = MessageCreateRequest(
        user_id="owner",
        content="add all seeg data",
        context={"city_name": "Caxias do Sul", "inventory_year": 2022},
    )

    with patch(
        "app.utils.streaming_handler.load_conversation_history",
        new=AsyncMock(return_value=[]),
    ):
        history = await handler._load_conversation_history(get_settings(), payload)

    system_content = history[0]["content"]
    assert history[0]["role"] == "system"
    assert STATIONARY_ENERGY_RUN_NOT_STARTED_MARKER in system_content
    assert "CALL TOOL stationary_energy_start_draft TO START IT" in system_content
    context_json = system_content.split("\n")[2]
    assert json.loads(context_json) == {
        "run_status": "RUN_NOT_STARTED",
        "city_id": "city-1",
        "inventory_id": "inventory-1",
        "city_name": "Caxias do Sul",
        "inventory_year": 2022,
        "start_run_tool": "stationary_energy_start_draft",
    }
    assert history[-1] == {"role": "user", "content": "add all seeg data"}


async def test_general_chat_gets_no_run_not_started_context():
    handler = _pre_run_handler(surface=False)
    payload = MessageCreateRequest(user_id="owner", content="hello")

    with patch(
        "app.utils.streaming_handler.load_conversation_history",
        new=AsyncMock(return_value=[{"role": "user", "content": "hello"}]),
    ):
        history = await handler._load_conversation_history(get_settings(), payload)

    assert history == [{"role": "user", "content": "hello"}]


async def test_resume_turn_repeats_the_pre_run_request_after_the_start_reply():
    handler = _pre_run_handler(surface=True)
    handler.workflow_context = ChatWorkflowContext(
        stationary_energy_draft_run_id=str(uuid4())
    )
    payload = MessageCreateRequest(
        user_id="owner",
        content="add all seeg data",
        options=RESUME_OPTIONS,
    )
    stored_history = [
        {"role": "user", "content": "add all seeg data"},
        {"role": "assistant", "content": "Searching the connected sources."},
    ]
    draft_context = {
        "role": "system",
        "content": "STATIONARY_ENERGY_DRAFT_CONTEXT_JSON\n{}",
    }

    with (
        patch(
            "app.utils.streaming_handler.load_conversation_history",
            new=AsyncMock(return_value=list(stored_history)),
        ),
        patch.object(
            handler,
            "_load_stationary_energy_context_message",
            new=AsyncMock(return_value=draft_context),
        ),
    ):
        history = await handler._load_conversation_history(get_settings(), payload)

    assert history[1:3] == stored_history
    assert history[-1] == {"role": "user", "content": "add all seeg data"}


def test_ui_context_marks_resumed_requests_only():
    resumed = build_stationary_energy_ui_context(
        MessageCreateRequest(user_id="owner", content="x", options=RESUME_OPTIONS)
    )
    normal = build_stationary_energy_ui_context(
        MessageCreateRequest(user_id="owner", content="x")
    )

    assert resumed is not None and resumed["resumed_after_run_start"] is True
    assert normal is None


@patch("app.services.agent_service.get_settings")
def test_pre_run_page_agent_uses_stationary_energy_prompt_and_start_tool_only(
    mock_get_settings,
):
    mock_settings = MagicMock()
    mock_settings.llm.models.orchestrator.name = "openai/general"
    mock_settings.llm.models.orchestrator.temperature = 0.2
    mock_settings.llm.models.agentic_flow.name = "openai/agentic"
    mock_settings.llm.models.agentic_flow.temperature = 0.1
    mock_settings.llm.models.agentic_flow.reasoning_effort = None
    mock_settings.llm.models.cnb_chat = None
    mock_settings.llm.prompts.compose_prompt.side_effect = lambda name: f"{name} prompt"
    mock_get_settings.return_value = mock_settings

    with (
        patch(
            "app.services.agent_service.build_openrouter_client_options",
            return_value=MagicMock(base_url="https://openrouter.ai/api/v1", kwargs={}),
        ),
        patch("app.services.agent_service.AsyncOpenAI"),
        patch("app.services.agent_service.Agent") as mock_agent_class,
    ):
        service = AgentService(
            cc_access_token="jwt-token",
            cc_thread_id=uuid4(),
            cc_user_id="user-1",
            city_id="city-1",
            inventory_id="inventory-1",
            session_factory=MagicMock(),
            stationary_energy_surface=True,
        )
        asyncio.run(service.create_agent(model=service.preferred_model_for_context()))

    agent_kwargs = mock_agent_class.call_args.kwargs
    tool_names = [getattr(tool, "name", "") for tool in agent_kwargs["tools"]]
    assert agent_kwargs["instructions"] == "stationary_energy_review prompt"
    assert tool_names == ["stationary_energy_start_draft"]
    assert service.preferred_model_for_context() == "openai/agentic"


@pytest_asyncio.fixture
async def se_chat_api(tmp_path, monkeypatch):
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{(tmp_path / 'chat.db').as_posix()}"
    )
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    thread_id = uuid4()
    async with factory() as session, session.begin():
        session.add(Thread(thread_id=thread_id, user_id="owner", context={}))
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
        yield client, thread_id, save_message
    await engine.dispose()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("options", "expect_saved"),
    [({}, True), (RESUME_OPTIONS, False)],
)
async def test_resume_turn_does_not_store_the_request_twice(
    se_chat_api, options, expect_saved
):
    client, thread_id, save_message = se_chat_api

    response = await client.post(
        "/v1/messages",
        json={
            "user_id": "owner",
            "thread_id": str(thread_id),
            "content": "add all seeg data",
            "context": {"stationary_energy_draft_run_id": str(uuid4())},
            "options": options,
        },
    )

    assert response.status_code == 200
    assert save_message.await_count == (1 if expect_saved else 0)
