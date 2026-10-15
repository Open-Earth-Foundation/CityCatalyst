"""Evaluate the CNB pipeline stage by stage with exact checks and an LLM judge.

Four stages, each run once per fixture:
1. extraction: production source analysis; retained quotations and topics are
   judged against the complete original document.
2. chapter_writing: the production drafter writes every chapter from THIS run's
   extraction; the judge scores fact transfer, claim support, chapter
   requirements, and missing-information gaps. Requires extraction.
3. verification: the production chapter validator runs on a frozen reference
   draft with seeded defects; the judge maps findings to defects.
4. editing: the production edit planner applies chat edit requests to the frozen
   reference draft; Python diffs chapters, the judge checks fidelity.

Inputs:
- --fixtures-dir: versioned fixtures (default service/tests/fixtures/cnb_golden_set).
- --fixture: fixture ID; repeat the flag to select multiple fixtures (default all).
- --stage: extraction, chapter_writing, verification, editing, or all (default);
  repeat to select several. chapter_writing also runs extraction.
- --results-dir: results folder shared by all runs (default
  climate-advisor/output/cnb_golden_set). This run is saved in runs/<run-id>/.
- --run-id: folder name for this run (default: UTC time, YYYYMMDD-HHMMSS, plus
  the label); letters, digits, '.', '_' and '-' only. An existing run is refused.
- --label: optional short note shown in the viewer, for example "pr-3295".
- --parallel: evaluate fixtures concurrently in one process (faster; default is
  one fixture at a time to keep provider load bounded).
- OPENROUTER_API_KEY and normal Climate Advisor settings; llm_config.yaml selects
  producer/judge models and prompts under prompts/cnb/golden_set/.

Outputs (in <results-dir>/runs/<run-id>/; no database writes):
- report.json and report.md with per-stage integrity failures, semantic findings,
  evaluation errors, model configuration, prompt hashes, run ID, label, git
  commit, and per-stage usage: wall time, requests, tokens, and the cost
  OpenRouter reports (per agent too). No full source text.
- outputs/<fixture>/analysis.json, chapter_writing/drafts.json,
  verification/seeded_draft.json and findings.json, editing/cases.json, and
  <stage>/judgment.json for review.
- viewer.js, and the refreshed viewer at <results-dir>/index.html (see
  scripts/cnb_golden_set_viewer/publish.py). Open it to browse and compare runs.
- Exit 0 when all evaluated stages pass; 1 for quality/evaluation failures; 2
  when the run ID already exists (nothing is evaluated).

Usage (from climate-advisor/):
- uv run --directory service python -m scripts.evaluate_cnb_golden_set
- uv run --directory service python -m scripts.evaluate_cnb_golden_set \
      --fixture krakow-flood-drainage-plan --stage chapter_writing --label krakow-drafting
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import re
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.config.settings import ResearchModelConfig
from app.models.cnb.context_bundle import SelectedSource
from app.models.cnb.golden_set import (
    STAGES,
    ChapterWritingEvaluation,
    FixtureReport,
    GoldenSetReport,
    JudgeEvaluation,
    JudgeInput,
    StageReport,
    StageUsage,
)
from app.services.cnb.chapter_drafting import ChapterDraftingError
from app.services.cnb.golden_set import (
    LoadedFixture,
    extraction_judge_input,
    fixture_problems,
    load_golden_fixtures,
    score_extraction,
)
from app.services.cnb.golden_set_chapters import (
    chapter_writing_judge_input,
    score_chapter_writing,
    write_chapters,
)
from app.services.cnb.golden_set_judge import (
    GoldenJudgeError,
    judge_output,
    judge_prompt_versions,
)
from app.services.cnb.golden_set_usage import UsageRecorder, measure, prompt_names
from app.services.cnb.golden_set_viewer import publish_run
from app.services.cnb.application_context import template_chapter_requirements
from app.services.cnb.golden_set_workspace import fixture_template, golden_id
from app.services.cnb.source_analysis import (
    SourceAnalysisError,
    analyze_document,
    chapter_evidence_fingerprint,
    extract_chapter_evidence,
    source_analysis_contract_version,
)

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)
SERVICE_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FIXTURES_DIR = SERVICE_ROOT / "tests" / "fixtures" / "cnb_golden_set"
DEFAULT_RESULTS_DIR = SERVICE_ROOT.parent / "output" / "cnb_golden_set"
RUN_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse fixture selection, single-pass stages, and report location."""
    parser = argparse.ArgumentParser(
        description="Evaluate the CNB pipeline stage by stage with an LLM judge."
    )
    parser.add_argument(
        "--fixtures-dir",
        type=Path,
        default=DEFAULT_FIXTURES_DIR,
        help="Root of the versioned fixture corpus",
    )
    parser.add_argument(
        "--fixture",
        action="append",
        dest="fixtures",
        help="Fixture ID; repeat flag to select multiple fixtures",
    )
    parser.add_argument(
        "--stage",
        action="append",
        dest="stages",
        choices=(*STAGES, "all"),
        help="Stage to evaluate; repeat for several (default: all)",
    )
    parser.add_argument(
        "--results-dir",
        type=Path,
        default=DEFAULT_RESULTS_DIR,
        help="Results folder shared by all runs; this run goes to runs/<run-id>/",
    )
    parser.add_argument("--run-id", help="Run folder name (default: UTC timestamp plus label)")
    parser.add_argument("--label", help="Short note shown in the viewer")
    parser.add_argument(
        "--parallel",
        action="store_true",
        help="Evaluate fixtures concurrently instead of one at a time",
    )
    args = parser.parse_args(argv)
    if args.run_id is None:
        stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
        slug = re.sub(r"[^A-Za-z0-9._-]+", "-", args.label or "").strip("-")
        args.run_id = f"{stamp}-{slug}" if slug else stamp
    if not RUN_ID_PATTERN.fullmatch(args.run_id):
        parser.error("--run-id may contain only letters, digits, '.', '_' and '-'")
    args.output_dir = args.results_dir / "runs" / args.run_id
    return args


