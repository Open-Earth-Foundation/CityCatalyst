"""Publish CNB golden-set runs into one browsable results folder.

Every evaluation run lives in ``<results-dir>/runs/<run-id>/``. Publishing a
run snapshots everything the viewer needs for it (fixtures, judge prompts,
few-shot examples, outputs, judgments, and scored reports) into that run's
``viewer.js``, so a run stays readable after fixtures or prompts change. The
results folder also gets the static viewer from ``benchmark/cnb/viewer/``
(``index.html``, ``app.js``), the fixtures' original
PDFs under each run's ``pdf/``, and ``runs/index.js`` summarising every run for the run
picker and run comparison. Nothing here calls a model or the network.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import shutil
import tempfile
from pathlib import Path
from typing import Any

from app.config import get_settings

from benchmark.cnb.golden_set.core import load_golden_fixtures
from benchmark.cnb.golden_set.judge import PROMPT_KEYS
from benchmark.cnb.golden_set.models import STAGES

logger = logging.getLogger(__name__)
BENCHMARK_ROOT = Path(__file__).resolve().parents[1]
VIEWER_DIR = BENCHMARK_ROOT / "viewer"
FIXTURES_DIR = BENCHMARK_ROOT / "fixtures"
# Scratch runs (git-ignored); pass benchmark/cnb/results to save a run for committing.
DEFAULT_RESULTS_DIR = BENCHMARK_ROOT.parents[1] / "output" / "cnb_golden_set"
# Raw artefacts each stage writes, keyed by the name the viewer uses.
ARTEFACTS = {
    "extraction": {"judgment": "extraction/judgment.json"},
    "chapter_writing": {
        "judgment": "chapter_writing/judgment.json",
        "drafts": "chapter_writing/drafts.json",
    },
    "verification": {
        "judgment": "verification/judgment.json",
        "seeded_draft": "verification/seeded_draft.json",
        "findings": "verification/findings.json",
    },
    "editing": {"judgment": "editing/judgment.json", "cases": "editing/cases.json"},
}
# Headline metrics shown in the run index and compared across runs.
INDEX_METRICS = (
    "required_fact_coverage",
    "mandatory_fact_coverage",
    "desirable_fact_coverage",
    "topic_coverage",
    "gap_recall",
    "flagged_gap_validity",
    "transfer_rate",
    "defect_recall",
    "strict_defect_recall",
    "false_alarm_rate",
    "case_pass_rate",
)
RUN_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$")


def _read_json(path: Path) -> Any:
    """Parse a JSON file, or return None when it does not exist."""
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def _examples(prompt: str) -> list[dict[str, Any]]:
    """The few-shot examples block of a judge prompt."""
    match = re.search(r"^<examples>$(.*?)^</examples>$", prompt, re.M | re.S)
    return json.loads(match.group(1)) if match else []


def stage_status(report: dict[str, Any] | None) -> str:
    """Mirror ``StageReport.passed``: pass, fail, error, or notrun."""
    if not report:
        return "notrun"
    if report.get("evaluation_errors") or not report.get("judgment"):
        return "error"
    if report.get("integrity_failures") or report.get("semantic_failures"):
        return "fail"
    return "pass"


def build_run_payload(run_dir: Path, fixtures_dir: Path = FIXTURES_DIR, *, rebuilt: bool = False) -> dict[str, Any]:
    """Snapshot one run with the fixtures and prompts it is published with."""
    report = _read_json(run_dir / "report.json") or {}
    reports = {f["fixture_id"]: f for f in report.get("fixtures", [])}
    fixtures = []
    for loaded in load_golden_fixtures(fixtures_dir):
        fid = loaded.fixture.fixture_id
        if fid not in reports:
            continue
        out = run_dir / "outputs" / fid
        stages = {}
        for stage in STAGES:
            stage_report = reports[fid].get(stage)
            stages[stage] = None if stage_report is None else {
                "report": stage_report,
                **{key: _read_json(out / rel) for key, rel in ARTEFACTS[stage].items()},
            }
        original = loaded.fixture.source.original_pdf
        if original:
            pdf_dir = run_dir / "pdf"
            pdf_dir.mkdir(exist_ok=True)
            target = pdf_dir / f"{fid}.pdf"
            if not target.exists():
                shutil.copyfile(loaded.directory / original.path, target)
            if hashlib.sha256(target.read_bytes()).hexdigest() != original.sha256:
                raise ValueError(f"Snapshot PDF digest mismatch: {fid}")
        fixtures.append(
            {
                "pdf": f"runs/{run_dir.name}/pdf/{fid}.pdf" if original else None,
                "golden": loaded.fixture.model_dump(mode="json"),
                "units": [{"anchor": u.anchor, "text": u.text} for u in loaded.units],
                "drafting_input": loaded.drafting_input.model_dump(mode="json")
                if loaded.drafting_input
                else None,
                "reference_draft": loaded.reference_draft.model_dump(mode="json")
                if loaded.reference_draft
                else None,
                "analysis": _read_json(out / "analysis.json"),
                "stages": stages,
                "usage": reports[fid].get("usage") or {},
                "input_provenance": reports[fid].get("input_provenance") or {},
                "approval_status": reports[fid].get("approval_status", "pending"),
                "approval_errors": reports[fid].get("approval_errors", []),
                "inapplicable_reason": reports[fid].get("inapplicable_reason"),
            }
        )
    settings = get_settings()
    prompts = {
        stage: settings.llm.prompts.get_prompt(key)
        for stage, key in PROMPT_KEYS.items()
    }
    # A normal snapshot must show exactly the configured prompts used by the judge.
    if not rebuilt:
        for stage, version in report.get("judge_prompt_versions", {}).items():
            if hashlib.sha256(prompts[stage].encode()).hexdigest() != version:
                raise ValueError(f"Snapshot judge prompt digest mismatch: {stage}")
    budget = settings.llm.generation.prompt_budget.cnb_sources
    return {
        "run": {k: v for k, v in report.items() if k != "fixtures"} | {"id": run_dir.name},
        "delivery": _read_json(run_dir / "delivery.json"),
        "config": {
            "max_key_excerpts": budget.max_key_excerpts,
            "max_chapter_excerpts": budget.max_chapter_excerpts,
            "context_window_tokens": budget.context_window_tokens,
        },
        "prompts": prompts,
        "examples": {stage: _examples(text) for stage, text in prompts.items()},
        "fixtures": fixtures,
    }


def write_run_viewer(run_dir: Path, payload: dict[str, Any], *, rebuilt: bool = False) -> Path:
    """Write a run's ``viewer.js``; the viewer loads it with a script tag."""
    payload["run"]["snapshot"] = "rebuilt_with_current_fixtures" if rebuilt else "at_run_time"
    target = run_dir / "viewer.js"
    body = json.dumps(payload, ensure_ascii=False)
    target.write_text(
        f"(window.GOLDEN_RUNS = window.GOLDEN_RUNS || {{}})[{json.dumps(run_dir.name)}] = {body};\n",
        encoding="utf-8",
    )
    return target


