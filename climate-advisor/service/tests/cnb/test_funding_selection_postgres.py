"""Verify funding/edit lock ordering with real PostgreSQL row locks."""

import asyncio
import os
from types import SimpleNamespace
from uuid import uuid4

import pytest
import pytest_asyncio
from app.db.cnb import CnbBase
from app.models.cnb.concept_note_edits import EditPlanOutput, EditProposalRequest
from app.models.db.concept_note import ConceptNoteContextBundle, ConceptNoteRun
from app.models.db.thread import Thread
from app.persistence.concept_notes.edits import ConceptNoteEditRepository
from app.persistence.concept_notes.workspace import ConceptNoteWorkspaceRepository
from app.services.cnb.edits import ConceptNoteEditService
from app.services.cnb.funding_selection import save_funding_selection
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.schema import CreateSchema, DropSchema
from tests.cnb.test_funding_selection import _draft, _run, _seed, _selection

pytestmark = pytest.mark.skipif(
    not os.getenv("CNB_TEST_DATABASE_URL"),
    reason="Requires disposable CNB_TEST_DATABASE_URL",
)


@pytest_asyncio.fixture
async def funding_workspace():
    """Keep both stores in an isolated schema removed after each test."""
    url = os.environ["CNB_TEST_DATABASE_URL"].replace(
        "postgresql://", "postgresql+asyncpg://"
    )
    schema = f"cc873_test_{uuid4().hex}"
    admin = create_async_engine(url)
    engine = create_async_engine(
        url, connect_args={"server_settings": {"search_path": schema}}
    )
    try:
        async with admin.begin() as connection:
            await connection.execute(CreateSchema(schema))
        async with engine.begin() as connection:
            for table in (
                ConceptNoteRun.__table__,
                Thread.__table__,
                ConceptNoteContextBundle.__table__,
            ):
                await connection.run_sync(table.create)
            await connection.run_sync(CnbBase.metadata.create_all)
        sessions = async_sessionmaker(engine, expire_on_commit=False)
        workspace = ConceptNoteWorkspaceRepository(sessions)
        first, second, opportunity = await _seed(sessions)
        async with sessions() as session:
            run = await _run(session)
            selected = await save_funding_selection(
                session, run, _selection(first, opportunity), reference_factory=sessions
            )
        await _draft(
            workspace, run.run_id, selected.template.chapter_schema, "Keep this draft."
        )
        yield sessions, workspace, run, first, second, opportunity
    finally:
        await engine.dispose()
        async with admin.begin() as connection:
            await connection.execute(DropSchema(schema, cascade=True, if_exists=True))
        await admin.dispose()


async def test_switch_waits_for_edit_registration_then_rejects_active_planning(
    funding_workspace,
):
    sessions, workspace, run, first, second, opportunity = funding_workspace
    registration = asyncio.Event()
    register = asyncio.Event()
    planning = asyncio.Event()
    finish = asyncio.Event()
    repository = ConceptNoteEditRepository(sessions)
    start = repository.start

    async def delayed_start(**kwargs):
        registration.set()
        await register.wait()
        return await start(**kwargs)

    async def plan(*args, **kwargs):
        planning.set()
        await finish.wait()
        return EditPlanOutput(intent="clarification", clarification="Which wording?")

    repository.start = delayed_start
    service = ConceptNoteEditService(
        repository, workspace, SimpleNamespace(plan=plan), workflow_sessions=sessions
    )

    async def switch():
        async with sessions() as session:
            current = await session.get(ConceptNoteRun, run.run_id)
            return await save_funding_selection(
                session,
                current,
                _selection(second, None, first, opportunity, True),
                reference_factory=sessions,
            )

    edit = asyncio.create_task(
        service._propose(
            run,
            EditProposalRequest(instruction="Improve wording", idempotency_key=uuid4()),
            recent_messages=None,
        )
    )
    switch_task = None
    try:
        await asyncio.wait_for(registration.wait(), 5)
        switch_task = asyncio.create_task(switch())
        # This must stay blocked even though no processing proposal exists yet.
        done, _ = await asyncio.wait({switch_task}, timeout=0.2)
        assert not done
        register.set()
        await asyncio.wait_for(planning.wait(), 5)
        with pytest.raises(HTTPException) as busy:
            await asyncio.wait_for(switch_task, 5)
        assert busy.value.status_code == 409
    finally:
        register.set()
        finish.set()
        await asyncio.wait_for(edit, 5)
        if switch_task is not None and not switch_task.done():
            switch_task.cancel()
            await asyncio.gather(switch_task, return_exceptions=True)


async def test_edit_waits_for_switch_then_reads_the_new_funder(funding_workspace):
    sessions, workspace, run, first, second, opportunity = funding_workspace
    contexts = []

    async def plan(request, chapters, context, **kwargs):
        contexts.append(context)
        return EditPlanOutput(intent="clarification", clarification="Which wording?")

    service = ConceptNoteEditService(
        ConceptNoteEditRepository(sessions),
        workspace,
        SimpleNamespace(plan=plan),
        workflow_sessions=sessions,
    )
    async with sessions() as session:
        current = await session.get(ConceptNoteRun, run.run_id, with_for_update=True)
        edit = asyncio.create_task(
            service._propose(
                run,
                EditProposalRequest(
                    instruction="Improve wording", idempotency_key=uuid4()
                ),
                recent_messages=None,
            )
        )
        try:
            done, _ = await asyncio.wait({edit}, timeout=0.2)
            assert not done and not contexts
            await save_funding_selection(
                session,
                current,
                _selection(second, None, first, opportunity, True),
                reference_factory=sessions,
            )
            result = await asyncio.wait_for(edit, 5)
            assert result.status == "clarification_required"
            assert contexts[0]["funder_context"]["funder"]["id"] == str(second)
        finally:
            await session.rollback()
            if not edit.done():
                edit.cancel()
                await asyncio.gather(edit, return_exceptions=True)
