"""Exercise funder import races against real PostgreSQL transaction locks."""

import asyncio
from unittest.mock import patch

import pytest_asyncio
from app.models.db.concept_note import ConceptNoteRun
from app.services.cnb import funder_creation as service
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import async_sessionmaker
from tests.cnb.test_funder_import import (
    _run_with_upload,
)


@pytest_asyncio.fixture
async def import_sessions(cnb_postgres_schema):
    """Keep workflow and catalogue writes in a disposable, isolated schema."""
    return async_sessionmaker(cnb_postgres_schema, expire_on_commit=False)


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
