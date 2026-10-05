"""Exercise funder import races against real PostgreSQL transaction locks."""

import asyncio
import os
from unittest.mock import patch
from uuid import uuid4

import pytest
import pytest_asyncio
from app.db.cnb import CnbBase
from app.models.db.concept_note import (
    ConceptNoteContextBundle,
    ConceptNoteRun,
    ConceptNoteUpload,
)
from app.models.db.thread import Thread
from app.services.cnb import funder_import as service
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.schema import CreateSchema, DropSchema
from tests.cnb.test_funder_import import (
    _draft,
    _ready_import,
    _request,
    _run_with_upload,
    _store_import,
)

pytestmark = pytest.mark.skipif(
    not os.getenv("CNB_TEST_DATABASE_URL"),
    reason="Requires disposable CNB_TEST_DATABASE_URL",
)


@pytest_asyncio.fixture
async def import_sessions():
    """Keep workflow and catalogue writes in a disposable, isolated schema."""
    url = os.environ["CNB_TEST_DATABASE_URL"].replace(
        "postgresql://", "postgresql+asyncpg://"
    )
    schema = f"funder_import_test_{uuid4().hex}"
    admin = create_async_engine(url)
    engine = create_async_engine(
        url, connect_args={"server_settings": {"search_path": schema}}
    )
    try:
        async with admin.begin() as connection:
            await connection.execute(CreateSchema(schema))
        async with engine.begin() as connection:
            for table in (
                Thread.__table__,
                ConceptNoteRun.__table__,
                ConceptNoteContextBundle.__table__,
                ConceptNoteUpload.__table__,
            ):
                await connection.run_sync(table.create)
            await connection.run_sync(CnbBase.metadata.create_all)
        yield async_sessionmaker(engine, expire_on_commit=False)
    finally:
        await engine.dispose()
        async with admin.begin() as connection:
            await connection.execute(DropSchema(schema, cascade=True, if_exists=True))
        await admin.dispose()


async def test_concurrent_starts_accept_and_schedule_only_one_import(import_sessions):
    async with import_sessions() as session:
        run, upload = await _run_with_upload(session)
    first_read = asyncio.Event()
    release = asyncio.Event()
    load = service.load_funder_import

    async def paused_load(session, run):
        current = await load(session, run)
        if not first_read.is_set():
            first_read.set()
            await release.wait()
        return current

    async def start():
        async with import_sessions() as session:
            current_run = await session.get(ConceptNoteRun, run.run_id)
            return await service.start_funder_import(
                session, current_run, upload_id=upload.upload_id, token="test"
            )

    with patch.object(service, "load_funder_import", paused_load), patch.object(
        service, "schedule_funder_import"
    ) as schedule:
        first = asyncio.create_task(start())
        second = None
        try:
            await asyncio.wait_for(first_read.wait(), 5)
            second = asyncio.create_task(start())
            done, _ = await asyncio.wait({second}, timeout=0.2)
            assert not done, "The competing start must wait until the first commits"
            release.set()
            results = await asyncio.wait_for(
                asyncio.gather(first, second, return_exceptions=True), 5
            )
            assert (
                sum(isinstance(result, service.FunderImport) for result in results) == 1
            )
            errors = [result for result in results if isinstance(result, HTTPException)]
            assert len(errors) == 1
            assert errors[0].detail["code"] == "funder_import_running"
            schedule.assert_called_once()
        finally:
            release.set()
            tasks = [task for task in (first, second) if task is not None]
            for task in tasks:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)


async def test_catalogue_confirmation_does_not_clear_a_newer_import(import_sessions):
    async with import_sessions() as session:
        run, upload = await _run_with_upload(session)
        original = _ready_import(upload)
        await _store_import(session, run, original)
        document_id = service._source_document_id
        replacement = None

        async def replace_while_saving(reference, current_run, current_upload):
            nonlocal replacement
            result = await document_id(reference, current_run, current_upload)
            async with import_sessions() as other_session:
                other_run = await other_session.get(ConceptNoteRun, run.run_id)
                replacement = await service.start_funder_import(
                    other_session, other_run, upload_id=upload.upload_id, token="test"
                )
            return result

        with patch.object(
            service, "_source_document_id", replace_while_saving
        ), patch.object(service, "schedule_funder_import"):
            created = await asyncio.wait_for(
                service.create_funder(
                    session,
                    run,
                    _request(_draft(), original.import_id),
                    reference_factory=import_sessions,
                ),
                5,
            )
        assert created.funder_id
        current = await service.load_funder_import(session, run)
        assert current is not None
        assert current.import_id == replacement.import_id
        assert current.status == "processing"
