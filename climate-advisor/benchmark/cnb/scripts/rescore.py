"""Re-score a saved CNB benchmark run with the current scoring code, without model calls.

Use it after changing only how judgments are scored (metrics, gates, citation
checks) to bring the approved baseline and any saved run up to the new judge
policy for the price of nothing. It reuses each stage's saved judge input and
judgment. It refuses when the scores would not be honest: the fixtures, judge
model or judge prompts changed, or the current code would build a different
judge input from the saved outputs. Those changes need a new benchmark run.

Inputs:
- --run: finished run folder with outputs/<fixture>/<stage>/judge_input.json and
  judgment.json (runs from before judge inputs were saved cannot be re-scored).
- --output: folder to create (default
  climate-advisor/output/cnb_golden_set/rescored/<run-id>); the run ID is kept,
  because the producer outputs are the same run.
- OPENROUTER_API_KEY is not needed; normal Climate Advisor settings are loaded
  for the judge configuration only.

Outputs (no model calls, network or database):
- The copied run with report.json, report.md, delivery.json and viewer.js
  re-scored; comparison files are dropped because their baseline is stale.
- Exit 0 on success; 2 when the run cannot be re-scored honestly.

Usage (from climate-advisor/):
- uv run python -m benchmark.cnb.scripts.rescore --run benchmark/cnb/results/runs/<run-id>
  then, to re-approve it, remove that folder and run propose_baseline on the output.
"""

from __future__ import annotations

import argparse
import json
import logging
import shutil
from argparse import Namespace
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.config import get_settings
from app.models.cnb.concept_note_draft import ConceptNoteDraftGapOutput
from app.models.cnb.context_bundle import SelectedSource

from benchmark.cnb.golden_set.baseline import evaluation_fingerprints
from benchmark.cnb.golden_set.chapters import (
    DraftedChapter,
    chapter_writing_judge_input,
    score_chapter_writing,
)
from benchmark.cnb.golden_set.core import (
    LoadedFixture,
    extraction_judge_input,
    load_golden_fixtures,
    score_extraction,
)
from benchmark.cnb.golden_set.editing import case_checks, editing_judge_input, score_editing
from benchmark.cnb.golden_set.judge import judge_prompt_versions
from benchmark.cnb.golden_set.models import (
    STAGES,
    ChapterWritingEvaluation,
    EditingEvaluation,
    EditingJudgeInput,
    GoldenSetReport,
    JudgeEvaluation,
    JudgeInput,
    ReferenceChapter,
    StageReport,
    VerificationEvaluation,
    VerificationJudgeInput,
)
from benchmark.cnb.golden_set.verification import (
    score_clean_draft,
    score_verification,
    verification_judge_input,
)
from benchmark.cnb.golden_set.viewer import build_run_payload, write_run_viewer
from benchmark.cnb.golden_set.workspace import (
    build_workspace,
    frozen_selected_source,
    reference_snapshots,
)
from benchmark.cnb.scripts.evaluate import (
    DEFAULT_FIXTURES_DIR,
    DEFAULT_RESULTS_DIR,
    _model_summary,
    _write_report,
)

logger = logging.getLogger(__name__)


class RescoreError(ValueError):
    """The saved run cannot be re-scored without a new benchmark run."""


def _read(path: Path) -> str:
    """Read one saved artifact, naming it when it is missing."""
    if not path.is_file():
        raise RescoreError(f"{path} is missing; this run predates saved judge inputs")
    return path.read_text(encoding="utf-8")


def _same_input(saved: Any, rebuilt: Any, where: Path) -> None:
    """Refuse when the current code would show the judge something else."""
    if saved.model_dump(mode="json") != rebuilt.model_dump(mode="json"):
        raise RescoreError(f"{where}: the current code builds a different judge input; rerun the benchmark")


