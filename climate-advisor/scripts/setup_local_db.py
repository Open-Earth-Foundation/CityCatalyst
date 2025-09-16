#!/usr/bin/env python3
"""Utility to (re)create the Climate Advisor Postgres schema locally."""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

from dotenv import find_dotenv, load_dotenv

# Ensure `app` package is importable when the script runs from repo root
REPO_ROOT = Path(__file__).resolve().parents[1]
SERVICE_ROOT = REPO_ROOT / "service"
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))


def _load_env() -> None:
    env_path = find_dotenv(usecwd=True)
    if env_path:
        load_dotenv(env_path)
    else:
        load_dotenv(REPO_ROOT / ".env")


def _import_models() -> None:
    # Import models so SQLAlchemy Metadata is populated
    from app.models.db import message, thread  # noqa: F401


async def _setup_database(drop_existing: bool) -> None:
    from sqlalchemy.exc import OperationalError

    from app.db import Base
    from app.db.session import get_engine

    engine = get_engine()

    try:
        async with engine.begin() as conn:
            if drop_existing:
                await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)
    except OperationalError as exc:
        raise SystemExit(
            "Failed to connect to the database. Check CA_DATABASE_URL and ensure Postgres is running."
        ) from exc


def main() -> None:
    parser = argparse.ArgumentParser(description="Create or reset the Climate Advisor database schema")
    parser.add_argument(
        "--drop",
        action="store_true",
        help="Drop existing tables before recreating them (destructive).",
    )
    args = parser.parse_args()

    _load_env()
    _import_models()
    asyncio.run(_setup_database(drop_existing=args.drop))
    action = "Reset" if args.drop else "Created"
    print(f"{action} Climate Advisor database schema successfully.")


if __name__ == "__main__":
    main()

