"""Shared fixtures for Concept Note Builder tests."""

import os
from collections.abc import AsyncIterator
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import httpx
import pytest
import pytest_asyncio
from app.db import Base
from app.db.cnb import CnbBase
from app.db.session import get_session_factory, get_session_optional
from app.models.db.concept_note import (
    ConceptNoteContextBundle,
    ConceptNoteRun,
    ConceptNoteUpload,
)
from app.models.db.thread import Thread
from app.routes import messages
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlalchemy.schema import CreateSchema, DropSchema


@pytest_asyncio.fixture
async def chat_client(tmp_path, monkeypatch) -> AsyncIterator[SimpleNamespace]:
    """Serve the messages API over SQLite with auth and the agent stream stubbed."""
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{(tmp_path / 'chat.db').as_posix()}"
    )
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    monkeypatch.setattr(
        "app.utils.citycatalyst_auth.CityCatalystClient.validate_user_identity",
        AsyncMock(return_value="owner"),
    )

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
        yield SimpleNamespace(client=client, factory=factory, handler=handler)
    await engine.dispose()


@pytest.fixture
def cnb_postgres_url() -> str:
    """Return the disposable Postgres URL, skipping when none is configured."""
    url = os.getenv("CNB_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Requires disposable CNB_TEST_DATABASE_URL")
    return url.replace("postgresql://", "postgresql+asyncpg://")


@pytest_asyncio.fixture
async def cnb_postgres_schema(cnb_postgres_url: str) -> AsyncIterator[AsyncEngine]:
    """Create workflow and CNB tables in a throwaway schema dropped afterwards."""
    schema = f"cnb_test_{uuid4().hex}"
    admin = create_async_engine(cnb_postgres_url)
    engine = create_async_engine(
        cnb_postgres_url, connect_args={"server_settings": {"search_path": schema}}
    )
    try:
        async with admin.begin() as connection:
            await connection.execute(CreateSchema(schema))
        async with engine.begin() as connection:
            for table in (
                ConceptNoteRun.__table__,
                Thread.__table__,
                ConceptNoteContextBundle.__table__,
                ConceptNoteUpload.__table__,
            ):
                await connection.run_sync(table.create)
            await connection.run_sync(CnbBase.metadata.create_all)
        yield engine
    finally:
        await engine.dispose()
        async with admin.begin() as connection:
            await connection.execute(DropSchema(schema, cascade=True, if_exists=True))
        await admin.dispose()
