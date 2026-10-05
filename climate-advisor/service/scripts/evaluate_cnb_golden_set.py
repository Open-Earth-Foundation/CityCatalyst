"""Evaluate CNB source analysis and chapter drafting against the golden set.

Stage 1 analyzes each fixture's checked-in Markdown with the configured source
reader and synthesizer, repeating the analysis to measure stability. Stage 2
drafts every template chapter from the fixture's frozen context bundle with the
configured chapter drafter. Both stages are scored deterministically by
``app.services.cnb.golden_set`` and gated by each fixture's documented thresholds.

Inputs:
- CLI args:
  - ``--fixtures-dir``: golden fixture root (default ``tests/fixtures/cnb_golden_set``).
  - ``--fixture``: fixture id to run; repeat to select several (default: all).
  - ``--stage``: ``source_analysis``, ``drafting``, or ``all`` (default ``all``).
  - ``--repeats``: analyses per fixture for stability (default 2, minimum 1).
  - ``--output-dir``: report destination (default ``climate-advisor/output/cnb_golden_set``).
- Environment: ``OPENROUTER_API_KEY`` plus the normal Climate Advisor settings;
  ``llm_config.yaml`` selects the models, reasoning effort, prompts, and limits.

Outputs:
- ``report.json`` and ``report.md`` in the output directory. Reports name the
  fixture, analysis contract version, model configuration, metrics, and failing
  evidence truncated to short snippets; they never include full source text.
- ``outputs/<fixture>/analysis-run-<n>.json`` and ``drafts.json`` with the raw
  model results for reviewing intentional baseline changes.
- Exit code 0 when every gate passes and 1 when any gate fails.

Usage (from climate-advisor/):
- uv run --directory service python -m scripts.evaluate_cnb_golden_set
- uv run --directory service python -m scripts.evaluate_cnb_golden_set \
      --fixture richfield-flood-risk --stage drafting --output-dir ../output/golden
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path
from statistics import mean
from typing import Any
from uuid import NAMESPACE_URL, UUID, uuid5

from app.config import Settings, get_settings
from app.config.settings import ResearchModelConfig
from app.models.cnb.concept_note_application_context import (
    ApplicationContextFunder,
    ApplicationContextOpportunity,
    ApplicationContextTemplate,
    ConceptNoteApplicationContextResponse,
)
from app.models.cnb.context_bundle import (
    BundleCcContext,
    ConceptNoteContextBundle,
    SelectedSource,
    SourceDocumentText,
)
from app.models.cnb.golden_set import (
    DraftingReport,
    FixtureReport,
    GoldenSetReport,
    SourceAnalysisReport,
)
from app.models.db.concept_note import ConceptNoteRun
from app.persistence.concept_notes.workspace import (
    WorkspaceTemplateChapter,
    normalize_template_chapters,
)
from app.persistence.concept_notes.workspace_snapshots import WorkspaceChapterSnapshot
from app.services.cnb.application_context import included_sources_from_bundle
from app.services.cnb.chapter_drafting import (
    ChapterDraftingError,
    build_chapter_input,
    build_run_context,
    generate_chapter_draft,
)
from app.services.cnb.context_bundle import source_text_context
from app.services.cnb.golden_set import (
    DraftedChapter,
    LoadedFixture,
    compare_source_analyses,
    drafting_failures,
    golden_evidence_problems,
    load_drafting_input,
    load_golden_fixtures,
    score_drafting,
    score_source_analysis,
    source_analysis_failures,
)
from app.services.cnb.source_analysis import (
    SourceAnalysisError,
    analyze_document,
    render_source_text,
    source_analysis_contract_version,
)

logger = logging.getLogger(__name__)

SERVICE_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FIXTURES_DIR = SERVICE_ROOT / "tests" / "fixtures" / "cnb_golden_set"
DEFAULT_OUTPUT_DIR = SERVICE_ROOT.parent / "output" / "cnb_golden_set"
STAGES = ("source_analysis", "drafting", "all")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse fixture selection, stages, repeat count, and report location."""
    parser = argparse.ArgumentParser(
        description="Evaluate CNB grounding against the golden set."
    )
    parser.add_argument("--fixtures-dir", type=Path, default=DEFAULT_FIXTURES_DIR)
    parser.add_argument(
        "--fixture",
        action="append",
        dest="fixtures",
        help="Fixture id to evaluate; repeat for several (default: all)",
    )
    parser.add_argument("--stage", choices=STAGES, default="all")
    parser.add_argument("--repeats", type=int, default=2)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    args = parser.parse_args(argv)
    if args.repeats < 1:
        parser.error("--repeats must be at least 1")
    return args


