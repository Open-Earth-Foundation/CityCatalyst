"""Republish the CNB golden-set results folder from the runs saved in it.

The evaluator publishes automatically after every run; use this after pulling
viewer changes, or to re-snapshot runs with the current fixtures.

Inputs:
- --results-dir: results folder (default climate-advisor/output/cnb_golden_set).
- --candidate: run ID to package in review-bundle.zip; --baseline-manifest/--baseline-results-dir: reviewed manifest and durable runs.
- --rebuild: re-snapshot every run with the CURRENT fixtures and prompts
  (default: only runs without ``viewer.js``; those are marked as rebuilt).

Outputs (no model calls, no network, no database):
- <results-dir>/index.html and app.js, runs/<run-id>/pdf/<fixture>.pdf, runs/index.js, and
  runs/<run-id>/viewer.js for each run.
- With --candidate, recompute comparison.json/.md against the selected approved
  baseline, update delivery.json, and package review-bundle.zip. The saved report
  remains unchanged; only --rebuild replaces an existing viewer snapshot.
- Exit 3 if bundle publication fails; delivery.json records the failure.

Usage (from climate-advisor/):
- uv run python -m benchmark.cnb.scripts.publish [--results-dir benchmark/cnb/results]
- open output/cnb_golden_set/index.html (or benchmark/cnb/results/index.html) in a
  browser (no server needed)
"""

from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path

from benchmark.cnb.golden_set.baseline import (
    compare_reports,
    load_approved_baseline,
    render_comparison,
)
from benchmark.cnb.golden_set.viewer import (
    BENCHMARK_ROOT,
    DEFAULT_RESULTS_DIR,
    RUN_ID_PATTERN,
    publish_bundle,
    publish_viewer,
)

logger = logging.getLogger(__name__)


def main(argv: list[str] | None = None) -> int:
    """Refresh the viewer, PDFs, missing run snapshots, and the run index."""
    parser = argparse.ArgumentParser(
        description="Publish CNB golden-set runs to the viewer."
    )
    parser.add_argument(
        "--results-dir", type=Path, default=DEFAULT_RESULTS_DIR, help="Results folder"
    )
    parser.add_argument(
        "--rebuild",
        action="store_true",
        help="Re-snapshot every run with the current fixtures and prompts",
    )
    parser.add_argument(
        "--candidate", help="Run ID to package as a downloadable review bundle"
    )
    parser.add_argument(
        "--baseline-manifest",
        type=Path,
        default=BENCHMARK_ROOT / "baseline.json",
        help="Reviewed baseline manifest",
    )
    parser.add_argument(
        "--baseline-results-dir",
        type=Path,
        default=BENCHMARK_ROOT / "results",
        help="Durable baseline runs",
    )
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
    index = publish_viewer(args.results_dir, rebuild=args.rebuild)
    if args.candidate:
        if not RUN_ID_PATTERN.fullmatch(args.candidate):
            parser.error("Invalid candidate run ID")
        candidate = args.results_dir / "runs" / args.candidate
        delivery = json.loads((candidate / "delivery.json").read_text(encoding="utf-8"))
        baseline, selection = load_approved_baseline(
            args.baseline_manifest,
            args.baseline_results_dir,
            delivery.get("fingerprints", {}),
        )
        if selection["status"] == "incompatible":
            parser.error(selection["reason"])
        if baseline is not None and baseline.name == candidate.name:
            parser.error("Baseline and candidate run IDs must differ")

        # Re-selecting a baseline must also refresh its deltas and review status.
        report = json.loads((candidate / "report.json").read_text(encoding="utf-8"))
        baseline_report = (
            json.loads((baseline / "report.json").read_text(encoding="utf-8"))
            if baseline
            else None
        )
        comparison = compare_reports(report, baseline_report)
        if delivery.get("execution") != "complete" or not any(
            not fixture.get("inapplicable_reason")
            for fixture in report.get("fixtures", [])
        ):
            comparison["evaluation_unavailable"] = True
        comparison["baseline"] = selection
        delivery["baseline"] = selection
        (candidate / "comparison.json").write_text(
            json.dumps(comparison, ensure_ascii=False, indent=2), encoding="utf-8"
        )

        # Include the publication result in the bundle, and retain failures locally.
        delivery["publication"] = {"status": "published"}
        (candidate / "delivery.json").write_text(
            json.dumps(delivery, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        (candidate / "comparison.md").write_text(
            render_comparison(comparison, delivery), encoding="utf-8"
        )
        try:
            archive = publish_bundle(candidate, args.results_dir, baseline_dir=baseline)
        except Exception as exc:
            delivery["publication"] = {
                "status": "failed",
                "error_type": type(exc).__name__,
            }
            (candidate / "delivery.json").write_text(
                json.dumps(delivery, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            (candidate / "comparison.md").write_text(
                render_comparison(comparison, delivery), encoding="utf-8"
            )
            logger.error(
                "Review bundle publication failed error_type=%s", type(exc).__name__
            )
            return 3
        logger.info("Review bundle: %s", archive)
    logger.info("Open %s", index)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
