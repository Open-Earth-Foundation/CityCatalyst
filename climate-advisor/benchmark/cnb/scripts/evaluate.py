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
- --fixtures-dir: versioned fixtures (default benchmark/cnb/fixtures).
- --fixture: fixture ID; repeat the flag to select multiple fixtures (default all).
- --stage: extraction, chapter_writing, verification, editing, or all (default);
  repeat to select several. chapter_writing also runs extraction.
- --results-dir: results folder shared by all runs (default
  climate-advisor/output/cnb_golden_set, git-ignored; benchmark/cnb/results holds the
  committed runs). This run is saved in runs/<run-id>/.
- --run-id: folder name for this run (default: UTC time, YYYYMMDD-HHMMSS, plus
  the label); letters, digits, '.', '_' and '-' only. An existing run is refused.
- --label: optional short note shown in the viewer, for example "pr-3295".
- --baseline-manifest / --baseline-results-dir: reviewed baseline manifest and durable run store.
- --timeout-seconds: evaluation deadline (default 3600); finalization follows timeout.
- --input-path: markdown (default) or pdf; --pdf-artifacts-dir optionally reuses validated conversions.
- --parallel: evaluate fixtures concurrently in one process (faster; default is
  one fixture at a time to keep provider load bounded).
- OPENROUTER_API_KEY and normal Climate Advisor settings; llm_config.yaml selects
  producer/judge models; the judge prompts are in benchmark/cnb/prompts/.

Outputs (in <results-dir>/runs/<run-id>/; no database writes):
- report.json and report.md with per-stage integrity failures, semantic findings,
  evaluation errors, model configuration, prompt hashes, run ID, label, git
  commit, and per-stage usage: wall time, requests, tokens, and the cost
  OpenRouter reports (per agent too). No full source text.
- outputs/<fixture>/analysis.json, chapter_writing/drafts.json,
  verification/seeded_draft.json and findings.json, editing/cases.json, and
  <stage>/judgment.json for review.
- viewer.js, and the refreshed viewer at <results-dir>/index.html (see
  benchmark/cnb/scripts/publish.py). Open it to browse and compare runs.
- delivery.json, comparison.json/.md, and review-bundle.zip with candidate and approved baseline.
- Exit 0 for approved passing evaluation; 1 for quality failure; 2 for an existing
  run; 3 for unavailable/incomplete evaluation, approval, comparison or publication.

Usage (from climate-advisor/):
- uv run python -m benchmark.cnb.scripts.evaluate
- uv run python -m benchmark.cnb.scripts.evaluate \
      --fixture krakow-flood-drainage-plan --stage chapter_writing --label krakow-drafting
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import re
import shutil
import subprocess
import sys
import time
from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from collections.abc import Callable

from app.config import Settings, get_settings
from app.config.settings import ResearchModelConfig
from app.models.cnb.context_bundle import SelectedSource
from app.services.cnb.application_context import template_chapter_requirements
from app.services.cnb.chapter_drafting import ChapterDraftingError
from app.services.cnb.source_analysis import (
    SourceAnalysisError,
    analyze_document,
    chapter_evidence_fingerprint,
    extract_chapter_evidence,
    source_analysis_contract_version,
)

from benchmark.cnb.golden_set.chapters import (
    chapter_writing_judge_input,
    score_chapter_writing,
    write_chapters,
)
from benchmark.cnb.golden_set.core import (
    LoadedFixture,
    extraction_judge_input,
    fixture_problems,
    load_golden_fixtures,
    score_extraction,
)
from benchmark.cnb.golden_set.judge import (
    GoldenJudgeError,
    judge_output,
    judge_prompt_versions,
)
from benchmark.cnb.golden_set.models import (
    STAGES,
    ChapterWritingEvaluation,
    FixtureReport,
    GoldenSetReport,
    JudgeEvaluation,
    JudgeInput,
    StageReport,
    StageUsage,
)
from benchmark.utils.usage import UsageRecorder, measure, prompt_names
from benchmark.cnb.golden_set.viewer import publish_run, publish_bundle
from benchmark.cnb.golden_set.baseline import (
    evaluation_fingerprints,
    load_approved_baseline,
    compare_reports,
    render_comparison,
)
from benchmark.cnb.golden_set.workspace import fixture_template, golden_id

