"""Prepare a finished CNB benchmark run as the approved baseline for a review PR.

Copies the run's durable files into the committed store, fills baseline.json
with the exact report and artifact hashes, fingerprints and reviewer, then checks
the result with the same loader the evaluator uses. Approval itself is the human
review of the PR that commits these files.

Inputs:
- --run: finished run folder (for example output/cnb_golden_set/runs/<run-id>).
- --reviewer: person approving the baseline.
- --reference: approval PR or review URL.
- --repeat: another finished run of the same configuration (repeatable). Repeats
  are committed beside the baseline and set the noise range of every comparison;
  run the same commit two more times to measure it.
- --results-dir: committed run store (default benchmark/cnb/results).
- --manifest: manifest to write (default benchmark/cnb/baseline.json).

Outputs (no model calls, network or database):
- <results-dir>/runs/<run-id>/ with report.json, report.md, delivery.json,
  llm_config.json, viewer.js and outputs/ (run-specific comparisons and the
  review bundle are left out).
- The manifest, rewritten only when the copied run validates as comparable.
- Exit 0 on success; 2 for invalid arguments or a run that cannot be a baseline.

Usage (from climate-advisor/):
- uv run python -m benchmark.cnb.scripts.propose_baseline \
      --run output/cnb_golden_set/runs/<run-id> \
      --reviewer "Piotr Nowakowski" --reference https://github.com/.../pull/<n>
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import shutil
import tempfile
from datetime import UTC, datetime
from pathlib import Path

from benchmark.cnb.golden_set.baseline import artifact_digest, load_approved_baseline

logger = logging.getLogger(__name__)
BENCHMARK_ROOT = Path(__file__).resolve().parents[1]
# Comparisons and bundles describe one candidate against an older baseline, not the run itself.
NOT_DURABLE = ("comparison.json", "comparison.md", "review-bundle.zip")


def main(argv: list[str] | None = None) -> int:
    """Copy the run, write a validated manifest, or explain why it cannot be a baseline."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
    parser = argparse.ArgumentParser(description="Prepare a CNB run as the approved baseline.")
    parser.add_argument("--run", type=Path, required=True, help="Finished run folder")
    parser.add_argument("--reviewer", required=True, help="Person approving the baseline")
    parser.add_argument("--reference", required=True, help="Approval PR or review URL")
    parser.add_argument(
        "--repeat",
        type=Path,
        action="append",
        default=[],
        help="Another run of the same configuration; repeat the flag for several",
    )
    parser.add_argument("--results-dir", type=Path, default=BENCHMARK_ROOT / "results")
    parser.add_argument("--manifest", type=Path, default=BENCHMARK_ROOT / "baseline.json")
    args = parser.parse_args(argv)
    report_path = args.run / "report.json"
    if not report_path.is_file():
        parser.error(f"{args.run} has no report.json")
    report = json.loads(report_path.read_text(encoding="utf-8"))
    run_id = report.get("run_id") or args.run.resolve().name
    target = args.results_dir / "runs" / run_id

    # Step 1: build the durable copies and the manifest in a scratch store.
    with tempfile.TemporaryDirectory() as scratch:
        store = Path(scratch)
        copy = store / "runs" / run_id
        shutil.copytree(args.run, copy, ignore=shutil.ignore_patterns(*NOT_DURABLE))
        repeats = []
        for run in args.repeat:
            repeat_id = json.loads((run / "report.json").read_text(encoding="utf-8")).get("run_id") or run.resolve().name
            repeat_copy = store / "runs" / repeat_id
            shutil.copytree(run, repeat_copy, ignore=shutil.ignore_patterns(*NOT_DURABLE))
            repeats.append({
                "run_id": repeat_id,
                "report_sha256": hashlib.sha256((repeat_copy / "report.json").read_bytes()).hexdigest(),
                "artifact_sha256": artifact_digest(repeat_copy),
            })
        fingerprints = {
            "corpus": report.get("corpus_fingerprint"),
            "judge_policy": report.get("evaluator_fingerprint"),
        }
        manifest = {
            "status": "approved",
            "run_id": run_id,
            "report_sha256": hashlib.sha256((copy / "report.json").read_bytes()).hexdigest(),
            "artifact_sha256": artifact_digest(copy),
            "fingerprints": fingerprints,
            "repeats": repeats,
            "approval": {
                "reviewer": args.reviewer,
                "approved_at": datetime.now(UTC).date().isoformat(),
                "reference": args.reference,
            },
        }
        scratch_manifest = store / "baseline.json"
        scratch_manifest.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

        # Step 2: the evaluator's own loader must accept it before anything is written.
        _, selection = load_approved_baseline(scratch_manifest, store, fingerprints)
        if selection["status"] != "comparable":
            logger.error("Run %s cannot be a baseline: %s", run_id, selection["reason"])
            return 2
        # Step 3: publish every run into the committed store.
        for run_dir in [copy, *(store / "runs" / r["run_id"] for r in repeats)]:
            destination = args.results_dir / "runs" / run_dir.name
            if destination.exists() and artifact_digest(destination) != artifact_digest(run_dir):
                logger.error("A different run already exists at %s", destination)
                return 2
        for run_dir in [copy, *(store / "runs" / r["run_id"] for r in repeats)]:
            destination = args.results_dir / "runs" / run_dir.name
            if not destination.exists():
                shutil.copytree(run_dir, destination)
    args.manifest.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    logger.info("Baseline %s written to %s and %s; commit both in the approval PR", run_id, target, args.manifest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