def run_summary(run_dir: Path) -> dict[str, Any] | None:
    """Index entry for one run: provenance plus per-stage status and metrics."""
    report = _read_json(run_dir / "report.json")
    if report is None:
        return None
    return {
        "id": run_dir.name,
        "label": report.get("label"),
        "generated_at": report.get("generated_at"),
        "code_version": report.get("code_version"),
        "passed": report.get("passed"),
        "models": report.get("models", {}),
        "judge_prompt_versions": report.get("judge_prompt_versions", {}),
        "analysis_contract_version": report.get("analysis_contract_version"),
        "has_viewer": (run_dir / "viewer.js").exists(),
        "wall_seconds": report.get("wall_seconds"),
        "fixtures": {
            fixture["fixture_id"]: {
                "source_sha256": fixture.get("source_sha256"),
                # Runs before usage recording have none.
                "usage": {
                    stage: {key: usage.get(key) for key in ("seconds", "requests", "cost_usd", "cost_complete", "unpriced_requests")}
                    for stage, usage in (fixture.get("usage") or {}).items()
                },
                "input_provenance": fixture.get("input_provenance") or {},
                "stages": {
                    stage: {
                        "status": stage_status(fixture.get(stage)),
                        "metrics": {
                            key: value
                            for key, value in (fixture.get(stage) or {}).get("metrics", {}).items()
                            if key in INDEX_METRICS
                        },
                    }
                    for stage in STAGES
                    if fixture.get(stage) is not None
                },
            }
            for fixture in report.get("fixtures", [])
        },
    }


def _preserve_snapshot_pdfs(run_dir: Path, destination: Path, fixtures_dir: Path = FIXTURES_DIR) -> None:
    """Copy only PDF bytes matching a snapshot, including existing legacy root paths."""
    body = (run_dir / "viewer.js").read_text(encoding="utf-8")
    payload = json.loads(body.split("] = ", 1)[1].rstrip(";\n"))
    source_root = run_dir.parent.parent
    for fixture in payload.get("fixtures", []):
        reference = fixture.get("pdf")
        original = fixture.get("golden", {}).get("source", {}).get("original_pdf")
        if not reference or not original:
            continue
        target = (destination / reference).resolve()
        if not target.is_relative_to(destination.resolve()):
            raise ValueError("Snapshot PDF escapes review directory")
        source = (source_root / reference).resolve()
        if not source.is_relative_to(source_root.resolve()):
            raise ValueError("Snapshot PDF escapes source directory")
        if not source.is_file():
            fid = fixture["golden"]["fixture_id"]
            source = (fixtures_dir / fid / original["path"]).resolve()
            if not source.is_relative_to(fixtures_dir.resolve()):
                raise ValueError("Snapshot PDF escapes fixture directory")
        data = source.read_bytes()
        if hashlib.sha256(data).hexdigest() != original["sha256"]:
            raise ValueError("Historical snapshot PDF bytes are unavailable or changed")
        if target.exists():
            if target.read_bytes() != data:
                raise ValueError("Historical snapshots require different PDFs at the same path")
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)


