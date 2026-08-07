"""
Brief: Initialize pgvector and development vector tables in Climate Advisor Postgres.

Inputs:
- CLI args: `--log-level` selects the Python logging level; defaults to `INFO`.
- Files/paths: reads database and model configuration from the Climate Advisor
  service and `llm_config.yaml`.
- Env vars: `CA_DATABASE_URL` selects the PostgreSQL database.

Outputs:
- Creates the pgvector extension and missing vector tables in the configured
  database, and logs progress to the terminal.

Usage (from project root):
- uv run --directory service python -m scripts.initialize_vector_db
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

from app.config.settings import get_settings
from app.utils.logging_config import configure_logging


PROJECT_ROOT = Path(__file__).resolve().parents[2]


def parse_args() -> argparse.Namespace:
    """Parse the logging level for vector initialization."""
    parser = argparse.ArgumentParser(
        description="Initialize pgvector and local-development vector tables."
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"),
        help="Python logging level (default: INFO).",
    )
    return parser.parse_args()


def main() -> None:
    """Validate database configuration and initialize vector storage."""
    args = parse_args()
    configure_logging(level=args.log_level)

    # Expose project-root vector utilities to the service-scoped CLI module.
    project_root = str(PROJECT_ROOT)
    if project_root not in sys.path:
        sys.path.insert(0, project_root)

    from vector_db.vector_init import create_vector_tables, init_pgvector

    if not get_settings().database_url:
        raise SystemExit("CA_DATABASE_URL is required")

    async def initialize() -> None:
        """Run extension and table initialization in dependency order."""
        await init_pgvector()
        await create_vector_tables()

    asyncio.run(initialize())


if __name__ == "__main__":
    main()