async def evaluate(args: argparse.Namespace) -> GoldenSetReport:
    """Run the selected stages for every selected fixture and build the report."""
    settings = get_settings()
    fixtures = load_golden_fixtures(args.fixtures_dir, args.fixtures)
    run_analysis = args.stage in {"source_analysis", "all"}
    run_drafting = args.stage in {"drafting", "all"}
    logger.info(
        "Evaluating %s golden fixtures stage=%s repeats=%s",
        len(fixtures),
        args.stage,
        args.repeats,
    )

    # Fixtures are independent, so their stages run concurrently.
    reports = await asyncio.gather(
        *(
            _evaluate_fixture(
                loaded,
                settings=settings,
                repeats=args.repeats,
                run_analysis=run_analysis,
                run_drafting=run_drafting and loaded.fixture.drafting is not None,
                output_dir=args.output_dir / "outputs" / loaded.fixture.fixture_id,
            )
            for loaded in fixtures
        )
    )
    return GoldenSetReport(
        generated_at=datetime.now(UTC).isoformat(),
        analysis_contract_version=source_analysis_contract_version(settings),
        models={
            "source_reader": _model_summary(settings.llm.models.cnb_source_reader),
            "source_synthesizer": _model_summary(
                settings.llm.models.cnb_source_synthesizer
            ),
            "chapter_drafter": _model_summary(
                settings.llm.models.cnb_chapter_drafter
                or settings.llm.models.cnb_source_synthesizer
            ),
        },
        fixtures=list(reports),
    )


async def _evaluate_fixture(
    loaded: LoadedFixture,
    *,
    settings: Settings,
    repeats: int,
    run_analysis: bool,
    run_drafting: bool,
    output_dir: Path,
) -> FixtureReport:
    """Evaluate one fixture's enabled stages and persist raw model outputs."""
    output_dir.mkdir(parents=True, exist_ok=True)
    analysis, drafting = await asyncio.gather(
        (
            _evaluate_source_analysis(loaded, settings, repeats, output_dir)
            if run_analysis
            else _none()
        ),
        _evaluate_drafting(loaded, settings, output_dir) if run_drafting else _none(),
    )
    return FixtureReport(
        fixture_id=loaded.fixture.fixture_id,
        source_sha256=loaded.fixture.source.sha256,
        source_format=loaded.fixture.source.source_format,
        source_analysis=analysis,
        drafting=drafting,
    )


async def _evaluate_source_analysis(
    loaded: LoadedFixture,
    settings: Settings,
    repeats: int,
    output_dir: Path,
) -> SourceAnalysisReport:
    """Analyze one unchanged source several times and score every run."""
    fixture = loaded.fixture
    problems = golden_evidence_problems(loaded)
    if problems:
        return SourceAnalysisReport(runs=[], stability=None, failures=problems)

    # Repeat the production analysis on identical input to observe variation.
    reader_limit = asyncio.Semaphore(
        settings.llm.generation.prompt_budget.cnb_sources.max_concurrency
    )
    try:
        sources = await asyncio.gather(
            *(
                analyze_document(
                    upload_id=_fixture_upload_id(fixture.fixture_id),
                    filename=fixture.source.filename,
                    source_label=fixture.source.source_label,
                    sha256=fixture.source.sha256,
                    source_format=fixture.source.source_format,
                    pages=loaded.units,
                    settings=settings,
                    reader_limit=reader_limit,
                )
                for _ in range(repeats)
            )
        )
    except SourceAnalysisError as exc:
        logger.warning(
            "Golden source analysis failed fixture=%s code=%s reason=%s",
            fixture.fixture_id,
            exc.code,
            exc.reason,
        )
        return SourceAnalysisReport(
            runs=[], stability=None, failures=[f"analysis_failed: {exc.code}"]
        )

    # Persist raw results for review, then score correctness and stability.
    for run, source in enumerate(sources, start=1):
        (output_dir / f"analysis-run-{run}.json").write_text(
            source.model_dump_json(indent=2), encoding="utf-8"
        )
    scores = [
        score_source_analysis(loaded, source, run=run)
        for run, source in enumerate(sources, start=1)
    ]
    stability = (
        compare_source_analyses(sources, scores, fixture.source_analysis.facts)
        if len(sources) > 1
        else None
    )
    failures = source_analysis_failures(fixture.source_analysis.thresholds, scores)
    logger.info(
        "Golden source analysis fixture=%s runs=%s failures=%s",
        fixture.fixture_id,
        len(scores),
        len(failures),
    )
    return SourceAnalysisReport(runs=scores, stability=stability, failures=failures)


