from __future__ import annotations

import logging
from typing import Any, AsyncGenerator

from sqlalchemy.exc import ArgumentError
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from app.config.settings import get_settings


def _ensure_asyncpg_url(url: str) -> str:
    """Normalize a PostgreSQL URL for SQLAlchemy's asyncpg driver."""
    if "+asyncpg" in url:
        return url
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+asyncpg://", 1)
    return url



logger = logging.getLogger(__name__)

_engine = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def _create_engine() -> AsyncEngine:
    """Create and cache the service engine and async session factory."""
    global _engine, _session_factory
    if _engine is not None and _session_factory is not None:
        return _engine

    settings = get_settings()
    if not settings.database_url:
        raise RuntimeError("CA_DATABASE_URL is not configured")

    database_url = _ensure_asyncpg_url(settings.database_url)

    engine_kwargs: dict[str, Any] = {
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
    except (ArgumentError, TypeError):
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


def get_engine() -> AsyncEngine:
    """Return the shared async engine, creating it on first use."""
    global _engine
    if _engine is None:
        _create_engine()
    assert _engine is not None
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    """Return the shared async session factory, creating it on first use."""
    global _session_factory
    if _session_factory is None:
        _create_engine()
    assert _session_factory is not None
    return _session_factory


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Yield a transactional request session and roll back on failure."""
    session_factory = get_session_factory()
    async with session_factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def get_session_optional() -> AsyncGenerator[AsyncSession | None, None]:
    """Yield a session when available, otherwise yield ``None``."""
    # Keep optional database outages from preventing non-persistent request paths.
    try:
        session_factory = get_session_factory()
    except Exception:
        logger.exception("Failed to create database session factory")
        yield None
        return

    session_provided = False
    try:
        async with session_factory() as session:
            session_provided = True
            try:
                yield session
            except Exception:
                await session.rollback()
                raise
    except Exception:
        if session_provided:
            raise
        logger.exception("Database session unavailable")
        yield None
