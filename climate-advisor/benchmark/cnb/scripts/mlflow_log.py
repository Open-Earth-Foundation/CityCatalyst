"""Log existing CNB results to MLflow or restore them for static review.

Inputs: log RUN_DIR [--draft]; or download MLFLOW_RUN_ID
--results-dir DIR. Uses MLFLOW_TRACKING_URI, MLFLOW_TRACKING_USERNAME/PASSWORD
from the process environment, falling back to climate-advisor/.env for
MLFLOW_TRACKING_* values without overriding existing variables.
Inputs on log: report.json, optional delivery.json and comparison.json in RUN_DIR.
Outputs: readable run descriptions, parent quality/mean metrics, and fixture runs
with provenance and stage status in Clima-CNB-Benchmark, or verified files in
DIR/runs/<original-run-id>. Logs the parent ID. No benchmark providers are called.

Usage from climate-advisor/:
    uv run python -m benchmark.cnb.scripts.mlflow_log log output/cnb/runs/example
    uv run python -m benchmark.cnb.scripts.mlflow_log download ID --results-dir output/cnb
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import os
import re
from pathlib import Path
from typing import Any

from dotenv import dotenv_values
from mlflow.tracking import MlflowClient

from benchmark.utils.mlflow_export import download_run, export_run_dir

logger = logging.getLogger(__name__)
EXPERIMENT = "Clima-CNB-Benchmark"
STAGES = ("extraction", "chapter_writing", "verification", "editing")
RATE_METRICS = {
    "fact_evidence_retained", "pair_evidence_in_chapter", "required_fact_coverage",
    "desirable_fact_coverage", "claim_support_rate", "topic_coverage", "gap_recall",
    "flagged_gap_validity", "transfer_rate", "defect_recall", "strict_defect_recall",
    "false_alarm_rate", "case_pass_rate", "expected_change_rate", "preservation_rate",
}
RUN_DESCRIPTION = "mlflow.note.content"
FIXTURE_NAMES = {
    "harbor-point-heat-resilience": "Harbor Point",
    "krakow-flood-drainage-plan": "Kraków",
    "richfield-flood-risk": "Richfield",
}
CHECK_LABELS = {"passed": "Passed", "failed": "Issues found", "unavailable": "Unavailable"}
SUMMARY_METRICS = {
    "extraction": (
        ("fact_evidence_retained", "required facts retained"),
        ("pair_evidence_in_chapter", "required evidence in the intended chapter"),
    ),
    "chapter_writing": (("required_fact_coverage", "required facts fully covered"),),
    "verification": (
        ("defect_recall", "planted defects caught"),
        ("false_alarm_rate", "false-alarm rate"),
    ),
    "editing": (("case_pass_rate", "edit cases passed"),),
}


def _load_tracking_env() -> None:
    """Load only tracking settings from the project .env; preserve process values."""
    for key, value in dotenv_values(Path(__file__).resolve().parents[3] / ".env").items():
        if key.startswith("MLFLOW_TRACKING_") and value is not None:
            os.environ.setdefault(key, value)


def _safe_error(error: Exception) -> str:
    """Keep diagnostic text while removing URLs, auth headers and tracking secrets."""
    message = str(error)
    # Transport errors may include userinfo, query tokens or complete auth headers.
    message = re.sub(r"https?://[^\s<>]+", "[redacted URL]", message, flags=re.IGNORECASE)
    message = re.sub(r"(?:proxy-)?authorization[^\r\n]*", "[redacted auth header]",
                     message, flags=re.IGNORECASE)
    for key in ("MLFLOW_TRACKING_USERNAME", "MLFLOW_TRACKING_PASSWORD", "MLFLOW_TRACKING_TOKEN"):
        if value := os.environ.get(key):
            message = message.replace(value, "[redacted]")
    return f"{type(error).__name__}: {message}"


def _fixture_tags(fixture: dict[str, Any], stages: list[str]) -> dict[str, str]:
    """Describe only this fixture's approval, failures and requested stage status."""
    approved = fixture.get("approval_status") == "approved" and not fixture.get("approval_errors")
    tags = {"approval_state": "approved" if approved else "unapproved"}
    quality = False
    unavailable = not approved or not stages
    # A missing judgment is unavailable, never a passing stage.
    for name in stages:
        stage = fixture.get(name)
        if stage is None:
            tags[f"{name}.status"] = "unavailable"
            unavailable = True
            continue
        failed = bool(stage.get("integrity_failures") or stage.get("semantic_failures"))
        absent = stage.get("judgment") is None or bool(stage.get("evaluation_errors"))
        tags[f"{name}.status"] = "unavailable" if absent else "failed" if failed else "passed"
        quality |= failed
        unavailable |= absent
    tags["quality_failures"] = str(quality).lower()
    tags["evaluation_unavailable"] = str(unavailable).lower()
    return tags