def publish_viewer(results_dir: Path, *, rebuild: bool = False, fixtures_dir: Path = FIXTURES_DIR) -> Path:
    """Refresh the viewer, PDFs, missing run snapshots, and the run index."""
    runs_dir = results_dir / "runs"
    runs_dir.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(VIEWER_DIR / "app.js", results_dir / "app.js")
    summaries = []
    for run_dir in sorted(p for p in runs_dir.iterdir() if p.is_dir()):
        if not (run_dir / "report.json").exists():
            continue
        if rebuild or not (run_dir / "viewer.js").exists():
            write_run_viewer(run_dir, build_run_payload(run_dir, fixtures_dir, rebuilt=True), rebuilt=True)
        _preserve_snapshot_pdfs(run_dir, results_dir, fixtures_dir)
        summary = run_summary(run_dir)
        if summary is not None:
            summaries.append(summary)
    summaries.sort(key=lambda s: s.get("generated_at") or "", reverse=True)
    index = runs_dir / "index.js"
    index.write_text(f"window.GOLDEN_INDEX = {json.dumps(summaries, ensure_ascii=False)};\n", encoding="utf-8")
    # Browsers cache scripts; content-versioned URLs make every publish show on a normal reload.
    html = (VIEWER_DIR / "index.html").read_text(encoding="utf-8")
    for name, path in (("runs/index.js", index), ("app.js", results_dir / "app.js")):
        version = hashlib.sha256(path.read_bytes()).hexdigest()[:12]
        html = html.replace(f'src="{name}"', f'src="{name}?v={version}"')
    (results_dir / "index.html").write_text(html, encoding="utf-8")
    logger.info("Published %s runs to %s", len(summaries), results_dir / "index.html")
    return results_dir / "index.html"


def publish_run(run_dir: Path, results_dir: Path, *, fixtures_dir: Path = FIXTURES_DIR) -> Path:
    """Snapshot a finished run at run time, then refresh the shared viewer."""
    if not (run_dir / "viewer.js").exists():
        write_run_viewer(run_dir, build_run_payload(run_dir, fixtures_dir))
    return publish_viewer(results_dir, fixtures_dir=fixtures_dir)


def publish_bundle(candidate_dir: Path, results_dir: Path, *, baseline_dir: Path | None = None) -> Path:
    """Package immutable baseline/candidate evidence with a browser-only review entrypoint."""
    if baseline_dir is not None and baseline_dir.name == candidate_dir.name:
        raise ValueError("Baseline and candidate run IDs must differ")
    comparison = _read_json(candidate_dir / "comparison.json") or {}
    # A temporary sibling avoids copying the archive into itself on a retry.
    with tempfile.TemporaryDirectory(prefix="cnb-review-", dir=results_dir) as temporary:
        root = Path(temporary)
        for directory in [candidate_dir, *([baseline_dir] if baseline_dir else [])]:
            if not (directory / "viewer.js").is_file():
                raise ValueError(f"Missing immutable viewer snapshot: {directory.name}")
            shutil.copytree(directory, root / "runs" / directory.name, ignore=shutil.ignore_patterns("review-bundle.zip"))
            _preserve_snapshot_pdfs(directory, root)
        for name in ("comparison.json", "comparison.md"):
            if (candidate_dir / name).exists():
                shutil.copyfile(candidate_dir / name, root / name)
        publish_viewer(root)
        (root / "comparison.js").write_text("window.GOLDEN_REVIEW = " + json.dumps({
            **comparison, "baseline_run_id": baseline_dir.name if baseline_dir else None,
        }, ensure_ascii=False) + ";\n", encoding="utf-8")
        html_path = root / "index.html"
        html_path.write_text(html_path.read_text(encoding="utf-8").replace(
            '<script src="runs/index.js', '<script src="comparison.js"></script>\n<script src="runs/index.js'
        ), encoding="utf-8")
        (root / "README.txt").write_text(
            "Extract the whole archive, then open index.html. No server, Python or API key is needed.\n"
            "comparison.md and comparison.json contain the same review summary.\n"
            "Candidate artifacts expire with CI retention; approved baseline artifacts must remain in the reviewed repository.\n",
            encoding="utf-8",
        )
        archive = Path(shutil.make_archive(str(candidate_dir / "review-bundle"), "zip", root))
    return archive