def rescore_stage(
    loaded: LoadedFixture, stage: str, folder: Path, old: dict[str, Any], extraction: JudgeEvaluation | None
) -> StageReport:
    """Re-score one saved stage of one fixture with the current scoring code."""
    settings = get_settings()
    if stage == "extraction":
        payload = JudgeInput.model_validate_json(_read(folder / "extraction" / "judge_input.json"))
        judgment = JudgeEvaluation.model_validate_json(_read(folder / "extraction" / "judgment.json"))
        source = SelectedSource.model_validate_json(_read(folder / "analysis.json"))
        rebuilt, integrity = extraction_judge_input(loaded, source)
        _same_input(payload, rebuilt, folder / "extraction")
        return score_extraction(loaded, payload, judgment, integrity)
    if stage == "chapter_writing":
        stage_dir = folder / "chapter_writing"
        payload = JudgeInput.model_validate_json(_read(stage_dir / "judge_input.json"))
        judgment = ChapterWritingEvaluation.model_validate_json(_read(stage_dir / "judgment.json"))
        drafted = [
            DraftedChapter(
                chapter_ref=item["chapter_ref"],
                title=item["title"],
                body_markdown=item["body_markdown"],
                gaps=[ConceptNoteDraftGapOutput.model_validate(gap) for gap in item["gaps"]],
                support_check=item.get("support_check", []),
            )
            for item in json.loads(_read(stage_dir / "drafts.json"))
        ]
        # Supplied evidence is what the drafter saw; it is reused, not rebuilt.
        supplied = [unit for unit in payload.evidence if unit.kind == "supplied"]
        rebuilt, integrity = chapter_writing_judge_input(loaded, drafted, supplied)
        _same_input(payload, rebuilt, stage_dir)
        return score_chapter_writing(loaded, payload, judgment, integrity, extraction)
    if stage == "verification":
        stage_dir = folder / "verification"
        payload = VerificationJudgeInput.model_validate_json(_read(stage_dir / "judge_input.json"))
        judgment = VerificationEvaluation.model_validate_json(_read(stage_dir / "judgment.json"))
        records = json.loads(_read(stage_dir / "findings.json"))
        seeded = [ReferenceChapter.model_validate(c) for c in json.loads(_read(stage_dir / "seeded_draft.json"))]
        _same_input(payload, verification_judge_input(loaded, seeded, records), stage_dir)
        report = score_verification(
            loaded, payload, judgment, records, [], old.get("details", {}).get("chapter_status")
        )
        clean_dir = stage_dir / "clean"
        clean_payload = VerificationJudgeInput.model_validate_json(_read(clean_dir / "judge_input.json"))
        clean_records = json.loads(_read(clean_dir / "findings.json"))
        _same_input(
            clean_payload,
            verification_judge_input(loaded, loaded.reference_draft.chapters, clean_records, []),
            clean_dir,
        )
        if not report.evaluation_errors:
            clean = VerificationEvaluation.model_validate_json(_read(clean_dir / "judgment.json"))
            score_clean_draft(loaded, clean_payload, clean, report)
        return report
    stage_dir = folder / "editing"
    payload = EditingJudgeInput.model_validate_json(_read(stage_dir / "judge_input.json"))
    judgment = EditingEvaluation.model_validate_json(_read(stage_dir / "judgment.json"))
    records = json.loads(_read(stage_dir / "cases.json"))
    reference = loaded.reference_draft
    workspace = build_workspace(loaded, settings, frozen_selected_source(loaded, reference.selected_source))
    snapshots = reference_snapshots(workspace, loaded.fixture.fixture_id, reference.chapters)
    _same_input(payload, editing_judge_input(loaded, snapshots, records), stage_dir)
    checks = [
        case_checks(case, record, snapshots)
        for case, record in zip(loaded.fixture.editing.cases, records, strict=True)
    ]
    return score_editing(loaded, payload, judgment, checks)