logger = logging.getLogger(__name__)
BENCHMARK_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FIXTURES_DIR = BENCHMARK_ROOT / "fixtures"
DEFAULT_RESULTS_DIR = BENCHMARK_ROOT.parents[1] / "output" / "cnb_golden_set"
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
    parser.add_argument(
        "--baseline-manifest",
        type=Path,
        default=BENCHMARK_ROOT / "baseline.json",
        help="Reviewed baseline manifest; pending is allowed",
    )
    parser.add_argument(
        "--baseline-results-dir",
        type=Path,
        default=BENCHMARK_ROOT / "results",
        help="Durable approved runs (trusted base checkout in CI)",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=int,
        default=3600,
        help="Maximum evaluation wall time; preserve partial reports on timeout",
    )
    parser.add_argument(
        "--input-path",
        choices=("markdown", "pdf"),
        default="markdown",
        help="Frozen Markdown or fresh production PDF conversion",
    )
    parser.add_argument(
        "--pdf-artifacts-dir",
        type=Path,
        help="Validated precomputed conversions, one directory per fixture",
    )
    parser.add_argument(
        "--run-id", help="Run folder name (default: UTC timestamp plus label)"
    )
    parser.add_argument("--label", help="Short note shown in the viewer")
    parser.add_argument(
        "--parallel",
        action="store_true",
        help="Evaluate fixtures concurrently instead of one at a time",
    )
    args = parser.parse_args(argv)
    if args.timeout_seconds <= 0:
        parser.error("--timeout-seconds must be positive")
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
            capture_output=True,
            text=True,
            check=True,
            cwd=BENCHMARK_ROOT,
        ).stdout.strip()
        dirty = subprocess.run(
            ["git", "status", "--porcelain", "--untracked-files=no"],
            capture_output=True,
            text=True,
            check=True,
            cwd=BENCHMARK_ROOT,
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


def _write_report(args: argparse.Namespace, report: GoldenSetReport) -> None:
    """Checkpoint completed stages atomically, including runs still in progress."""
    data = {**report.model_dump(mode="json"), "passed": report.passed}
    data.update(
        quality_failures=report.quality_failures,
        evaluation_unavailable=report.evaluation_unavailable,
    )
    temporary = args.output_dir / "report.json.tmp"
    temporary.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    temporary.replace(args.output_dir / "report.json")
    (args.output_dir / "report.md").write_text(
        render_markdown(report), encoding="utf-8"
    )


async def evaluate(args: argparse.Namespace) -> GoldenSetReport:
    """Evaluate serially by default and checkpoint every completed fixture stage."""
    settings = get_settings()
    stages = selected_stages(args.stages)
    fixtures = load_golden_fixtures(args.fixtures_dir, args.fixtures)
    if settings.llm.models.cnb_golden_set_judge is None:
        raise GoldenJudgeError(
            "Configure models.cnb_golden_set_judge before evaluation"
        )
    report = args.report
    report.requested_stages = stages
    report.expected_fixture_ids = [item.fixture.fixture_id for item in fixtures]
    report.input_path = args.input_path
    models = settings.llm.models
    report.analysis_contract_version = source_analysis_contract_version(settings)
    report.judge_prompt_versions = judge_prompt_versions(settings, stages)
    report.models = {
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
    }
    args.delivery["fingerprints"] = evaluation_fingerprints(
        fixtures, report.model_dump(mode="json"), stages, args.input_path
    )
    report.corpus_fingerprint = args.delivery["fingerprints"]["corpus"]
    report.evaluator_fingerprint = args.delivery["fingerprints"]["judge_policy"]
    args.delivery["expected_fixtures"] = [item.fixture.fixture_id for item in fixtures]
    args.delivery["stages"] = stages
    _write_report(args, report)
    started = time.monotonic()

    def checkpoint(fixture_report: FixtureReport) -> None:
        """Retain the same mutable fixture report before and after each stage."""
        index = next(
            (
                i
                for i, item in enumerate(report.fixtures)
                if item.fixture_id == fixture_report.fixture_id
            ),
            None,
        )
        if index is None:
            report.fixtures.append(fixture_report)
        else:
            report.fixtures[index] = fixture_report
        report.wall_seconds = round(time.monotonic() - started, 1)
        _write_report(args, report)

    async def run(loaded: LoadedFixture) -> None:
        """Prepare candidate input and preserve conversion failures as unavailable."""
        output = args.output_dir / "outputs" / loaded.fixture.fixture_id
        candidate = None
        if args.input_path == "pdf":
            from benchmark.cnb.golden_set.pdf import (
                convert_pdf_fixture,
                load_pdf_conversion,
            )

            conversion_dir = output / "conversion"
            if loaded.fixture.source.original_pdf is None:
                candidate = load_pdf_conversion(loaded, conversion_dir)
            elif args.pdf_artifacts_dir:
                origin = args.pdf_artifacts_dir / loaded.fixture.fixture_id
                shutil.copytree(origin, conversion_dir)
                candidate = load_pdf_conversion(loaded, conversion_dir)
            else:
                candidate = await convert_pdf_fixture(loaded, conversion_dir)
            if candidate.status == "not_applicable":
                args.delivery.setdefault("not_applicable", []).append(
                    loaded.fixture.fixture_id
                )
                checkpoint(
                    FixtureReport(
                        fixture_id=loaded.fixture.fixture_id,
                        source_sha256=loaded.fixture.source.sha256,
                        source_format=loaded.fixture.source.source_format,
                        inapplicable_reason=candidate.reason or "No pinned PDF",
                    )
                )
                return
        await _evaluate_fixture(
            loaded, settings, stages, output, checkpoint=checkpoint, candidate=candidate
        )

    async def retain_failure(loaded: LoadedFixture) -> None:
        """Isolate a failed fixture in either execution mode and keep completed stages."""
        try:
            await run(loaded)
        except Exception as exc:
            fid = loaded.fixture.fixture_id
            message = f"fixture_unavailable: {type(exc).__name__}"
            args.delivery["errors"].append(f"{fid}: {message}")
            fixture_report = next(
                (f for f in report.fixtures if f.fixture_id == fid), None
            )
            if fixture_report is None:
                fixture_report = FixtureReport(
                    fixture_id=fid,
                    source_sha256=loaded.fixture.source.sha256,
                    source_format=loaded.fixture.source.source_format,
                )
            for stage in stages:
                if getattr(fixture_report, stage) is None:
                    setattr(
                        fixture_report, stage, StageReport(evaluation_errors=[message])
                    )
            checkpoint(fixture_report)
            logger.error(
                "Fixture evaluation interrupted fixture=%s error_type=%s",
                fid,
                type(exc).__name__,
            )

    with UsageRecorder(prompt_names(settings.llm.prompts)):
        if args.parallel:
            await asyncio.gather(*(retain_failure(loaded) for loaded in fixtures))
        else:
            for loaded in fixtures:
                await retain_failure(loaded)
    report.wall_seconds = round(time.monotonic() - started, 1)
    return report


async def _evaluate_fixture(
    loaded: LoadedFixture,
    settings: Settings,
    stages: list[str],
    output_dir: Path,
    *,
    checkpoint: Callable[[FixtureReport], None] | None = None,
    candidate: Any = None,
) -> FixtureReport:
    """Run each enabled stage; extraction output feeds chapter writing."""
    output_dir.mkdir(parents=True, exist_ok=True)
    fixture = loaded.fixture
    report = FixtureReport(
        fixture_id=fixture.fixture_id,
        source_sha256=fixture.source.sha256,
        source_format=fixture.source.source_format,
    )
    from benchmark.cnb.golden_set.core import evaluated_approval

    approval = evaluated_approval(loaded)
    report.approval_status = approval["approval_status"]
    report.approval_errors = approval["approval_errors"]
    report.input_provenance = {
        "ground_truth": approval["fingerprints"],
        "input_path": "pdf" if candidate else "markdown",
    }
    if candidate is not None:
        report.input_provenance["conversion"] = candidate.metadata
    if checkpoint:
        checkpoint(report)
    problems = fixture_problems(loaded)
    if problems:
        invalid = StageReport(
            evaluation_errors=[f"invalid fixture: {p}" for p in problems]
        )
        for stage in stages:
            setattr(report, stage, invalid)
        if checkpoint:
            checkpoint(report)
        return report

    def usage(stage: str) -> StageUsage:
        return report.usage.setdefault(stage, StageUsage())

    source = None
    if "extraction" in stages:
        with measure(usage("extraction")):
            if candidate is None:
                report.extraction, source = await _evaluate_extraction(
                    loaded, settings, output_dir
                )
            else:
                report.extraction, source = await _evaluate_extraction(
                    loaded, settings, output_dir, candidate=candidate
                )
        if checkpoint:
            checkpoint(report)
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
                    producer_input=_candidate_fixture(loaded, candidate),
                )
        if checkpoint:
            checkpoint(report)
    if "verification" in stages and fixture.verification:
        from benchmark.cnb.golden_set.verification import evaluate_verification

        with measure(usage("verification")):
            report.verification = await evaluate_verification(
                loaded, settings, output_dir / "verification", judge=judge_output
            )
        if checkpoint:
            checkpoint(report)
    if "editing" in stages and fixture.editing:
        from benchmark.cnb.golden_set.editing import evaluate_editing

        with measure(usage("editing")):
            report.editing = await evaluate_editing(
                loaded, settings, output_dir / "editing", judge=judge_output
            )
        if checkpoint:
            checkpoint(report)
    return report