async def _evaluate_drafting(
    loaded: LoadedFixture,
    settings: Settings,
    output_dir: Path,
) -> DraftingReport:
    """Draft every template chapter from the frozen bundle and score the note."""
    golden = loaded.fixture.drafting
    if golden is None:
        raise ValueError(f"{loaded.fixture.fixture_id} has no drafting stage")
    application_context, run_context, chapters, templates = _drafting_workspace(
        loaded, settings
    )

    # Draft sequentially, as production does, so later chapters see earlier ones.
    input_parts: list[str] = []
    try:
        for index, chapter in enumerate(chapters):
            payload = build_chapter_input(
                application_context=application_context,
                run_context=run_context,
                current=chapter,
                template_chapter=templates[index],
                chapters=chapters,
            )
            input_parts.append(_drafter_input_text(payload))
            generated = await generate_chapter_draft(payload, settings=settings)
            chapters[index] = replace(chapter, body_markdown=generated.body_markdown)
            logger.info(
                "Golden drafting fixture=%s chapter=%s/%s",
                loaded.fixture.fixture_id,
                index + 1,
                len(chapters),
            )
    except ChapterDraftingError:
        logger.exception(
            "Golden chapter drafting failed fixture=%s", loaded.fixture.fixture_id
        )
        return DraftingReport(
            score=score_drafting(golden, [], ""), failures=["drafting_failed"]
        )

    # Persist the generated note, then score fact carry-over and figures.
    drafted = [
        DraftedChapter(
            chapter_ref=chapter.chapter_ref or "",
            title=chapter.title,
            body_markdown=chapter.body_markdown or "",
        )
        for chapter in chapters
    ]
    (output_dir / "drafts.json").write_text(
        json.dumps([item.__dict__ for item in drafted], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    score = score_drafting(golden, drafted, "\n".join(input_parts))
    failures = drafting_failures(golden.thresholds, score)
    logger.info(
        "Golden drafting fixture=%s chapters=%s failures=%s",
        loaded.fixture.fixture_id,
        len(drafted),
        len(failures),
    )
    return DraftingReport(score=score, failures=failures)


def _drafting_workspace(
    loaded: LoadedFixture,
    settings: Settings,
) -> tuple[
    ConceptNoteApplicationContextResponse,
    dict[str, Any],
    list[WorkspaceChapterSnapshot],
    list[WorkspaceTemplateChapter],
]:
    """Build the drafter's production inputs from the fixture's frozen bundle."""
    fixture = loaded.fixture
    drafting_input = load_drafting_input(loaded)
    upload_id = _fixture_upload_id(fixture.fixture_id)
    run_id = uuid5(NAMESPACE_URL, f"cnb-golden-set/{fixture.fixture_id}/run")
    city_id = uuid5(NAMESPACE_URL, f"cnb-golden-set/{fixture.fixture_id}/city")
    is_pdf = fixture.source.source_format == "pdf"

    # Rebuild the bundle exactly as a completed context build would persist it.
    selected_source = SelectedSource.model_validate(
        {
            **drafting_input.selected_source,
            "upload_id": upload_id,
            "source_label": fixture.source.source_label,
            "filename": fixture.source.filename,
            "sha256": fixture.source.sha256,
            "source_format": fixture.source.source_format,
            "page_count": len(loaded.units) if is_pdf else None,
            "block_count": None if is_pdf else len(loaded.units),
        }
    )
    source_text = source_text_context(
        [
            SourceDocumentText(
                upload_id=upload_id,
                source_label=fixture.source.source_label,
                filename=fixture.source.filename,
                source_format=fixture.source.source_format,
                text=render_source_text(loaded.units),
            )
        ],
        settings,
    )
    bundle = ConceptNoteContextBundle(
        selected_sources=[selected_source],
        cc_context=BundleCcContext.model_validate(drafting_input.cc_context),
        source_text=source_text,
    )
    run = ConceptNoteRun(
        run_id=run_id,
        name=drafting_input.run_name,
        city_id=str(city_id),
        project_id=None,
        context_summary={},
    )

    # Mirror the application context and empty workspace a new run drafts into.
    application_context = ConceptNoteApplicationContextResponse(
        run_id=run_id,
        city_id=city_id,
        funder=ApplicationContextFunder(
            id=uuid5(NAMESPACE_URL, f"cnb-golden-set/{fixture.fixture_id}/funder"),
            name=drafting_input.funder,
        ),
        opportunity=ApplicationContextOpportunity(
            id=uuid5(NAMESPACE_URL, f"cnb-golden-set/{fixture.fixture_id}/opportunity"),
            name=drafting_input.opportunity,
        ),
        template=ApplicationContextTemplate(
            id=uuid5(NAMESPACE_URL, f"cnb-golden-set/{fixture.fixture_id}/template"),
            name=drafting_input.template_name,
            chapter_schema=drafting_input.chapter_schema,
            required_fields=drafting_input.required_fields,
        ),
        included_sources=included_sources_from_bundle(bundle),
    )
    templates = normalize_template_chapters(drafting_input.chapter_schema)
    chapters = [
        WorkspaceChapterSnapshot(
            chapter_id=uuid5(
                NAMESPACE_URL,
                f"cnb-golden-set/{fixture.fixture_id}/{template.chapter_ref}",
            ),
            chapter_ref=template.chapter_ref,
            title=template.title,
            position=position,
            status="pending",
            required=template.required,
            user_locked=False,
            body_markdown=None,
            description=template.description,
        )
        for position, template in enumerate(templates)
    ]
    return application_context, build_run_context(run, bundle), chapters, templates


def _drafter_input_text(payload: dict[str, Any]) -> str:
    """Return everything the drafter received except its own earlier output."""
    inputs = {
        key: value
        for key, value in payload.items()
        if key not in {"previous_chapters", "current_body_markdown"}
    }
    return json.dumps(inputs, ensure_ascii=False)


def _fixture_upload_id(fixture_id: str) -> UUID:
    """Return a stable upload id so repeated evaluations are comparable."""
    return uuid5(NAMESPACE_URL, f"cnb-golden-set/{fixture_id}/upload")


def _model_summary(model: ResearchModelConfig) -> dict[str, str | None]:
    """Describe one configured model role for the report."""
    return {"name": model.name, "reasoning_effort": model.reasoning_effort}


async def _none() -> None:
    """Stand in for a disabled stage inside ``asyncio.gather``."""
    return None


def render_markdown(report: GoldenSetReport) -> str:
    """Render a concise developer-readable summary of the evaluation."""
    lines = [
        f"# CNB golden set: {'PASS' if report.passed else 'FAIL'}",
        "",
        f"- Analysis contract version: `{report.analysis_contract_version}`",
        *(
            f"- {role}: `{model['name']}` (reasoning: {model['reasoning_effort']})"
            for role, model in report.models.items()
        ),
    ]
    for fixture in report.fixtures:
        lines += [
            "",
            f"## {fixture.fixture_id}: {'PASS' if fixture.passed else 'FAIL'}",
            "",
            f"Source format `{fixture.source_format}`, "
            f"sha256 `{fixture.source_sha256[:12]}`.",
        ]
        if fixture.source_analysis is not None:
            lines += _render_source_analysis(fixture.source_analysis)
        if fixture.drafting is not None:
            lines += _render_drafting(fixture.drafting)
    return "\n".join(lines) + "\n"


def _render_source_analysis(report: SourceAnalysisReport) -> list[str]:
    """Render stage-1 metrics, stability, gate failures, and evidence."""
    lines = ["", f"### Stage 1: source analysis ({len(report.runs)} runs)"]
    if report.runs:
        metrics = [
            "required_fact_coverage",
            "fact_grounding",
            "topic_coverage",
            "unsupported_sentence_rate",
            "ambiguous_sentence_rate",
            "invalid_locators",
            "non_exact_excerpts",
        ]
        header = " | ".join(f"Run {score.run}" for score in report.runs)
        divider = "| --- |" + " --- |" * (len(report.runs) + 1)
        lines += ["", f"| Metric | {header} | Mean |", divider]
        for metric in metrics:
            values = [getattr(score, metric) for score in report.runs]
            cells = " | ".join(_format_metric(value) for value in values)
            lines.append(f"| {metric} | {cells} | {mean(values):.2f} |")
    if report.stability is not None:
        stability = report.stability
        unstable = ", ".join(stability.unstable_facts) or "none"
        lines += [
            "",
            f"Stability (informational): fact agreement {stability.fact_agreement:.2f} "
            f"(unstable: {unstable}), topic Jaccard {stability.topic_jaccard:.2f}, "
            f"excerpt Jaccard {stability.excerpt_jaccard:.2f}, "
            f"locator Jaccard {stability.locator_jaccard:.2f}.",
        ]
    lines += _render_failures(report.failures)
    evidence = []
    for score in report.runs:
        prefix = f"Run {score.run}"
        for label, ids in (
            ("missing required facts", score.missing_required_facts),
            ("facts without a retained excerpt", score.ungrounded_facts),
            ("missing topics", score.missing_topics),
        ):
            if ids:
                evidence.append(f"{prefix} {label}: {', '.join(ids)}")
        evidence += [
            f'{prefix} {item.reason}: "{item.sentence}"'
            for item in [*score.unsupported_sentences, *score.ambiguous_sentences]
        ]
        evidence += [
            f'{prefix} {item.reason} at `{item.locator}`: "{item.excerpt}"'
            for item in score.excerpt_findings
        ]
    if evidence:
        lines += ["", "Evidence:", *(f"- {item}" for item in evidence)]
    return lines


def _render_drafting(report: DraftingReport) -> list[str]:
    """Render stage-2 fact carry-over, invented figures, and gate failures."""
    score = report.score
    lines = [
        "",
        "### Stage 2: chapter drafting",
        "",
        f"Required fact coverage {score.required_fact_coverage:.2f}, "
        f"unsupported figure rate {score.unsupported_number_rate:.2f} "
        f"of {score.figures_checked} figures, "
        f"empty chapters {len(score.empty_chapters)}.",
        "",
        "| Fact | Origin | Required | Found in | Covered |",
        "| --- | --- | --- | --- | --- |",
        *(
            f"| {fact.fact_id} | {fact.origin} | {'yes' if fact.required else 'no'} | "
            f"{', '.join(fact.found_in) or '-'} | {'yes' if fact.covered else 'no'} |"
            for fact in score.facts
        ),
    ]
    lines += _render_failures(report.failures)
    if score.unsupported_numbers:
        lines += [
            "",
            "Figures absent from every drafter input:",
            *(
                f'- `{item.chapter_ref}` {item.number}: "{item.context}"'
                for item in score.unsupported_numbers
            ),
        ]
    return lines


def _format_metric(value: float | int) -> str:
    """Format rates with two decimals and counts as integers."""
    return f"{value:.2f}" if isinstance(value, float) else str(value)


def _render_failures(failures: list[str]) -> list[str]:
    """Render gate failures, or an explicit pass line."""
    if not failures:
        return ["", "Gates: pass."]
    return ["", "Gate failures:", *(f"- {failure}" for failure in failures)]


def main(argv: list[str] | None = None) -> int:
    """Run the evaluation, write both reports, and return the gate exit code."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
    args = parse_args(argv)
    report = asyncio.run(evaluate(args))

    # Write machine- and human-readable reports side by side.
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "report.json").write_text(
        json.dumps(
            {**report.model_dump(mode="json"), "passed": report.passed},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    markdown = render_markdown(report)
    (args.output_dir / "report.md").write_text(markdown, encoding="utf-8")
    logger.info(
        "CNB golden set %s; reports written to %s",
        "passed" if report.passed else "failed",
        args.output_dir,
    )
    return 0 if report.passed else 1


if __name__ == "__main__":
    sys.exit(main())
