"""Async session factory for the externally managed CNB reference database."""

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config.settings import get_settings
from app.db.session import _ensure_asyncpg_url


_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def _create_session_factory() -> async_sessionmaker[AsyncSession]:
    """Create the shared CNB reference-data session factory."""
    global _engine, _session_factory
    if _session_factory is not None:
        return _session_factory

    database_url = get_settings().cnb_database_url
    if not database_url:
        raise RuntimeError("CNB_DATABASE_URL is not configured")

    _engine = create_async_engine(
        _ensure_asyncpg_url(database_url),
        pool_pre_ping=True,
    )
    _session_factory = async_sessionmaker(_engine, expire_on_commit=False)
    return _session_factory


def get_cnb_reference_session_factory() -> async_sessionmaker[AsyncSession]:
    """Return the shared session factory for managed funding reference data."""
    return _session_factory or _create_session_factory()
