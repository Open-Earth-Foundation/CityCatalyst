"""Alembic environment for the database configured by ``CNB_DATABASE_URL``."""

from __future__ import annotations

import asyncio
import os
from logging.config import fileConfig

from alembic import context
from app.db.cnb import CnbBase
from app.models.db.cnb_reference import (  # noqa: F401
    CnbFundedProject,
    CnbFunder,
    CnbFunderCriterion,
    CnbFunderTemplate,
    CnbFundingEvidence,
    CnbFundingOpportunity,
    CnbSourceDocument,
)
from app.models.db.cnb_workspace import (  # noqa: F401
    ConceptNoteChapter,
    ConceptNoteChapterRevision,
    ConceptNoteChapterValidation,
    ConceptNoteEvidenceLink,
    ConceptNoteExport,
    ConceptNoteGap,
    ConceptNoteMatchedProject,
)
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = CnbBase.metadata


def get_database_url() -> str:
    """Return the configured CNB URL using the asyncpg SQLAlchemy dialect."""
    database_url = os.getenv("CNB_DATABASE_URL")
    if not database_url:
        raise RuntimeError("CNB_DATABASE_URL is not configured")
    if database_url.startswith("postgres://"):
        return database_url.replace("postgres://", "postgresql+asyncpg://", 1)
    if database_url.startswith("postgresql://"):
        return database_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return database_url


def configure_context(*, connection: Connection | None = None) -> None:
    """Configure Alembic with isolated metadata and version tracking."""
    options = {
        "target_metadata": target_metadata,
        "version_table": "cnb_alembic_version",
        "compare_type": True,
        "compare_server_default": True,
    }
    if connection is None:
        context.configure(
            url=get_database_url(),
            literal_binds=True,
            dialect_opts={"paramstyle": "named"},
            **options,
        )
        return
    context.configure(connection=connection, **options)


def run_migrations_offline() -> None:
    """Emit SQL without opening a database connection."""
    configure_context()
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Apply migrations through one short-lived async connection."""
    configuration = config.get_section(config.config_ini_section) or {}
    configuration["sqlalchemy.url"] = get_database_url()
    connectable = async_engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(_run)
    await connectable.dispose()


def _run(connection: Connection) -> None:
    """Run the configured revision chain on a synchronous connection proxy."""
    configure_context(connection=connection)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run online migrations from Alembic's synchronous entry point."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
