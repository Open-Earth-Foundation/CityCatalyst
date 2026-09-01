from __future__ import annotations

from uuid import uuid4

import pytest
from app.config import get_settings
from app.db import Base
from app.models.cnb.context_bundle import ConceptNoteContextBundle
from app.models.db.concept_note import (
    ConceptNoteContextBundle as ConceptNoteContextBundleRow,
)
from app.models.db.concept_note import ConceptNoteRun
from app.services.agent_service import AgentService
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


@pytest.mark.asyncio
async def test_source_query_registration_requires_ready_bundle_and_allowed_step(
    tmp_path,
    monkeypatch,
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
                        workflow_step="interviewing",
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
        settings = get_settings().model_copy(deep=True)
        settings.openrouter_api_key = "test-key"
        settings.langsmith_tracing_enabled = False
        monkeypatch.setattr(
            "app.services.agent_service.get_settings",
            lambda: settings,
        )

        service = AgentService(
            cc_access_token="token",
            cc_thread_id=uuid4(),
            cc_user_id="owner",
            session_factory=session_factory,
            concept_note_run_id=run_id,
        )
        agent = await service.create_agent()
        assert [tool.name for tool in agent.tools] == ["concept_note_sources_query"]
        assert service.active_instructions == settings.llm.prompts.compose_prompt("cnb_chat")
        await service.close()

        async with session_factory() as session, session.begin():
            run = await session.get(ConceptNoteRun, run_id)
            assert run is not None
            run.workflow_step = "assembling_context"
        service = AgentService(
            cc_access_token="token",
            cc_thread_id=uuid4(),
            cc_user_id="owner",
            session_factory=session_factory,
            concept_note_run_id=run_id,
        )
        agent = await service.create_agent()
        assert agent.tools == []
        await service.close()
    finally:
        await engine.dispose()
