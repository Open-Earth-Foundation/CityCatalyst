"""Republish the CNB golden-set results folder from the runs saved in it.

The evaluator publishes automatically after every run; use this after pulling
viewer changes, or to re-snapshot runs with the current fixtures.

Inputs:
- --results-dir: results folder (default climate-advisor/output/cnb_golden_set).
- --rebuild: re-snapshot every run with the CURRENT fixtures and prompts
  (default: only runs without ``viewer.js``; those are marked as rebuilt).

Outputs (no model calls, no network, no database):
- <results-dir>/index.html and app.js, pdf/<fixture>.pdf, runs/index.js, and
  runs/<run-id>/viewer.js for each run.

Usage (from climate-advisor/):
- uv run python -m benchmark.scripts.publish [--results-dir benchmark/results]
- open output/cnb_golden_set/index.html (or benchmark/results/index.html) in a
  browser (no server needed)
"""

from __future__ import annotations

import argparse
import logging
from pathlib import Path

from benchmark.golden_set.viewer import DEFAULT_RESULTS_DIR, publish_viewer

logger = logging.getLogger(__name__)


def main(argv: list[str] | None = None) -> int:
    """Refresh the viewer, PDFs, missing run snapshots, and the run index."""
    parser = argparse.ArgumentParser(description="Publish CNB golden-set runs to the viewer.")
    parser.add_argument("--results-dir", type=Path, default=DEFAULT_RESULTS_DIR, help="Results folder")
    parser.add_argument(
        "--rebuild",
        action="store_true",
        help="Re-snapshot every run with the current fixtures and prompts",
    )
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
    index = publish_viewer(args.results_dir, rebuild=args.rebuild)
    logger.info("Open %s", index)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
