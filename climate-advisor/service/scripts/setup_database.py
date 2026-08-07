"""
Brief: Check, migrate, or reset the Climate Advisor PostgreSQL database.

Inputs:
- CLI args:
  - `--drop`: Drop the legacy application tables before migrating; destructive.
  - `--check`: Check connectivity without changing the database.
  - `--log-level`: Python logging level; defaults to `INFO`.
- Files/paths: reads `service/alembic.ini` and revisions under
  `service/migrations/versions/`.
- Env vars: `CA_DATABASE_URL` selects the database. The service settings loader
  may read it from the project-root `.env` file.

Outputs:
- Checks connectivity, applies Alembic migrations, and optionally drops the
  legacy application tables. Status and errors are logged to the terminal.

Usage (from project root):
- uv run --directory service python -m scripts.setup_database
- uv run --directory service python -m scripts.setup_database --check
- uv run --directory service python -m scripts.setup_database --drop
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import subprocess
import sys
from pathlib import Path

import asyncpg
from sqlalchemy.engine import make_url

from app.config.settings import get_settings
from app.utils.logging_config import configure_logging


SERVICE_ROOT = Path(__file__).resolve().parents[1]
logger = logging.getLogger(__name__)


def _configured_database_url() -> str:
    """Return the configured database URL in the form accepted by asyncpg."""
    database_url = get_settings().database_url
    if not database_url:
        raise RuntimeError("CA_DATABASE_URL is not configured")
    return database_url.replace("postgresql+asyncpg://", "postgresql://", 1)


async def _check_database_connection() -> bool:
    """Check connectivity and log the PostgreSQL server version."""
    try:
        database_url = _configured_database_url()
        safe_url = make_url(database_url).render_as_string(hide_password=True)
        logger.info("Connecting to database: %s", safe_url)

        connection = await asyncpg.connect(database_url, timeout=10)
        try:
            version = await connection.fetchval("SELECT version()")
        finally:
            await connection.close()

        logger.info("Database connection succeeded: %s", version.split(",")[0])
        return True
    except Exception:
        logger.exception("Database connection failed")
        return False


async def _drop_all_tables() -> bool:
    """Drop the legacy application tables and message role type."""
    try:
        database_url = _configured_database_url()
        logger.warning("Dropping legacy application tables")
        connection = await asyncpg.connect(database_url)
        try:
            # Preserve the vector extension because other schemas may use it.
            await connection.execute(
                """
                DROP TABLE IF EXISTS messages CASCADE;
                DROP TABLE IF EXISTS threads CASCADE;
                DROP TABLE IF EXISTS document_embeddings CASCADE;
                DROP TABLE IF EXISTS alembic_version CASCADE;
                """
            )
            await connection.execute("DROP TYPE IF EXISTS message_role CASCADE;")
        finally:
            await connection.close()

        logger.info("Legacy application tables were dropped")
        return True
    except Exception:
        logger.exception("Failed to drop legacy application tables")
        return False


def _run_alembic(*arguments: str) -> subprocess.CompletedProcess[str]:
    """Run Alembic from the service directory and capture its output."""
    return subprocess.run(
        [sys.executable, "-m", "alembic", *arguments],
        capture_output=True,
        text=True,
        check=False,
        cwd=SERVICE_ROOT,
    )


def _run_alembic_migrations() -> bool:
    """Apply all Alembic migrations and report provider output."""
    try:
        logger.info("Running Alembic migrations from %s", SERVICE_ROOT)
        result = _run_alembic("upgrade", "head")
    except OSError:
        logger.exception("Unable to start Alembic; install dependencies with uv sync --locked")
        return False

    if result.stdout.strip():
        logger.info("Alembic output:\n%s", result.stdout.strip())
    if result.returncode == 0:
        logger.info("Migrations completed successfully")
        return True

    logger.error("Migration failed: %s", result.stderr.strip() or "no error output")
    return False


def _show_migration_status() -> None:
    """Log the current Alembic revision when it can be queried."""
    try:
        result = _run_alembic("current")
    except OSError:
        logger.exception("Unable to query the current Alembic revision")
        return

    if result.returncode == 0:
        logger.info("Current migration status:\n%s", result.stdout.strip() or "unknown")
    else:
        logger.warning("Could not query migration status: %s", result.stderr.strip())


async def setup_database(
    drop_existing: bool = False,
    check_only: bool = False,
) -> bool:
    """Check connectivity, optionally reset legacy tables, and run migrations."""
    # Refuse schema work until the target database has been reached successfully.
    if not await _check_database_connection():
        return False
    if check_only:
        return True

    # Keep destructive reset separate from the normal idempotent migration path.
    if drop_existing and not await _drop_all_tables():
        return False
    if not _run_alembic_migrations():
        return False

    _show_migration_status()
    return True


def parse_args() -> argparse.Namespace:
    """Parse database reset, connectivity-check, and logging options."""
    # Keep destructive reset explicit and separate from read-only connectivity checks.
    parser = argparse.ArgumentParser(
        description="Set up the Climate Advisor database using Alembic migrations."
    )
    parser.add_argument(
        "--drop",
        action="store_true",
        help="Drop legacy application tables before migrating (destructive).",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Check database connectivity without changing the database.",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"),
        help="Python logging level (default: INFO).",
    )
    return parser.parse_args()


def main() -> None:
    """Run the selected database setup operation and return a process status."""
    args = parse_args()
    configure_logging(level=args.log_level)
    try:
        success = asyncio.run(
            setup_database(drop_existing=args.drop, check_only=args.check)
        )
    except KeyboardInterrupt as exc:
        logger.warning("Database setup interrupted")
        raise SystemExit(130) from exc
    if not success:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
