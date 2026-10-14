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
- --output-dir: reports and outputs (default climate-advisor/output/cnb_golden_set).
- OPENROUTER_API_KEY and normal Climate Advisor settings; llm_config.yaml selects
  producer/judge models and prompts under prompts/cnb/golden_set/.

Outputs:
- report.json and report.md with per-stage integrity failures, semantic findings,
  evaluation errors, model configuration, and prompt hashes. No full source text.
- outputs/<fixture>/analysis.json, chapter_writing/drafts.json,
  verification/seeded_draft.json and findings.json, editing/cases.json, and
  <stage>/judgment.json for review. No database writes.
- Exit 0 when all evaluated stages pass; 1 for quality/evaluation failures.

Usage (from climate-advisor/):
- uv run --directory service python -m scripts.evaluate_cnb_golden_set
- uv run --directory service python -m scripts.evaluate_cnb_golden_set \
      --fixture krakow-flood-drainage-plan --stage chapter_writing \
      --output-dir ../output/golden
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
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
from app.services.cnb.golden_set_workspace import golden_id
from app.services.cnb.source_analysis import (
    SourceAnalysisError,
    analyze_document,
    source_analysis_contract_version,
)

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)
SERVICE_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FIXTURES_DIR = SERVICE_ROOT / "tests" / "fixtures" / "cnb_golden_set"
DEFAULT_OUTPUT_DIR = SERVICE_ROOT.parent / "output" / "cnb_golden_set"


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
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Directory for reports and raw outputs",
    )
    return parser.parse_args(argv)


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
    reports = []
    # Keep provider load bounded: one fixture and one judge request at a time.
    for loaded in fixtures:
        reports.append(
            await _evaluate_fixture(
                loaded,
                settings,
                stages,
                args.output_dir / "outputs" / loaded.fixture.fixture_id,
            )
        )
    models = settings.llm.models
    return GoldenSetReport(
        generated_at=datetime.now(UTC).isoformat(),
        analysis_contract_version=source_analysis_contract_version(settings),
        judge_prompt_versions=judge_prompt_versions(settings, stages),
        models={
            "source_reader": _model_summary(models.cnb_source_reader),
            "source_synthesizer": _model_summary(models.cnb_source_synthesizer),
            "chapter_drafter": _model_summary(
                models.cnb_chapter_drafter or models.cnb_source_synthesizer
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

    source = None
    if "extraction" in stages:
        report.extraction, source = await _evaluate_extraction(loaded, settings, output_dir)
    if "chapter_writing" in stages and fixture.chapter_writing:
        if source is None:
            report.chapter_writing = StageReport(
                evaluation_errors=["blocked: extraction did not produce output"]
            )
        else:
            extraction = report.extraction.judgment if report.extraction else None
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

        report.verification = await evaluate_verification(
            loaded, settings, output_dir / "verification", judge=judge_output
        )
    if "editing" in stages and fixture.editing:
        from app.services.cnb.golden_set_editing import evaluate_editing

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
    return 0 if report.passed else 1


if __name__ == "__main__":
    sys.exit(main())
