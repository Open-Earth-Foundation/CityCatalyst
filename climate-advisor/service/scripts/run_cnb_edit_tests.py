"""Run the isolated CC-732 tests and complete-file CA coverage gate.

Inputs:
- --suite: all (default), models, repository, planner, api, or baseline.
- --coverage: collect every file in tests/cnb/edit_coverage_files.json and
  require at least 80 percent executable-line coverage, including unexecuted files.
- --base-ref: Git comparison ref for manifest completeness (default HEAD or
  CNB_EDIT_COVERAGE_BASE); set to the PR base in CI.
- CNB_EDIT_TEST_DATABASE_URL: loopback PostgreSQL URL for an isolated cc732_*
  database. Required for all, models and repository suites.

Outputs: pytest results on stdout, coverage JSON under service/coverage/cnb-edits,
and synthetic test rows in the explicitly configured isolated database.

Usage from climate-advisor/:
    uv run python -m service.scripts.run_cnb_edit_tests --suite all --coverage
    uv run python service/scripts/run_cnb_edit_tests.py --suite models
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlsplit

logger = logging.getLogger(__name__)
SERVICE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SERVICE_ROOT.parents[1]
EDIT_TESTS = [
    "test_edit_models.py",
    "test_edit_repository.py",
    "test_edit_proposals_postgres.py",
    "test_edit_planner.py",
    "test_edit_service.py",
    "test_edit_api.py",
    "test_edit_tools.py",
    "test_edit_observability.py",
]
SHARED_BOUNDARY_TESTS = [
    "tests/test_streaming_handler.py",
    "tests/cnb/test_source_analysis.py",
    "tests/test_concept_note_city_context.py",
    "tests/test_api_routes.py",
    "tests/test_agent_service.py",
    "tests/test_chat_workflow_context.py",
    "tests/test_mlflow_logging.py",
    "tests/cnb/test_edit_browser_fixture.py",
]
SUITES = {
    "all": [*[f"tests/cnb/{name}" for name in EDIT_TESTS], *SHARED_BOUNDARY_TESTS],
    "models": [
        "tests/cnb/test_edit_models.py",
        "tests/cnb/test_edit_proposals_postgres.py",
    ],
    "repository": [
        "tests/cnb/test_edit_repository.py",
        "tests/cnb/test_edit_proposals_postgres.py",
    ],
    "planner": [
        "tests/cnb/test_edit_planner.py",
        "tests/cnb/test_edit_service.py",
        "tests/cnb/test_edit_tools.py",
    ],
    "api": ["tests/cnb/test_edit_api.py"],
    "baseline": [
        "tests/cnb/test_chapter_drafting.py",
        "tests/cnb/test_workspace_gap_lifecycle.py",
        "tests/cnb/test_concept_note_agent_scope.py",
        "tests/test_concept_note_runs.py",
        "tests/test_mlflow_logging.py",
    ],
}


def parse_args() -> argparse.Namespace:
    """Parse the selected layer, coverage gate and comparison baseline."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--suite", choices=SUITES, default="all")
    parser.add_argument("--coverage", action="store_true")
    parser.add_argument(
        "--base-ref", default=os.getenv("CNB_EDIT_COVERAGE_BASE", "HEAD")
    )
    return parser.parse_args()


def read_manifest(base_ref: str) -> list[str]:
    """Validate complete production-file attribution against the current patch."""
    manifest_path = SERVICE_ROOT / "tests/cnb/edit_coverage_files.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    files = manifest["files"]
    if not files or len(files) != len(set(files)):
        raise ValueError("Coverage manifest must contain unique production files")

    # Check tracked and new files; a tiny wiring change still counts as a full file.
    changed: set[str] = set()
    for arguments in (
        ["diff", "--name-only", base_ref],
        ["ls-files", "--others", "--exclude-standard"],
    ):
        result = subprocess.run(
            ["git", *arguments, "--", "climate-advisor/service"],
            cwd=REPO_ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        changed.update(result.stdout.splitlines())
    omitted = []
    prefix = "climate-advisor/service/"
    for filename in sorted(changed):
        relative = filename.removeprefix(prefix)
        if relative.startswith(("app/", "cnb_migrations/")) and relative.endswith(
            ".py"
        ):
            if relative not in files and relative not in manifest.get(
                "non_executable", {}
            ):
                omitted.append(relative)
    if omitted:
        raise ValueError(
            f"Coverage manifest omits production files: {', '.join(omitted)}"
        )
    for filename in files:
        resolved = (SERVICE_ROOT / filename).resolve()
        if not resolved.is_relative_to(SERVICE_ROOT) or not resolved.is_file():
            raise ValueError(f"Coverage source missing or outside service: {filename}")
    return files


async def check_database() -> None:
    """Refuse non-isolated URLs and verify PostgreSQL authentication before tests."""
    import asyncpg

    database_url = os.getenv("CNB_EDIT_TEST_DATABASE_URL", "")
    parsed = urlsplit(database_url)
    if (
        parsed.scheme not in {"postgresql", "postgresql+asyncpg", "postgres"}
        or parsed.hostname not in {"localhost", "127.0.0.1", "::1"}
        or not parsed.path.startswith("/cc732_")
    ):
        raise ValueError(
            "Set CNB_EDIT_TEST_DATABASE_URL to an isolated loopback cc732_* PostgreSQL database"
        )
    connection = await asyncpg.connect(
        database_url.replace("postgresql+asyncpg://", "postgresql://", 1), timeout=5
    )
    try:
        await connection.fetchval("SELECT 1")
    finally:
        await connection.close()


def main() -> None:
    """Validate prerequisites, run tests and enforce the independent CA gate."""
    args = parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    # Keep all provider/telemetry activity deterministic and local in this runner.
    os.environ["MLFLOW_ENABLED"] = "false"
    os.environ["OPENROUTER_SMOKE_TEST"] = "0"
    os.chdir(SERVICE_ROOT)
    sys.path.insert(0, str(SERVICE_ROOT))
    tests = SUITES[args.suite]
    for filename in tests:
        if not (SERVICE_ROOT / filename).is_file():
            raise SystemExit(f"Required CC-732 test is missing: {filename}")
    if args.suite in {"all", "models", "repository"}:
        asyncio.run(check_database())
    files = read_manifest(args.base_ref) if args.suite == "all" or args.coverage else []

    # Use coverage's source discovery plus explicit morfs to retain unexecuted files.
    import coverage
    import pytest

    output = SERVICE_ROOT / "coverage/cnb-edits"
    collector = coverage.Coverage(
        data_file=str(output / ".coverage"), config_file=False
    )
    if args.coverage:
        output.mkdir(parents=True, exist_ok=True)
        collector.start()
    result = pytest.main([*tests, "-m", "not manual_llm"])
    if args.coverage:
        collector.stop()
        collector.save()
        collector.json_report(
            morfs=[str(SERVICE_ROOT / name) for name in files],
            outfile=str(output / "coverage.json"),
        )
        report = json.loads((output / "coverage.json").read_text(encoding="utf-8"))
        totals = report["totals"]
        logger.info(
            "CA full-file lines: %s/%s (%.2f%%)",
            totals["covered_lines"],
            totals["num_statements"],
            totals["percent_covered"],
        )
        if totals["percent_covered"] < 80:
            result = result or 1
    raise SystemExit(result)


if __name__ == "__main__":
    main()