def _candidate_fixture(loaded: LoadedFixture, candidate: Any) -> LoadedFixture:
    """Give producers fresh OCR while preserving the independent judging reference."""
    if candidate is None:
        return loaded
    artifact = candidate.artifact
    source = loaded.fixture.source.model_copy(
        update={
            "sha256": artifact.sha256,
            "page_count": artifact.page_count,
            "source_format": artifact.source_format,
        }
    )
    return replace(
        loaded,
        fixture=loaded.fixture.model_copy(update={"source": source}),
        markdown=candidate.markdown,
        units=candidate.units,
    )


async def _evaluate_extraction(
    loaded: LoadedFixture,
    settings: Settings,
    output_dir: Path,
    *,
    candidate: Any = None,
) -> tuple[StageReport, SelectedSource | None]:
    """Analyze current input; judge its meaning against the independent reference."""
    fixture = loaded.fixture
    extraction_input = _candidate_fixture(loaded, candidate)
    try:
        source = await analyze_document(
            upload_id=golden_id(fixture.fixture_id, "upload"),
            filename=fixture.source.filename,
            source_label=fixture.source.source_label,
            sha256=extraction_input.fixture.source.sha256,
            source_format=extraction_input.fixture.source.source_format,
            pages=extraction_input.units,
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
                pages=extraction_input.units,
                chapters=chapters,
                settings=settings,
                reader_limit=asyncio.Semaphore(
                    settings.llm.generation.prompt_budget.cnb_sources.max_concurrency
                ),
            )
        except SourceAnalysisError as exc:
            return StageReport(
                evaluation_errors=[f"chapter_evidence_failed: {exc.code}"]
            ), None
        source = source.model_copy(
            update={
                "chapter_excerpts": chapter_excerpts,
                "chapter_evidence_fingerprint": chapter_evidence_fingerprint(
                    settings, chapters
                ),
            }
        )
    (output_dir / "analysis.json").write_text(
        source.model_dump_json(indent=2), encoding="utf-8"
    )
    payload, integrity = extraction_judge_input(
        loaded, source, candidate=extraction_input
    )
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
    *,
    producer_input: LoadedFixture | None = None,
) -> StageReport:
    """Draft from fresh extraction, then judge transfer, support, and gap handling."""
    try:
        drafted, supplied = await write_chapters(
            producer_input or loaded, settings, source
        )
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
        if fixture.inapplicable_reason:
            lines += [
                "",
                f"## {fixture.fixture_id}: NOT APPLICABLE",
                fixture.inapplicable_reason,
            ]
            continue
        lines += [
            "",
            f"## {fixture.fixture_id}: {'PASS' if fixture.passed else 'FAIL'}",
            f"Source `{fixture.source_format}` SHA-256 `{fixture.source_sha256}`.",
            f"Ground truth approval: **{fixture.approval_status}**. {'; '.join(fixture.approval_errors)}",
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
    conversions = [
        (fixture.fixture_id, fixture.input_provenance["conversion"])
        for fixture in report.fixtures
        if "conversion" in fixture.input_provenance
    ]
    if not rows and not conversions:
        return []
    lines = [
        "",
        "## Usage",
        "",
        "| Fixture | Stage | Time (s) | Requests | Input tokens | Output tokens | Reported cost (USD) | Cost coverage |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |",
    ]
    lines += [
        f"| {fixture} | {stage} | {u.seconds:.0f} | {u.requests} | {u.input_tokens:,} | "
        f"{u.output_tokens:,} | {u.cost_usd:.2f} | "
        f"{'complete' if u.cost_complete else f'partial: {u.unpriced_requests} unpriced requests'} |"
        for fixture, stage, u in rows
    ]
    total = sum(u.cost_usd for _, _, u in rows)
    wall = f"{report.wall_seconds:.0f} s wall time, " if report.wall_seconds else ""
    completeness = (
        "complete"
        if all(u.cost_complete for _, _, u in rows) and not conversions
        else "partial"
    )
    lines.append(
        f"\nReported total: {wall}{sum(u.requests for _, _, u in rows)} model requests, USD {total:.2f} ({completeness})."
    )
    for fixture, conversion in conversions:
        lines.append(
            f"- {fixture} PDF conversion: {conversion.get('elapsed_seconds', 'unavailable')} s; cost unavailable (excluded from reported total)."
        )
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
            lines.append(
                "Judgment invalid; metrics withheld. Findings below are untrusted."
            )
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
            label = (
                item.get("id")
                or item.get("unit_id")
                or item.get("chapter_ref")
                or item.get("case_id")
            )
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
    """Always retain partial results; publish errors separately from quality failures."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
    args = parse_args(argv)
    try:
        args.output_dir.mkdir(parents=True, exist_ok=False)
    except FileExistsError:
        logger.error("Run %s already exists in %s", args.run_id, args.output_dir.parent)
        return 2
    args.report = GoldenSetReport(
        run_id=args.run_id,
        label=args.label,
        code_version=code_version(),
        generated_at=datetime.now(UTC).isoformat(),
        analysis_contract_version="unavailable",
        judge_prompt_versions={},
        models={},
        fixtures=[],
        completed=False,
        input_path=args.input_path,
    )
    args.delivery = {
        "execution": "running",
        "errors": [],
        "input_path": args.input_path,
        "fingerprints": {},
    }
    _write_report(args, args.report)
    delivery_path = args.output_dir / "delivery.json"
    delivery_path.write_text(json.dumps(args.delivery, indent=2), encoding="utf-8")

    async def bounded() -> GoldenSetReport:
        """Leave finalization time after a bounded evaluation timeout."""
        return await asyncio.wait_for(evaluate(args), timeout=args.timeout_seconds)

    try:
        args.report = asyncio.run(bounded())
        args.delivery["execution"] = (
            "incomplete" if args.delivery["errors"] else "complete"
        )
    except (Exception, KeyboardInterrupt) as exc:
        args.delivery["execution"] = "incomplete"
        args.delivery["errors"].append(type(exc).__name__)
        logger.error("Evaluation interrupted error_type=%s", type(exc).__name__)
    args.report.completed = args.delivery["execution"] == "complete"
    args.report.run_errors = list(args.delivery["errors"])
    _write_report(args, args.report)
    baseline_dir, selection = load_approved_baseline(
        args.baseline_manifest, args.baseline_results_dir, args.delivery["fingerprints"]
    )
    args.delivery["baseline"] = selection
    args.delivery["approval_pending"] = [
        f.fixture_id
        for f in args.report.fixtures
        if not f.inapplicable_reason and f.approval_status != "approved"
    ]
    baseline_report = (
        json.loads((baseline_dir / "report.json").read_text(encoding="utf-8"))
        if baseline_dir
        else None
    )
    comparison = compare_reports(args.report.model_dump(mode="json"), baseline_report)
    if args.delivery["execution"] != "complete" or not any(
        not f.inapplicable_reason for f in args.report.fixtures
    ):
        comparison["evaluation_unavailable"] = True
    comparison["baseline"] = selection
    (args.output_dir / "comparison.json").write_text(
        json.dumps(comparison, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (args.output_dir / "comparison.md").write_text(
        render_comparison(comparison, args.delivery), encoding="utf-8"
    )

    args.delivery["publication"] = {"status": "preparing"}
    delivery_path.write_text(
        json.dumps(args.delivery, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    # Publication is separately visible; a quality failure must still get a bundle.
    try:
        publish_run(args.output_dir, args.results_dir, fixtures_dir=args.fixtures_dir)
        args.delivery["publication"] = {"status": "published"}
        delivery_path.write_text(
            json.dumps(args.delivery, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        (args.output_dir / "comparison.md").write_text(
            render_comparison(comparison, args.delivery), encoding="utf-8"
        )
        publish_bundle(
            args.output_dir,
            args.results_dir,
            baseline_dir=baseline_dir,
        )
    except Exception as exc:
        args.delivery["publication"] = {
            "status": "failed",
            "error_type": type(exc).__name__,
        }
        logger.error("Viewer publish failed error_type=%s", type(exc).__name__)
    delivery_path.write_text(
        json.dumps(args.delivery, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (args.output_dir / "comparison.md").write_text(
        render_comparison(comparison, args.delivery), encoding="utf-8"
    )
    unavailable = (
        args.delivery["execution"] != "complete"
        or comparison["evaluation_unavailable"]
        or selection["status"] != "comparable"
        or args.delivery["approval_pending"]
        or args.delivery["publication"]["status"] != "published"
    )
    return 3 if unavailable else (0 if args.report.passed else 1)


if __name__ == "__main__":
    sys.exit(main())
