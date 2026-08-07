"""
Brief: Generate a JSON quality baseline for the configured text splitter.

Inputs:
- CLI args:
  - `--fixture`: UTF-8 text fixture to analyze; defaults to the committed GPC
    excerpt fixture.
  - `--output`: Optional JSON destination; omit it to write JSON to stdout.
- Files/paths: reads the selected text fixture, `vector_db/embedding_config.yml`,
  and the embedding model configured in `llm_config.yaml`.
- Env vars: none required.

Outputs:
- Writes or prints JSON containing chunk sizes, overlaps, boundary metrics, and
  stable hashes.

Usage (from project root):
- uv run --directory service python -m scripts.splitter_baseline
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_FIXTURE = (
    PROJECT_ROOT
    / "service"
    / "tests"
    / "fixtures"
    / "splitter_baseline"
    / "gpc_excerpt_multi_paragraph.txt"
)


def parse_args() -> argparse.Namespace:
    """Parse the input fixture and optional JSON destination."""
    parser = argparse.ArgumentParser(
        description="Generate a splitter baseline artifact for a text fixture."
    )
    parser.add_argument(
        "--fixture",
        type=Path,
        default=DEFAULT_FIXTURE,
        help="Path to the input UTF-8 text fixture.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Optional path for the generated baseline JSON.",
    )
    return parser.parse_args()


def main() -> None:
    """Generate the baseline and write it to a file or stdout."""
    args = parse_args()

    # Expose project-root vector utilities to the service-scoped CLI module.
    project_root = str(PROJECT_ROOT)
    if project_root not in sys.path:
        sys.path.insert(0, project_root)

    from vector_db.splitter_baseline import build_baseline

    encoded = json.dumps(
        build_baseline(args.fixture),
        indent=2,
        ensure_ascii=True,
    )
    if args.output:
        args.output.write_text(encoded, encoding="utf-8")
    else:
        print(encoded)


if __name__ == "__main__":
    main()
