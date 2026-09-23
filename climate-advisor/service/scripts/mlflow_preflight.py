"""
Brief: Verify local MLflow configuration without printing secrets.

Inputs:
- CLI args:
  - `--json`: Emit one JSON object instead of log lines.
- Files/paths: optional untracked `climate-advisor/.env` loaded for variable
  presence only; the script never creates or writes that file.
- Env vars:
  - `MLFLOW_ENABLED`: Whether application MLflow logging is on (`true`/`false`).
  - `MLFLOW_TRACKING_URI`: Tracking backend URL.
  - `MLFLOW_TRACKING_USERNAME`: Service-account username; reported as present or missing.
  - `MLFLOW_TRACKING_PASSWORD`: Service-account password; reported as present or missing.
  - `MLFLOW_EXPERIMENT_NAME`: Experiment to resolve, normally `Clima`.
  - `MLFLOW_ENVIRONMENT`: Run environment tag such as `dev` or a local tag.

Outputs:
- stdout: presence/absence flags and non-sensitive configuration only
- exit code `0` when enabled, credentials are present, the default tracking
  URI is configured, the `Clima` experiment resolves, and connectivity works
- exit code `1` otherwise
- no files, DB writes, or MLflow runs are created

Usage (from climate-advisor/):
- uv run --directory service python -m scripts.mlflow_preflight
- uv run --directory service python -m scripts.mlflow_preflight --json
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

from dotenv import load_dotenv

from app.utils.mlflow_logging import inspect_mlflow_configuration

logger = logging.getLogger("mlflow_preflight")

_REPORT_KEYS = (
    "enabled",
    "mlflow_installed",
    "tracking_uri",
    "tracking_uri_is_default",
    "username_present",
    "password_present",
    "environment",
    "experiment_name",
    "experiment_resolved",
    "connection_ok",
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse CLI flags for the MLflow preflight."""
    parser = argparse.ArgumentParser(
        description="Verify local MLflow configuration without printing secrets.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit the non-sensitive report as JSON.",
    )
    return parser.parse_args(argv)


def _load_local_env() -> None:
    """Load an existing local .env if present, without creating one."""
    service_root = Path(__file__).resolve().parents[1]
    advisor_root = service_root.parent
    for candidate in (advisor_root / ".env", service_root / ".env"):
        if candidate.is_file():
            load_dotenv(candidate, override=False)
            return


def _is_ready(report: dict[str, object]) -> bool:
    """Return whether local MLflow is ready for an evidence run."""
    return bool(
        report.get("enabled")
        and report.get("mlflow_installed")
        and report.get("tracking_uri_is_default")
        and report.get("username_present")
        and report.get("password_present")
        and report.get("experiment_resolved")
        and report.get("connection_ok")
    )


def main(argv: list[str] | None = None) -> int:
    """Run the local MLflow configuration preflight."""
    args = parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
    _load_local_env()
    report = inspect_mlflow_configuration()
    public_report = {key: report.get(key) for key in _REPORT_KEYS}
    if args.json:
        sys.stdout.write(json.dumps(public_report, sort_keys=True) + "\n")
    else:
        for key in _REPORT_KEYS:
            logger.info("%s=%s", key, public_report[key])
        logger.info("ready=%s", _is_ready(public_report))
    return 0 if _is_ready(public_report) else 1


if __name__ == "__main__":
    raise SystemExit(main())
