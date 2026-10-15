"""Publish CNB golden-set runs into one browsable results folder.

Every evaluation run lives in ``<results-dir>/runs/<run-id>/``. Publishing a
run snapshots everything the viewer needs for it (fixtures, judge prompts,
few-shot examples, outputs, judgments, and scored reports) into that run's
``viewer.js``, so a run stays readable after fixtures or prompts change. The
results folder also gets the static viewer from ``service/scripts/
cnb_golden_set_viewer/`` (``index.html``, ``app.js``), the fixtures' original
PDFs under ``pdf/``, and ``runs/index.js`` summarising every run for the run
picker and run comparison. Nothing here calls a model or the network.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import shutil
from pathlib import Path
from typing import Any

from app.models.cnb.golden_set import STAGES
from app.services.cnb.golden_set import load_golden_fixtures

from app.config import get_settings

logger = logging.getLogger(__name__)
SERVICE_ROOT = Path(__file__).resolve().parents[3]
VIEWER_DIR = SERVICE_ROOT / "scripts" / "cnb_golden_set_viewer"
FIXTURES_DIR = SERVICE_ROOT / "tests" / "fixtures" / "cnb_golden_set"
PROMPTS_DIR = SERVICE_ROOT.parent / "prompts" / "cnb" / "golden_set"
DEFAULT_RESULTS_DIR = SERVICE_ROOT.parent / "output" / "cnb_golden_set"
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


def build_run_payload(run_dir: Path, fixtures_dir: Path = FIXTURES_DIR) -> dict[str, Any]:
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
        fixtures.append(
            {
                "pdf": f"pdf/{fid}.pdf" if original else None,
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
            }
        )
    prompts = {path.stem: path.read_text(encoding="utf-8") for path in sorted(PROMPTS_DIR.glob("*.md"))}
    budget = get_settings().llm.generation.prompt_budget.cnb_sources
    return {
        "run": {k: v for k, v in report.items() if k != "fixtures"} | {"id": run_dir.name},
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
                    stage: {key: usage.get(key) for key in ("seconds", "requests", "cost_usd")}
                    for stage, usage in (fixture.get("usage") or {}).items()
                },
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


def publish_viewer(results_dir: Path, *, rebuild: bool = False, fixtures_dir: Path = FIXTURES_DIR) -> Path:
    """Refresh the viewer, PDFs, missing run snapshots, and the run index."""
    runs_dir = results_dir / "runs"
    runs_dir.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(VIEWER_DIR / "app.js", results_dir / "app.js")
    pdf_dir = results_dir / "pdf"
    pdf_dir.mkdir(exist_ok=True)
    for loaded in load_golden_fixtures(fixtures_dir):
        original = loaded.fixture.source.original_pdf
        if original is not None:
            shutil.copyfile(loaded.directory / original.path, pdf_dir / f"{loaded.fixture.fixture_id}.pdf")
    summaries = []
    for run_dir in sorted(p for p in runs_dir.iterdir() if p.is_dir()):
        if not (run_dir / "report.json").exists():
            continue
        if rebuild or not (run_dir / "viewer.js").exists():
            write_run_viewer(run_dir, build_run_payload(run_dir, fixtures_dir), rebuilt=True)
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
    write_run_viewer(run_dir, build_run_payload(run_dir, fixtures_dir))
    return publish_viewer(results_dir, fixtures_dir=fixtures_dir)