def code_version() -> str | None:
    """The current git commit, with ``-dirty`` for uncommitted tracked changes."""
    try:
        commit = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True, text=True, check=True, cwd=SERVICE_ROOT,
        ).stdout.strip()
        dirty = subprocess.run(
            ["git", "status", "--porcelain", "--untracked-files=no"],
            capture_output=True, text=True, check=True, cwd=SERVICE_ROOT,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None
    return f"{commit}-dirty" if dirty else commit


def selected_stages(requested: list[str] | None) -> list[str]:
    """Expand ``all`` and add extraction, which chapter writing depends on."""
    chosen = set(STAGES if not requested or "all" in requested else requested)
    if "chapter_writing" in chosen:
        chosen.add("extraction")
    return [stage for stage in STAGES if stage in chosen]


async def evaluate(args: argparse.Namespace) -> GoldenSetReport:
    """Evaluate selected fixtures once and record producer/judge provenance."""
    settings = get_settings()
    stages = selected_stages(args.stages)
    fixtures = load_golden_fixtures(args.fixtures_dir, args.fixtures)
    if settings.llm.models.cnb_golden_set_judge is None:
        raise GoldenJudgeError(
            "Configure models.cnb_golden_set_judge before evaluation"
        )
    logger.info("Evaluating %s fixtures stages=%s", len(fixtures), ",".join(stages))
    started = time.monotonic()

    def run(loaded: LoadedFixture) -> Any:
        return _evaluate_fixture(
            loaded, settings, stages, args.output_dir / "outputs" / loaded.fixture.fixture_id
        )

    with UsageRecorder(prompt_names(settings.llm.prompts)):
        if args.parallel:
            reports = list(await asyncio.gather(*(run(loaded) for loaded in fixtures)))
        else:
            # Keep provider load bounded: one fixture and one judge request at a time.
            reports = [await run(loaded) for loaded in fixtures]
    models = settings.llm.models
    return GoldenSetReport(
        run_id=args.run_id,
        label=args.label,
        code_version=code_version(),
        wall_seconds=round(time.monotonic() - started, 1),
        generated_at=datetime.now(UTC).isoformat(),
        analysis_contract_version=source_analysis_contract_version(settings),
        judge_prompt_versions=judge_prompt_versions(settings, stages),
        models={
            "source_reader": _model_summary(models.cnb_source_reader),
            "source_synthesizer": _model_summary(models.cnb_source_synthesizer),
            "chapter_drafter": _model_summary(
                models.cnb_chapter_drafter or models.cnb_source_synthesizer
            ),
            "support_checker": _model_summary(
                models.cnb_chapter_support_checker or models.cnb_chapter_drafter
            ),
            "chapter_validator": _model_summary(
                models.cnb_chapter_validator or models.cnb_source_synthesizer
            ),
            "edit_planner": _model_summary(
                models.cnb_chat_edit_planner or models.cnb_source_synthesizer
            ),
            "judge": _model_summary(models.cnb_golden_set_judge),
        },
        fixtures=reports,
    )


async def _evaluate_fixture(
    loaded: LoadedFixture, settings: Settings, stages: list[str], output_dir: Path
) -> FixtureReport:
    """Run each enabled stage; extraction output feeds chapter writing."""
    output_dir.mkdir(parents=True, exist_ok=True)
    fixture = loaded.fixture
    report = FixtureReport(
        fixture_id=fixture.fixture_id,
        source_sha256=fixture.source.sha256,
        source_format=fixture.source.source_format,
    )
    problems = fixture_problems(loaded)
    if problems:
        invalid = StageReport(evaluation_errors=[f"invalid fixture: {p}" for p in problems])
        for stage in stages:
            setattr(report, stage, invalid)
        return report

    def usage(stage: str) -> StageUsage:
        return report.usage.setdefault(stage, StageUsage())

    source = None
    if "extraction" in stages:
        with measure(usage("extraction")):
            report.extraction, source = await _evaluate_extraction(loaded, settings, output_dir)
    if "chapter_writing" in stages and fixture.chapter_writing:
        if source is None:
            report.chapter_writing = StageReport(
                evaluation_errors=["blocked: extraction did not produce output"]
            )
        else:
            extraction = report.extraction.judgment if report.extraction else None
            with measure(usage("chapter_writing")):
                report.chapter_writing = await _evaluate_chapter_writing(
                    loaded,
                    settings,
                    output_dir / "chapter_writing",
                    source,
                    extraction
                    if isinstance(extraction, JudgeEvaluation)
                    and not report.extraction.evaluation_errors
                    else None,
                )
    if "verification" in stages and fixture.verification:
        from app.services.cnb.golden_set_verification import evaluate_verification

        with measure(usage("verification")):
            report.verification = await evaluate_verification(
                loaded, settings, output_dir / "verification", judge=judge_output
            )
    if "editing" in stages and fixture.editing:
        from app.services.cnb.golden_set_editing import evaluate_editing

        with measure(usage("editing")):
            report.editing = await evaluate_editing(
                loaded, settings, output_dir / "editing", judge=judge_output
            )
    return report


async def _evaluate_extraction(
    loaded: LoadedFixture, settings: Settings, output_dir: Path
) -> tuple[StageReport, SelectedSource | None]:
    """Analyze a source once; distinguish authentic excerpts from semantic support."""
    fixture = loaded.fixture
    try:
        source = await analyze_document(
            upload_id=golden_id(fixture.fixture_id, "upload"),
            filename=fixture.source.filename,
            source_label=fixture.source.source_label,
            sha256=fixture.source.sha256,
            source_format=fixture.source.source_format,
            pages=loaded.units,
            settings=settings,
            reader_limit=asyncio.Semaphore(
                settings.llm.generation.prompt_budget.cnb_sources.max_concurrency
            ),
        )
    except SourceAnalysisError as exc:
        return StageReport(evaluation_errors=[f"analysis_failed: {exc.code}"]), None
    # Production adds per-chapter quotations once a funding template is selected.
    template = fixture_template(loaded)
    if template is not None:
        chapters = template_chapter_requirements(template)
        try:
            chapter_excerpts = await extract_chapter_evidence(
                source_label=source.source_label,
                source_format=source.source_format,
                pages=loaded.units,
                chapters=chapters,
                settings=settings,
                reader_limit=asyncio.Semaphore(
                    settings.llm.generation.prompt_budget.cnb_sources.max_concurrency
                ),
            )
        except SourceAnalysisError as exc:
            return StageReport(evaluation_errors=[f"chapter_evidence_failed: {exc.code}"]), None
        source = source.model_copy(
            update={
                "chapter_excerpts": chapter_excerpts,
                "chapter_evidence_fingerprint": chapter_evidence_fingerprint(settings, chapters),
            }
        )
    (output_dir / "analysis.json").write_text(
        source.model_dump_json(indent=2), encoding="utf-8"
    )
    payload, integrity = extraction_judge_input(loaded, source)
    judgment = await _judge(payload, settings, output_dir / "extraction")
    if isinstance(judgment, StageReport):
        judgment.integrity_failures = integrity
        return judgment, source
    return score_extraction(loaded, payload, judgment, integrity), source


async def _evaluate_chapter_writing(
    loaded: LoadedFixture,
    settings: Settings,
    output_dir: Path,
    source: SelectedSource,
    extraction: JudgeEvaluation | None,
) -> StageReport:
    """Draft from fresh extraction, then judge transfer, support, and gap handling."""
    try:
        drafted, supplied = await write_chapters(loaded, settings, source)
    except ChapterDraftingError:
        return StageReport(evaluation_errors=["drafting_failed"])
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "drafts.json").write_text(
        json.dumps([c.as_json() for c in drafted], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    payload, integrity = chapter_writing_judge_input(loaded, drafted, supplied)
    judgment = await _judge(payload, settings, output_dir)
    if isinstance(judgment, StageReport):
        judgment.integrity_failures = integrity
        return judgment
    assert isinstance(judgment, ChapterWritingEvaluation)
    return score_chapter_writing(loaded, payload, judgment, integrity, extraction)


async def _judge(payload: JudgeInput, settings: Settings, output_dir: Path) -> Any:
    """Save a structured judgment, or return an evaluation-error report."""
    try:
        judgment = await judge_output(payload, settings)
    except GoldenJudgeError as exc:
        return StageReport(evaluation_errors=[str(exc)])
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "judgment.json").write_text(
        judgment.model_dump_json(indent=2), encoding="utf-8"
    )
    return judgment


def _model_summary(model: ResearchModelConfig) -> dict[str, str | None]:
    """Describe one configured model role for the report."""
    return {"name": model.name, "reasoning_effort": model.reasoning_effort}


def render_markdown(report: GoldenSetReport) -> str:
    """Show stage metrics and failures without copying source documents."""
    lines = [
        f"# CNB golden set: {'PASS' if report.passed else 'FAIL'}",
        "",
        f"Analysis contract: `{report.analysis_contract_version}`.",
        "",
    ]
    for role, model in report.models.items():
        lines.append(
            f"- {role}: `{model['name']}` (reasoning: {model['reasoning_effort']})"
        )
    for stage, digest in report.judge_prompt_versions.items():
        lines.append(f"- {stage} judge prompt SHA-256: `{digest}`")
    lines += _render_usage(report)
    for fixture in report.fixtures:
        lines += [
            "",
            f"## {fixture.fixture_id}: {'PASS' if fixture.passed else 'FAIL'}",
            f"Source `{fixture.source_format}` SHA-256 `{fixture.source_sha256}`.",
        ]
        for name in STAGES:
            stage = getattr(fixture, name)
            if stage is not None:
                lines += _render_stage(name, stage)
    return "\n".join(lines) + "\n"


def _render_usage(report: GoldenSetReport) -> list[str]:
    """Time, requests, tokens, and cost per fixture stage, with run totals."""
    rows = [
        (fixture.fixture_id, stage, usage)
        for fixture in report.fixtures
        for stage, usage in fixture.usage.items()
    ]
    if not rows:
        return []
    lines = [
        "",
        "## Usage",
        "",
        "| Fixture | Stage | Time (s) | Requests | Input tokens | Output tokens | Cost (USD) |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    lines += [
        f"| {fixture} | {stage} | {u.seconds:.0f} | {u.requests} | {u.input_tokens:,} | "
        f"{u.output_tokens:,} | {u.cost_usd:.2f} |"
        for fixture, stage, u in rows
    ]
    total = sum(u.cost_usd for _, _, u in rows)
    wall = f"{report.wall_seconds:.0f} s wall time, " if report.wall_seconds else ""
    lines.append(f"\nTotal: {wall}{sum(u.requests for _, _, u in rows)} requests, USD {total:.2f}.")
    return lines


def _render_stage(name: str, stage: StageReport) -> list[str]:
    """One stage: counts, metrics, failures, then the judge's verdict list."""
    lines = ["", f"### {name}: {'PASS' if stage.passed else 'FAIL'}"]
    if "required_fact_coverage" in stage.metrics:
        counts = [
            f"{int(stage.metrics[f'required_facts_{verdict}'])} {label}"
            for verdict, label in (
                ("covered", "fully covered"),
                ("partially_covered", "partially covered"),
                ("missing", "missing"),
                ("contradicted", "contradicted"),
            )
        ]
        lines.append("Required facts: **" + " · ".join(counts) + "**.")
    for metric, value in stage.metrics.items():
        if not metric.startswith(("required_facts_", "required_gaps_")):
            lines.append(f"- {metric}: {value:.2f}")
    for label, findings in (
        ("Integrity", stage.integrity_failures),
        ("Semantic", stage.semantic_failures),
        ("Evaluation error", stage.evaluation_errors),
    ):
        lines += [f"- **{label}:** {_snippet(item)}" for item in findings]
    for record in stage.details.get("transfer", []):
        lines.append(
            f"- Transfer `{record['fact']}`: extraction **{record['extraction_verdict']}**"
            f" → draft **{record['draft_verdict']}** ({record['outcome']})"
        )
    if stage.judgment is not None:
        if stage.evaluation_errors:
            lines.append("Judgment invalid; metrics withheld. Findings below are untrusted.")
        lines += _render_verdicts(stage.judgment.model_dump(mode="json"))
    return lines


def _render_verdicts(value: Any, depth: int = 0) -> list[str]:
    """List every verdict-bearing item, recursing into per-case judgments."""
    lines: list[str] = []
    for key, items in value.items():
        if not isinstance(items, list):
            continue
        for item in items:
            if not isinstance(item, dict):
                continue
            label = item.get("id") or item.get("unit_id") or item.get("chapter_ref") or item.get("case_id")
            if label is None and "output" in item:
                label = item["output"]["unit_id"]
            if "verdict" in item:
                lines.append(
                    f"{'  ' * depth}- {key} `{label}`: **{item['verdict']}** — {_snippet(item.get('reason', ''))}"
                )
            elif "case_id" in item:
                lines.append(f"{'  ' * depth}- case `{label}`")
                lines += _render_verdicts(item, depth + 1)
            elif "reason" in item:
                lines.append(f"{'  ' * depth}- {key}: {_snippet(item['reason'])}")
    return lines


def _snippet(text: str) -> str:
    """Bound and flatten model-supplied prose in the human-readable report."""
    return " ".join(text.split())[:400]


def main(argv: list[str] | None = None) -> int:
    """Write review artifacts and return nonzero for quality or evaluation failures."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
    args = parse_args(argv)
    if (args.output_dir / "report.json").exists():
        logger.error("Run %s already exists in %s", args.run_id, args.output_dir.parent)
        return 2
    report = asyncio.run(evaluate(args))
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "report.json").write_text(
        json.dumps(
            {**report.model_dump(mode="json"), "passed": report.passed},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    (args.output_dir / "report.md").write_text(
        render_markdown(report), encoding="utf-8"
    )
    logger.info(
        "CNB golden set %s; reports written to %s",
        "passed" if report.passed else "failed",
        args.output_dir,
    )
    # The viewer is a convenience; publishing problems never fail the run.
    try:
        index = publish_run(args.output_dir, args.results_dir, fixtures_dir=args.fixtures_dir)
        logger.info("Viewer updated: %s", index)
    except Exception as exc:  # noqa: BLE001 - keep the run's own exit code
        logger.warning("Viewer publish failed error_type=%s", type(exc).__name__)
    return 0 if report.passed else 1


if __name__ == "__main__":
    sys.exit(main())