def review_tags(
    report: dict[str, Any], stages: list[str]
) -> tuple[str, dict[str, dict[str, str]]]:
    """Describe fixture quality from the same stage statuses exported as tags."""
    summaries = []
    children = {}
    for fixture in report.get("fixtures", []):
        fixture_id = fixture["fixture_id"]
        tags = _fixture_tags(fixture, stages)
        statuses = [tags[f"{stage}.status"] for stage in stages]
        if not statuses or "unavailable" in statuses:
            result = "unavailable"
        elif "failed" in statuses:
            result = "failed"
        else:
            result = "passed"

        name = FIXTURE_NAMES.get(fixture_id, fixture_id.replace("-", " ").title())
        rows = [f"### {name} ({CHECK_LABELS[result]})", ""]
        for stage, status in zip(stages, statuses, strict=True):
            label = stage.replace("_", " ").capitalize()
            row = f"- **{label} ({CHECK_LABELS[status]})**"
            if status != "unavailable":
                metrics = fixture[stage].get("metrics", {})
                scores = []
                for key, explanation in SUMMARY_METRICS.get(stage, ()):
                    value = metrics.get(key)
                    if isinstance(value, (int, float)) and not isinstance(value, bool) and 0 <= value <= 1:
                        scores.append(f"{value:.1%} {explanation}")
                if scores:
                    row += " · " + " · ".join(scores)
            rows.append(row)
        summary = "\n".join(rows)
        tags.update({"fixture_result": CHECK_LABELS[result], RUN_DESCRIPTION: summary})
        children[fixture_id] = tags
        summaries.append(summary)

    missing = set(report.get("expected_fixture_ids") or []) - children.keys()
    for fixture_id in sorted(missing):
        name = FIXTURE_NAMES.get(fixture_id, fixture_id.replace("-", " ").title())
        summaries.append(f"### {name} (Unavailable)\n\nNo results were recorded for this fixture.")
    description = "\n\n".join([
        "**Benchmark quality checks**",
        *summaries,
        "Open **Artifacts → run → report.md** for the detailed checks and reasons.",
    ])
    return description, children


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
    stage_metrics = {}
    rate_values: dict[str, list[float]] = {}
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
            for key, value in stage.get("metrics", {}).items():
                values[f"{name}.{key}"] = value
                stage_metrics[f"{fixture['fixture_id']}.{name}.{key}"] = value
                if (key in RATE_METRICS and isinstance(value, (int, float))
                        and not isinstance(value, bool) and math.isfinite(value)):
                    rate_values.setdefault(f"mean.{name}.{key}", []).append(value)
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
        "run_id", "label", "code_version", "analysis_contract_version", "corpus_fingerprint",
        "evaluator_fingerprint", "judge_prompt_versions", "models", "requested_stages",
        "producer_prompt_versions", "llm_config_sha256", "dependency_lock_sha256")}
    params["requested_stages"] = stages
    params["fixtures"] = report.get("expected_fixture_ids") or list(children)
    metrics = {"fixture_count": len(fixtures), "quality_failures": int(quality),
               "evaluation_unavailable": int(unavailable)}
    metrics.update(stage_metrics)
    metrics.update({key: sum(values) / len(values) for key, values in rate_values.items()})
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
    Loads project .env tracking settings as defaults. Failure diagnostics redact
    transport URLs, authorization headers and configured tracking credentials.
    """
    try:
        _load_tracking_env()
        if not os.environ.get("MLFLOW_TRACKING_URI"):
            raise ValueError("MLFLOW_TRACKING_URI is required")
        report = json.loads((run_dir / "report.json").read_text(encoding="utf-8"))
        metrics, params, tags, children = _payload(report)
        tags["run_id"] = report.get("run_id") or run_dir.name
        params["run_id"] = tags["run_id"]
        # Delivery/comparison metadata is optional on historical run folders.
        delivery_path = run_dir / "delivery.json"
        if delivery_path.is_file():
            delivery = json.loads(delivery_path.read_text(encoding="utf-8"))
            baseline = delivery.get("baseline") or {}
            if baseline.get("baseline_run_id"):
                tags["baseline_run_id"] = str(baseline["baseline_run_id"])
        comparison_path = run_dir / "comparison.json"
        if comparison_path.is_file():
            comparison = json.loads(comparison_path.read_text(encoding="utf-8"))
            outcome = comparison.get("outcome")
            tags["comparison_outcome"] = outcome if isinstance(outcome, str) and outcome in {
                "improved", "regressed", "unchanged", "mixed", "unavailable",
            } else "unavailable"
            regression = comparison.get("quality_regression")
            tags["quality_regression"] = (str(regression).lower()
                                          if isinstance(regression, bool) else "unavailable")
        tags[RUN_DESCRIPTION], child_tags = review_tags(report, params["requested_stages"])
        if draft:
            tags["draft"] = "true"
        run_id = export_run_dir(run_dir, experiment_name=EXPERIMENT, metrics=metrics,
                                params=params, tags=tags, children=children,
                                child_tags=child_tags)
        logger.info("CNB MLflow export completed run_id=%s", run_id)
        return run_id
    except Exception as error:
        logger.warning("CNB MLflow export failed (%s)", _safe_error(error))
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
        _load_tracking_env()
        if not os.environ.get("MLFLOW_TRACKING_URI"):
            raise ValueError("MLFLOW_TRACKING_URI is required")
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
        logger.error("CNB MLflow download failed (%s)", _safe_error(error))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
