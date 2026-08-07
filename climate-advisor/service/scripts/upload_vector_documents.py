"""
Brief: Embed PDF documents and store their chunks in Climate Advisor Postgres.

Inputs:
- CLI args:
  - `--directory`: Directory containing PDF files; defaults to
    `vector_db/files` under the project root.
  - `--log-level`: Python logging level; defaults to `INFO`.
- Files/paths: reads `*.pdf` files from the selected directory and chunking
  settings from `vector_db/embedding_config.yml`.
- Env vars: `CA_DATABASE_URL` selects Postgres and `OPENAI_API_KEY` authorizes
  the embedding request. Model/provider settings come from `llm_config.yaml`.

Outputs:
- Creates the pgvector extension when needed and writes document embeddings to
  Postgres. Progress and failures are logged to the terminal.

Usage (from project root):
- uv run --directory service python -m scripts.upload_vector_documents
- uv run --directory service python -m scripts.upload_vector_documents \
    --directory ../vector_db/files
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
    """Parse the source directory and logging level."""
    parser = argparse.ArgumentParser(
        description="Embed PDF files and store their chunks in Climate Advisor Postgres."
    )
    parser.add_argument(
        "--directory",
        type=Path,
        help="Directory containing PDF files (default: ../vector_db/files).",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"),
        help="Python logging level (default: INFO).",
    )
    return parser.parse_args()


def main() -> None:
    """Validate configuration and run the vector-document upload."""
    args = parse_args()
    configure_logging(level=args.log_level)

    # Expose project-root utilities while keeping the service as the app package root.
    project_root = str(PROJECT_ROOT)
    if project_root not in sys.path:
        sys.path.insert(0, project_root)

    from vector_db.config_loader import get_embedding_config
    from vector_db.upload_to_db import process_and_store_documents

    # Resolve centralized settings before starting network or database work.
    settings = get_settings()
    if not settings.database_url:
        raise SystemExit("CA_DATABASE_URL is required")
    if not settings.openai_api_key:
        raise SystemExit("OPENAI_API_KEY is required")

    embedding_config = get_embedding_config()
    default_directory = PROJECT_ROOT / "vector_db" / embedding_config.default_directory
    directory = args.directory or default_directory
    asyncio.run(process_and_store_documents(directory.resolve()))


if __name__ == "__main__":
    main()