def rescore(run: Path, output: Path, fixtures_dir: Path) -> dict[str, str]:
    """Copy ``run`` to ``output`` and re-score every judged stage; return the new fingerprints."""
    settings = get_settings()
    raw = json.loads((run / "report.json").read_text(encoding="utf-8"))
    fixtures = load_golden_fixtures(fixtures_dir)
    by_id = {item.fixture.fixture_id: item for item in fixtures}
    stages = raw.get("requested_stages") or list(STAGES)

    # Step 1: only scoring may differ from the run's judge policy.
    judge = _model_summary(settings.llm.models.cnb_golden_set_judge)
    fingerprints = evaluation_fingerprints(fixtures, judge, judge_prompt_versions(settings))
    if raw.get("corpus_fingerprint") != fingerprints["corpus"]:
        raise RescoreError("Fixtures or golden expectations changed since this run; rerun the benchmark")
    if raw.get("models", {}).get("judge") != judge or raw.get("judge_prompt_versions") != judge_prompt_versions(settings, stages):
        raise RescoreError("The judge model or judge prompts changed since this run; rerun the benchmark")

    # Step 2: re-score each judged stage from its saved input and judgment.
    rescored: dict[tuple[str, str], StageReport] = {}
    for fixture in raw["fixtures"]:
        fid = fixture["fixture_id"]
        folder = run / "outputs" / fid
        extraction = None
        for stage in STAGES:
            old = fixture.get(stage)
            if not old or not old.get("judgment"):
                continue
            report = rescore_stage(by_id[fid], stage, folder, old, extraction)
            if stage == "extraction" and not report.evaluation_errors:
                extraction = report.judgment
            rescored[(fid, stage)] = report

    # Step 3: rebuild the report with typed judgments, then write the copy.
    for fixture in raw["fixtures"]:
        for stage in STAGES:
            if fixture.get(stage):
                fixture[stage].pop("judgment", None)
    for key in ("passed", "quality_failures", "evaluation_unavailable"):
        raw.pop(key, None)
    report = GoldenSetReport.model_validate(raw)
    for fixture in report.fixtures:
        for stage in STAGES:
            if (fixture.fixture_id, stage) in rescored:
                setattr(fixture, stage, rescored[(fixture.fixture_id, stage)])
    report.corpus_fingerprint = fingerprints["corpus"]
    report.evaluator_fingerprint = fingerprints["judge_policy"]
    shutil.copytree(
        run, output, ignore=shutil.ignore_patterns("comparison.json", "comparison.md", "review-bundle.zip", "viewer.js")
    )
    _write_report(Namespace(output_dir=output), report)
    delivery = json.loads((output / "delivery.json").read_text(encoding="utf-8"))
    delivery["fingerprints"] = fingerprints
    delivery["rescored_at"] = datetime.now(UTC).isoformat()
    (output / "delivery.json").write_text(json.dumps(delivery, ensure_ascii=False), encoding="utf-8")
    write_run_viewer(output, build_run_payload(output, fixtures_dir))
    return fingerprints


def main(argv: list[str] | None = None) -> int:
    """Re-score one run, or explain why it needs a new benchmark run."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
    parser = argparse.ArgumentParser(description="Re-score a saved CNB run offline.")
    parser.add_argument("--run", type=Path, required=True, help="Finished run folder")
    parser.add_argument("--output", type=Path, help="Folder to create")
    parser.add_argument("--fixtures-dir", type=Path, default=DEFAULT_FIXTURES_DIR)
    args = parser.parse_args(argv)
    if not (args.run / "report.json").is_file():
        parser.error(f"{args.run} has no report.json")
    output = args.output or DEFAULT_RESULTS_DIR / "rescored" / args.run.resolve().name
    if output.exists():
        parser.error(f"{output} already exists")
    try:
        fingerprints = rescore(args.run, output, args.fixtures_dir)
    except RescoreError as exc:
        logger.error("Cannot re-score %s: %s", args.run, exc)
        return 2
    logger.info("Re-scored run written to %s (judge policy %s)", output, fingerprints["judge_policy"][:12])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
