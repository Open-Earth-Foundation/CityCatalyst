from __future__ import annotations

from typing import AsyncGenerator
import logging

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.exc import ArgumentError
from sqlalchemy.pool import NullPool

def _ensure_asyncpg_url(url: str) -> str:
    if "+asyncpg" in url:
        return url
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+asyncpg://", 1)
    return url



logger = logging.getLogger(__name__)

from ..config.settings import get_settings

_engine = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def _create_engine():
    global _engine, _session_factory
    if _engine is not None and _session_factory is not None:
        return _engine

    settings = get_settings()
    if not settings.database_url:
        raise RuntimeError("CA_DATABASE_URL is not configured")

    database_url = _ensure_asyncpg_url(settings.database_url)

    engine_kwargs = {
        "echo": settings.database_echo,
        "pool_pre_ping": True,
    }

    if settings.database_pool_size is not None:
        engine_kwargs["pool_size"] = settings.database_pool_size
    if settings.database_max_overflow is not None:
        engine_kwargs["max_overflow"] = settings.database_max_overflow
    if settings.database_pool_timeout is not None:
        engine_kwargs["pool_timeout"] = settings.database_pool_timeout

    try:
        engine = create_async_engine(database_url, **engine_kwargs)
    except ArgumentError:
        # Some dialects (e.g. SQLite) do not support pooling args.
        engine = create_async_engine(
            database_url,
            echo=settings.database_echo,
            poolclass=NullPool,
            pool_pre_ping=True,
        )

    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    _engine = engine
    _session_factory = session_factory
    return engine


def get_engine():
    global _engine
    if _engine is None:
        _create_engine()
    assert _engine is not None
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _session_factory
    if _session_factory is None:
        _create_engine()
    assert _session_factory is not None
    return _session_factory


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    session_factory = get_session_factory()
    async with session_factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise

async def get_session_optional() -> AsyncGenerator[AsyncSession | None, None]:
    """Return a session when available, otherwise yield None without raising.
    """
    try:
        session_factory = get_session_factory()
    except Exception:
        logger.exception("Failed to create database session factory")
        yield None
        return

    try:
        async with session_factory() as session:
            try:
                yield session
            except Exception:
                await session.rollback()
                raise
    except Exception:
        # Fallback: yield None for genuine database errors
        logger.exception("Database session unavailable")
        yield None
        return
