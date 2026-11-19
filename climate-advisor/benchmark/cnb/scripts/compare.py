"""Compare any two saved CNB benchmark runs offline and review them side by side.

Works on run folders from anywhere: a local run in output/cnb_golden_set, the
committed baseline store benchmark/cnb/results, or a run restored from MLflow.
Score deltas, new failures and resolved failures are reported only when both runs
used the same fixtures, golden expectations and judge policy; otherwise both runs
are shown side by side with the reason they are not comparable.

Inputs:
- --baseline-run: run folder containing report.json and viewer.js (run A).
- --candidate-run: run folder containing report.json and viewer.js (run B).
- --baseline-repeat: another run of run A's configuration (repeatable). Their
  spread is the noise range: changes inside it are "within noise", and items
  whose verdict differs between the A runs are "flaky".
- --output: review folder to create (default
  climate-advisor/output/cnb_compare/<baseline-id>__<candidate-id>); an existing
  folder is refused.

Outputs (no model calls, network or database; the input runs are not modified):
- <output>/index.html opening on the A → B comparison, with both runs under runs/.
- <output>/comparison.json and comparison.md with per-fixture, per-stage results.
- Exit 0 when nothing regressed (outcome improved or unchanged); 1 when
  something regressed (regressed or mixed); 2 for invalid arguments; 3 when the
  runs are not comparable or a judgment is unavailable (the side-by-side review
  is still written).

Usage (from climate-advisor/):
- uv run python -m benchmark.cnb.scripts.compare \
      --baseline-run benchmark/cnb/results/runs/<approved-run-id> \
      --candidate-run output/cnb_golden_set/runs/<your-run-id>
"""

from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path

from benchmark.cnb.golden_set.baseline import (
    compare_reports,
    incompatibility,
    render_comparison,
    repeat_problems,
)
from benchmark.cnb.golden_set.viewer import write_review_site

logger = logging.getLogger(__name__)
DEFAULT_OUTPUT_ROOT = Path(__file__).resolve().parents[3] / "output" / "cnb_compare"


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse and validate the two run folders and the review destination."""
    parser = argparse.ArgumentParser(description="Compare two saved CNB benchmark runs.")
    parser.add_argument("--baseline-run", type=Path, required=True, help="Run A folder")
    parser.add_argument("--candidate-run", type=Path, required=True, help="Run B folder")
    parser.add_argument(
        "--baseline-repeat",
        type=Path,
        action="append",
        default=[],
        help="Another run of run A's configuration; repeat the flag for several",
    )
    parser.add_argument("--output", type=Path, help="Review folder to create")
    args = parser.parse_args(argv)
    for run in (args.baseline_run, args.candidate_run):
        if not (run / "report.json").is_file() or not (run / "viewer.js").is_file():
            parser.error(f"{run} is not a published run folder (needs report.json and viewer.js)")
    if args.baseline_run.resolve().name == args.candidate_run.resolve().name:
        parser.error("Baseline and candidate run IDs must differ")
    if args.output is None:
        args.output = DEFAULT_OUTPUT_ROOT / f"{args.baseline_run.resolve().name}__{args.candidate_run.resolve().name}"
    if args.output.exists():
        parser.error(f"{args.output} already exists")
    return args


def main(argv: list[str] | None = None) -> int:
    """Write the comparison and review site; exit 3 when scores are not comparable."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
    args = parse_args(argv)
    baseline = json.loads((args.baseline_run / "report.json").read_text(encoding="utf-8"))
    candidate = json.loads((args.candidate_run / "report.json").read_text(encoding="utf-8"))

    # Only comparable runs get deltas; others are reviewed side by side.
    reasons = incompatibility(baseline, candidate)
    repeats = [
        json.loads((run / "report.json").read_text(encoding="utf-8"))
        for run in args.baseline_repeat
    ]
    seen = {baseline.get("run_id"), candidate.get("run_id")}
    for repeat in repeats:
        run_id = repeat.get("run_id")
        if run_id in seen:
            reasons.append(f"repeat {run_id} must be independent of the compared runs and other repeats")
        seen.add(run_id)
        reasons.extend(f"repeat {run_id}: {reason}" for reason in repeat_problems(baseline, repeat))
    comparison = compare_reports(candidate, None if reasons else baseline, repeats)
    selection = {
        "status": "incompatible" if reasons else "comparable",
        "reason": "; ".join(reasons) or "Same fixtures, expectations and judge policy",
        "baseline_run_id": args.baseline_run.resolve().name,
    }
    comparison["baseline"] = selection
    # Reports from before completion tracking count as complete, as in GoldenSetReport.
    delivery = {
        "execution": "incomplete" if candidate.get("completed") is False else "complete",
        "baseline": selection,
        "publication": {"status": "published"},
    }

    # Write a browser-only review site of both runs, then the summary beside it.
    args.output.mkdir(parents=True)
    index = write_review_site(args.output, args.candidate_run, args.baseline_run, comparison)
    (args.output / "comparison.json").write_text(json.dumps(comparison, ensure_ascii=False), encoding="utf-8")
    (args.output / "comparison.md").write_text(render_comparison(comparison, delivery), encoding="utf-8")
    if reasons:
        logger.warning("Runs are not comparable: %s", selection["reason"])
    logger.info("Outcome: %s. Open %s", comparison["outcome"], index)
    if reasons or comparison["evaluation_unavailable"]:
        return 3
    return 1 if comparison["quality_regression"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
