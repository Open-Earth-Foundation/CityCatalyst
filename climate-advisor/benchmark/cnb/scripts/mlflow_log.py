"""Log existing CNB results to MLflow or restore them for static review.

Inputs: log RUN_DIR [--draft]; or download MLFLOW_RUN_ID
--results-dir DIR. Uses MLFLOW_TRACKING_URI, MLFLOW_TRACKING_USERNAME/PASSWORD
from the process environment (does not load .env files).
Outputs: parent and fixture runs in Clima-CNB-Benchmark, or verified files in
DIR/runs/<original-run-id>. Logs the parent ID. No benchmark providers are called.

Usage from climate-advisor/:
    uv run python -m benchmark.cnb.scripts.mlflow_log log output/cnb/runs/example
    uv run python -m benchmark.cnb.scripts.mlflow_log download ID --results-dir output/cnb
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
from pathlib import Path
from typing import Any

from mlflow.tracking import MlflowClient

from benchmark.utils.mlflow_export import download_run, export_run_dir

logger = logging.getLogger(__name__)
EXPERIMENT = "Clima-CNB-Benchmark"
STAGES = ("extraction", "chapter_writing", "verification", "editing")


def _payload(report: dict[str, Any]) -> tuple[
    dict[str, float | None], dict[str, object], dict[str, str],
    dict[str, dict[str, float | None]],
]:
    """Map current and historical report fields without inventing missing values."""
    fixtures = report.get("fixtures", [])
    stages = report.get("requested_stages") or [
        name for name in STAGES if any(f.get(name) is not None for f in fixtures)
    ]
    children = {}
    quality = False
    unavailable = bool(not report.get("completed", True) or report.get("run_errors") or not fixtures or not stages)
    usage_rows = []
    # Separate unavailable judgments from actual quality failures.
    for fixture in fixtures:
        values = {}
        if fixture.get("approval_status") != "approved" or fixture.get("approval_errors"):
            unavailable = True
        for name in stages:
            stage = fixture.get(name)
            if stage is None:
                unavailable = True
                continue
            quality |= bool(stage.get("integrity_failures") or stage.get("semantic_failures"))
            if stage.get("judgment") is None or stage.get("evaluation_errors"):
                unavailable = True
            values.update({f"{name}.{k}": v for k, v in stage.get("metrics", {}).items()})
        for name, usage in fixture.get("usage", {}).items():
            usage_rows.append(usage)
            for key, value in usage.items():
                if isinstance(value, (int, float)):
                    values[f"{name}.{key}"] = value
        children[fixture["fixture_id"]] = values
    missing = set(report.get("expected_fixture_ids", [])) - set(children)
    unavailable |= bool(missing)
    tags = {"suite": "cnb",
            "run_id": report.get("run_id") or "", "label": report.get("label") or "",
            "code_version": report.get("code_version") or "unknown",
            "approval_state": "approved" if fixtures and all(
                f.get("approval_status") == "approved" and not f.get("approval_errors")
                for f in fixtures) else "unapproved",
            "execution_state": "completed" if report.get("completed", True) and not report.get("run_errors") else "incomplete",
            "quality_failures": str(quality).lower(),
            "evaluation_unavailable": str(unavailable).lower()}
    params = {k: report.get(k) for k in (
        "code_version", "analysis_contract_version", "corpus_fingerprint",
        "evaluator_fingerprint", "judge_prompt_versions", "models", "requested_stages",
        "producer_prompt_versions", "llm_config_sha256", "dependency_lock_sha256")}
    params["requested_stages"] = stages
    params["fixtures"] = report.get("expected_fixture_ids") or list(children)
    metrics = {"fixture_count": len(fixtures), "quality_failures": int(quality),
               "evaluation_unavailable": int(unavailable)}
    if report.get("wall_seconds") is not None:
        metrics["wall_seconds"] = report["wall_seconds"]
    for key in ("requests", "input_tokens", "output_tokens", "reasoning_tokens", "cost_usd"):
        if usage_rows and all(row.get(key) is not None for row in usage_rows):
            metrics[key] = sum(row[key] for row in usage_rows)
    if usage_rows and all("cost_complete" in row for row in usage_rows):
        metrics["cost_complete"] = int(all(row["cost_complete"] for row in usage_rows))
    return metrics, params, tags, children


def log_run_dir(run_dir: Path, *, draft: bool = False) -> str | None:
    """Best-effort post-finalization hook; return parent ID or None on any failure.

    Requires an explicit tracking URI; never redirects to the service experiment.
    Failure logs only its type, avoiding credential-bearing transport errors.
    """
    try:
        if not os.environ.get("MLFLOW_TRACKING_URI"):
            raise ValueError("MLFLOW_TRACKING_URI is required")
        report = json.loads((run_dir / "report.json").read_text(encoding="utf-8"))
        metrics, params, tags, children = _payload(report)
        tags["run_id"] = report.get("run_id") or run_dir.name
        if draft:
            tags["draft"] = "true"
        run_id = export_run_dir(run_dir, experiment_name=EXPERIMENT, metrics=metrics,
                                params=params, tags=tags, children=children)
        logger.info("CNB MLflow export completed run_id=%s", run_id)
        return run_id
    except Exception as error:
        logger.warning("CNB MLflow export failed (%s)", type(error).__name__)
        return None


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse explicit log/download operations."""
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    log = sub.add_parser("log", help="Export a finalized run directory")
    log.add_argument("run_dir", type=Path)
    log.add_argument("--draft", action="store_true", help="Tag as draft=true")
    download = sub.add_parser("download", help="Restore and verify a parent run")
    download.add_argument("run_id")
    download.add_argument("--results-dir", type=Path, required=True)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    """Execute the selected operation; report failures with a nonzero exit code."""
    args = parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
    if args.command == "log":
        return 0 if log_run_dir(args.run_dir, draft=args.draft) else 1
    try:
        client = MlflowClient()
        run = client.get_run(args.run_id)
        if client.get_experiment(run.info.experiment_id).name != EXPERIMENT:
            raise ValueError("Run belongs to another experiment")
        name = run.data.tags.get("run_id", "")
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", name):
            raise ValueError("Invalid original run ID")
        destination = download_run(args.run_id, args.results_dir / "runs" / name)
        logger.info("Restored verified CNB run to %s", destination)
        return 0
    except Exception as error:
        logger.error("CNB MLflow download failed (%s)", type(error).__name__)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
