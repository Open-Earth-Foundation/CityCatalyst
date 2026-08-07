"""
Brief: Run common Alembic migration operations for Climate Advisor.

Inputs:
- CLI args: one command (`upgrade`, `downgrade`, `current`, `history`,
  `create`, or `auto`); `create` and `auto` require a migration description.
- Files/paths: reads `service/alembic.ini` and migration revisions under
  `service/migrations/`.
- Env vars: `CA_DATABASE_URL` selects the PostgreSQL database used by Alembic.

Outputs:
- Streams Alembic output to the terminal and may update the configured database
  or create a migration revision, depending on the selected command.

Usage (from project root):
- uv run --directory service python -m scripts.migrate upgrade
- uv run --directory service python -m scripts.migrate auto "add status column"
"""

from __future__ import annotations

import argparse
import logging
import subprocess
import sys
from pathlib import Path

from app.utils.logging_config import configure_logging


logger = logging.getLogger(__name__)
SERVICE_ROOT = Path(__file__).resolve().parents[1]


def parse_args() -> argparse.Namespace:
    """Parse the migration command and optional revision description."""
    # Keep every migration operation behind an explicit argparse subcommand.
    parser = argparse.ArgumentParser(
        description="Run a Climate Advisor Alembic migration command."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    for command, help_text in (
        ("upgrade", "Apply all pending migrations."),
        ("downgrade", "Downgrade one migration revision."),
        ("current", "Show the current migration revision."),
        ("history", "Show migration history."),
    ):
        subparsers.add_parser(command, help=help_text)

    for command, help_text in (
        ("create", "Create an empty migration revision."),
        ("auto", "Autogenerate a migration revision from model changes."),
    ):
        command_parser = subparsers.add_parser(command, help=help_text)
        command_parser.add_argument("description", help="Migration revision description.")

    return parser.parse_args()


def run_alembic(arguments: list[str]) -> int:
    """Run Alembic from the service directory and return its exit code."""
    command = [sys.executable, "-m", "alembic", *arguments]
    logger.info("Running: %s", " ".join(command))
    result = subprocess.run(command, cwd=SERVICE_ROOT, check=False)
    return result.returncode


def main() -> None:
    """Dispatch the selected migration command to Alembic."""
    configure_logging(format_string="%(message)s")
    args = parse_args()

    # Map read/apply commands directly to their Alembic arguments.
    simple_commands = {
        "upgrade": ["upgrade", "head"],
        "downgrade": ["downgrade", "-1"],
        "current": ["current"],
        "history": ["history"],
    }
    if args.command in simple_commands:
        exit_code = run_alembic(simple_commands[args.command])
    else:
        revision_args = ["revision", "-m", args.description]
        if args.command == "auto":
            revision_args.insert(1, "--autogenerate")
        exit_code = run_alembic(revision_args)

    # Preserve Alembic's non-zero status for shell automation.
    if exit_code:
        raise SystemExit(exit_code)


if __name__ == "__main__":
    main()
