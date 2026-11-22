from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from app.db import Base
from app.models.cnb.concept_note_edits import EditProposalRequest
from app.models.cnb.context_bundle import ConceptNoteContextBundle
from app.models.db.concept_note import (
    ConceptNoteContextBundle as ConceptNoteContextBundleRow,
)
from app.models.db.concept_note import ConceptNoteRun
from app.services.agent_service import AgentService
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import get_settings

CNB_BASE_TOOLS = [
    "concept_note_ask_question",
    "concept_note_help",
    "concept_note_gaps",
    "concept_note_render_visual",
]


@pytest.fixture(autouse=True)
def agent_settings(monkeypatch):
    """Give AgentService a test key and no tracing."""
    settings = get_settings().model_copy(deep=True)
    settings.openrouter_api_key = "test-key"
    settings.langsmith_tracing_enabled = False
    monkeypatch.setattr("app.services.agent_service.get_settings", lambda: settings)
    return settings


async def _agent_tools(**service_kwargs) -> tuple[list[str], object]:
    service = AgentService(cc_user_id="owner", cc_thread_id=uuid4(), **service_kwargs)
    try:
        agent = await service.create_agent()
    finally:
        await service.close()
    return [tool.name for tool in agent.tools], agent


@pytest.mark.parametrize("stationary_energy", [False, True])
async def test_help_is_not_available_outside_cnb(stationary_energy):
    tools, _ = await _agent_tools(
        session_factory=MagicMock(),
        stationary_energy_draft_run_id=uuid4() if stationary_energy else None,
    )
    assert "concept_note_help" not in tools


@pytest.mark.parametrize("edit_enabled", [False, True])
@pytest.mark.parametrize(
    ("workflow_step", "sources_available"),
    [
        ("interviewing", True),
        ("editing_document", True),
        ("assembling_context", False),
    ],
)
async def test_source_query_registration_requires_ready_bundle_and_allowed_step(
    tmp_path, workflow_step, sources_available, edit_enabled
) -> None:
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{(tmp_path / 'agent-scope.db').as_posix()}"
    )
    async with engine.begin() as connection:
        await connection.run_sync(
            lambda sync_connection: Base.metadata.create_all(
                sync_connection,
                tables=[
                    ConceptNoteRun.__table__,
                    ConceptNoteContextBundleRow.__table__,
                ],
            )
        )
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    run_id = uuid4()
    try:
        async with session_factory() as session, session.begin():
            session.add_all(
                [
                    ConceptNoteRun(
                        run_id=run_id,
                        user_id="owner",
                        name="Run",
                        city_id=str(uuid4()),
                        idempotency_key=uuid4(),
                        request_fingerprint="a" * 64,
                        workflow_step=workflow_step,
                        context_summary={"context_bundle": {"status": "ready"}},
                        permission_summary={},
                    ),
                    ConceptNoteContextBundleRow(
                        run_id=run_id,
                        context_bundle=ConceptNoteContextBundle().model_dump(
                            mode="json"
                        ),
                    ),
                ]
            )
        edit_request = (
            EditProposalRequest(
                instruction="Make the opening shorter.", idempotency_key=uuid4()
            )
            if edit_enabled
            else None
        )

        tools, agent = await _agent_tools(
            cc_access_token="token",
            session_factory=session_factory,
            concept_note_run_id=run_id,
            concept_note_edit_request=edit_request,
        )

        expected = list(CNB_BASE_TOOLS)
        if sources_available:
            expected.append("concept_note_sources_query")
            if edit_enabled:
                expected.append("concept_note_edit_propose")
        assert tools == expected
        assert agent.tool_use_behavior == {
            "stop_at_tool_names": ["concept_note_ask_question"]
        }
        if sources_available and edit_enabled:
            assert agent.tools[-1].params_json_schema["properties"] == {}
    finally:
        await engine.dispose()


async def test_help_receives_active_ui_locale(monkeypatch):
    """The CNB frontend language must reach help so labels match the UI."""
    monkeypatch.setattr(
        "app.services.agent_service.load_agent_context",
        AsyncMock(return_value={"workflow_step": None}),
    )
    build = MagicMock(return_value=[])
    monkeypatch.setattr(
        "app.services.agent_service.build_concept_note_help_tools", build
    )
    await _agent_tools(
        session_factory=MagicMock(),
        concept_note_run_id=uuid4(),
        concept_note_ui_locale="pt",
    )
    assert build.call_args.kwargs["ui_locale"] == "pt"
