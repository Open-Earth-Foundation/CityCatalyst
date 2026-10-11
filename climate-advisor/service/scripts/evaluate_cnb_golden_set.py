"""Evaluate CNB grounding with exact Python checks and an evidence-based LLM judge.

Inputs:
- --fixtures-dir: versioned fixtures (default service/tests/fixtures/cnb_golden_set).
- --fixture: fixture ID; repeat the flag to select multiple fixtures (default all).
- --stage: source_analysis, drafting (frozen bundle), end_to_end (fresh analysis),
  or all (default). Each selected path runs once; no repetition/stability tests.
- --output-dir: reports and outputs (default climate-advisor/output/cnb_golden_set).
- OPENROUTER_API_KEY and normal Climate Advisor settings; llm_config.yaml selects
  producer/judge models and prompts under prompts/cnb/golden_set/.

Outputs:
- report.json and report.md with per-stage integrity failures, semantic findings,
  evaluation errors, model configuration, and prompt hashes. No full source text.
- outputs/<fixture>/analysis.json, drafting/drafts.json, end_to_end/drafts.json,
  and <stage>/judgment.json for review. No database writes.
- Exit 0 when all evaluated stages pass; 1 for quality/evaluation failures.

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
from typing import Any
from uuid import NAMESPACE_URL, UUID, uuid5

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
    ChapterRequirement,
    ExpectedFact,
    FixtureReport,
    GoldenSetReport,
    JudgeInput,
    Stage,
    StageReport,
    TextUnit,
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
    LoadedFixture,
    golden_evidence_problems,
    load_drafting_input,
    load_golden_fixtures,
    score_judgment,
    source_evidence,
    source_judge_input,
)
from app.services.cnb.golden_set_judge import (
    GoldenJudgeError,
    judge_output,
    judge_prompt_versions,
)
from app.services.cnb.source_analysis import (
    SourceAnalysisError,
    analyze_document,
    render_source_text,
    source_analysis_contract_version,
)

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)
SERVICE_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FIXTURES_DIR = SERVICE_ROOT / "tests" / "fixtures" / "cnb_golden_set"
DEFAULT_OUTPUT_DIR = SERVICE_ROOT.parent / "output" / "cnb_golden_set"
STAGES = ("source_analysis", "drafting", "end_to_end", "all")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse fixture selection, single-pass stages, and report location."""
    parser = argparse.ArgumentParser(
        description="Evaluate CNB grounding with an LLM judge."
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
        choices=STAGES,
        default="all",
        help="Single-pass evaluation path (default: all)",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Directory for reports and raw outputs",
    )
    return parser.parse_args(argv)


async def evaluate(args: argparse.Namespace) -> GoldenSetReport:
    """Evaluate selected fixtures once and record producer/judge provenance."""
    settings = get_settings()
    fixtures = load_golden_fixtures(args.fixtures_dir, args.fixtures)
    if args.stage in {"drafting", "end_to_end"}:
        if args.fixtures and any(f.fixture.drafting is None for f in fixtures):
            raise ValueError("A selected fixture has no drafting stage")
        fixtures = [f for f in fixtures if f.fixture.drafting is not None]
    if not fixtures:
        raise ValueError("No fixtures support the selected stage")
    if settings.llm.models.cnb_golden_set_judge is None:
        raise GoldenJudgeError(
            "Configure models.cnb_golden_set_judge before evaluation"
        )
    logger.info("Evaluating %s fixtures stage=%s", len(fixtures), args.stage)
    reports = []
    # Keep provider load bounded: one fixture and one judge request at a time.
    for loaded in fixtures:
        reports.append(
            await _evaluate_fixture(
                loaded,
                settings,
                args.stage,
                args.output_dir / "outputs" / loaded.fixture.fixture_id,
            )
        )
    return GoldenSetReport(
        generated_at=datetime.now(UTC).isoformat(),
        analysis_contract_version=source_analysis_contract_version(settings),
        judge_prompt_versions=judge_prompt_versions(settings),
        models={
            "source_reader": _model_summary(settings.llm.models.cnb_source_reader),
            "source_synthesizer": _model_summary(
                settings.llm.models.cnb_source_synthesizer
            ),
            "chapter_drafter": _model_summary(
                settings.llm.models.cnb_chapter_drafter
                or settings.llm.models.cnb_source_synthesizer
            ),
            "judge": _model_summary(settings.llm.models.cnb_golden_set_judge),
        },
        fixtures=reports,
    )


async def _evaluate_fixture(
    loaded: LoadedFixture, settings: Settings, stage: str, output_dir: Path
) -> FixtureReport:
    """Generate once, evaluate each enabled path, and preserve upstream failures."""
    output_dir.mkdir(parents=True, exist_ok=True)
    report = FixtureReport(
        fixture_id=loaded.fixture.fixture_id,
        source_sha256=loaded.fixture.source.sha256,
        source_format=loaded.fixture.source.source_format,
    )
    source = None
    if stage in {"source_analysis", "end_to_end", "all"}:
        report.source_analysis, source = await _evaluate_source_analysis(
            loaded, settings, output_dir
        )
    if stage in {"drafting", "all"} and loaded.fixture.drafting:
        report.drafting = await _evaluate_drafting(
            loaded, settings, output_dir / "drafting"
        )
    if stage in {"end_to_end", "all"} and loaded.fixture.drafting:
        if source is None:
            report.end_to_end = StageReport(
                evaluation_errors=["blocked: source analysis did not produce output"]
            )
        else:
            # Still draft when analysis has semantic findings so propagation is visible.
            report.end_to_end = await _evaluate_drafting(
                loaded,
                settings,
                output_dir / "end_to_end",
                source,
            )
    return report


async def _evaluate_source_analysis(
    loaded: LoadedFixture, settings: Settings, output_dir: Path
) -> tuple[StageReport, SelectedSource | None]:
    """Analyze a source once; distinguish authentic excerpts from semantic support."""
    problems = golden_evidence_problems(loaded)
    if problems:
        return StageReport(
            evaluation_errors=[f"invalid fixture: {p}" for p in problems]
        ), None
    fixture = loaded.fixture
    try:
        source = await analyze_document(
            upload_id=_fixture_upload_id(fixture.fixture_id),
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
    payload, integrity = source_judge_input(loaded, source)
    return await _judge_stage(
        loaded, payload, integrity, settings, output_dir / "source_analysis"
    ), source


async def _judge_stage(
    loaded: LoadedFixture,
    payload: JudgeInput,
    integrity: list[str],
    settings: Settings,
    output_dir: Path,
) -> StageReport:
    """Save a structured judgment and fail closed on provider/schema/reference errors."""
    try:
        judgment = await judge_output(payload, settings)
    except GoldenJudgeError as exc:
        return StageReport(integrity_failures=integrity, evaluation_errors=[str(exc)])
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "judgment.json").write_text(
        judgment.model_dump_json(indent=2), encoding="utf-8"
    )
    return score_judgment(loaded, payload, judgment, integrity)


async def _evaluate_drafting(
    loaded: LoadedFixture,
    settings: Settings,
    output_dir: Path,
    analyzed_source: SelectedSource | None = None,
) -> StageReport:
    """Draft from frozen or fresh analysis, then judge truth and actual input support."""
    stage: Stage = "drafting" if analyzed_source is None else "end_to_end"
    application_context, run_context, chapters, templates = _drafting_workspace(
        loaded, settings, analyzed_source
    )
    supplied: list[TextUnit] = []
    try:
        # Match production ordering; previous chapters influence generation, never evidence.
        for index, chapter in enumerate(chapters):
            payload = build_chapter_input(
                application_context=application_context,
                run_context=run_context,
                current=chapter,
                template_chapter=templates[index],
                chapters=chapters,
            )
            inputs = {
                key: value
                for key, value in payload.items()
                if key
                not in {
                    "previous_chapters",
                    "current_body_markdown",
                    "chapter",
                    "existing_open_gaps",
                }
            }
            supplied += _text_units(
                inputs,
                f"supplied/{chapter.chapter_ref}",
                "supplied",
                chapter.chapter_ref,
            )
            generated = await generate_chapter_draft(payload, settings=settings)
            chapters[index] = replace(chapter, body_markdown=generated.body_markdown)
            logger.info(
                "Golden drafting fixture=%s stage=%s chapter=%s/%s",
                loaded.fixture.fixture_id,
                stage,
                index + 1,
                len(chapters),
            )
    except ChapterDraftingError:
        return StageReport(evaluation_errors=["drafting_failed"])

    # Authoritative truth excludes the generated/frozen selected_source analysis.
    frozen = load_drafting_input(loaded)
    context = {
        "cc_context": frozen.cc_context,
        "funder": frozen.funder,
        "opportunity": frozen.opportunity,
    }
    outputs = [
        TextUnit(
            id=f"chapter/{c.chapter_ref}",
            text=c.body_markdown or "",
            kind="output",
            chapter_ref=c.chapter_ref,
        )
        for c in chapters
    ]
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "drafts.json").write_text(
        json.dumps(
            [unit.model_dump() for unit in outputs], ensure_ascii=False, indent=2
        ),
        encoding="utf-8",
    )
    golden = loaded.fixture.drafting
    judge_input = JudgeInput(
        stage=stage,
        expected_facts=[
            ExpectedFact(
                id=f.id, statement=f.statement, required=f.required, chapters=f.chapters
            )
            for f in golden.facts
        ],
        expected_topics=[],
        chapter_requirements=[
            ChapterRequirement(
                chapter_ref=t.chapter_ref,
                title=t.title,
                description=t.description or "",
                required=t.required,
            )
            for t in templates
        ],
        outputs=outputs,
        evidence=[
            *source_evidence(loaded),
            *_text_units(context, "context", "context"),
            *_share_common_inputs(supplied, {c.chapter_ref for c in chapters}),
        ],
    )
    integrity = [
        f"empty chapter: {unit.chapter_ref}"
        for unit in outputs
        if not unit.text.strip()
    ]
    expected_ids = [t.chapter_ref for t in templates]
    actual_ids = [unit.chapter_ref for unit in outputs]
    if actual_ids != expected_ids or len(set(actual_ids)) != len(actual_ids):
        integrity.append("missing, duplicate, or unexpected chapter IDs")
    return await _judge_stage(loaded, judge_input, integrity, settings, output_dir)


def _share_common_inputs(
    units: list[TextUnit], chapter_refs: set[str]
) -> list[TextUnit]:
    """Send identical inputs shared by every chapter once, preserving access scope."""
    grouped: dict[tuple[str, str], list[TextUnit]] = {}
    for unit in units:
        # Remove only the supplied/chapter prefix; preserve the semantic field path.
        field = unit.id.split("/", 2)[2]
        grouped.setdefault((field, unit.text), []).append(unit)
    shared: list[TextUnit] = []
    for (field, _), group in grouped.items():
        if {unit.chapter_ref for unit in group} == chapter_refs:
            shared.append(
                group[0].model_copy(
                    update={"id": f"supplied/shared/{field}", "chapter_ref": None}
                )
            )
        else:
            shared.extend(group)
    return shared


def _text_units(
    value: Any, prefix: str, kind: str, chapter_ref: str | None = None
) -> list[TextUnit]:
    """Flatten actual JSON leaves into referenceable text without escaped source prose."""
    units: list[TextUnit] = []
    if isinstance(value, dict):
        for key, item in value.items():
            units += _text_units(item, f"{prefix}/{key}", kind, chapter_ref)
    elif isinstance(value, list):
        for index, item in enumerate(value):
            units += _text_units(item, f"{prefix}/{index}", kind, chapter_ref)
    elif value is not None:
        text = (
            value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
        )
        if text.strip():
            units.append(
                TextUnit(id=prefix, text=text, kind=kind, chapter_ref=chapter_ref)
            )
    return units


def _drafting_workspace(
    loaded: LoadedFixture,
    settings: Settings,
    analyzed_source: SelectedSource | None = None,
) -> tuple[
    ConceptNoteApplicationContextResponse,
    dict[str, Any],
    list[WorkspaceChapterSnapshot],
    list[WorkspaceTemplateChapter],
]:
    """Build production inputs with reviewed context and frozen or fresh analysis."""
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
    if analyzed_source is not None:
        selected_source = analyzed_source
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


def _fixture_upload_id(fixture_id: str) -> UUID:
    """Give the public fixture a stable synthetic upload identity."""
    return uuid5(NAMESPACE_URL, f"cnb-golden-set/{fixture_id}/upload")


def _model_summary(model: ResearchModelConfig) -> dict[str, str | None]:
    """Describe one configured model role for the report."""
    return {"name": model.name, "reasoning_effort": model.reasoning_effort}


def render_markdown(report: GoldenSetReport) -> str:
    """Show stage metrics and reviewable verdicts without copying source documents."""
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
        for name in ("source_analysis", "drafting", "end_to_end"):
            stage = getattr(fixture, name)
            if stage is None:
                continue
            lines += ["", f"### {name}: {'PASS' if stage.passed else 'FAIL'}"]
            for metric, value in stage.metrics.items():
                lines.append(f"- {metric}: {value:.2f}")
            for label, findings in (
                ("Integrity", stage.integrity_failures),
                ("Semantic", stage.semantic_failures),
                ("Evaluation error", stage.evaluation_errors),
            ):
                lines += [f"- **{label}:** {_snippet(item)}" for item in findings]
            if stage.judgment:
                if stage.evaluation_errors:
                    lines.append(
                        "Judgment invalid; metrics withheld. Findings below are untrusted."
                    )
                for group in (stage.judgment.facts, stage.judgment.topics):
                    for item in group:
                        lines.append(
                            f"- {item.id}: **{item.verdict}** — {_snippet(item.reason)}"
                        )
                for claim in stage.judgment.claims:
                    lines += [
                        f"- Claim in `{claim.output.unit_id}`: {_snippet(claim.output.quote)}",
                        f"  - Truth: **{claim.verdict}**; supplied evidence: **{claim.supplied_verdict}**; self-contained: {claim.self_contained}.",
                        f"  - {_snippet(claim.reason)}",
                    ]
                    for ref in [*claim.evidence, *claim.supplied_evidence]:
                        lines.append(
                            f"  - Evidence `{ref.unit_id}`: {_snippet(ref.quote)}"
                        )
                for chapter in stage.judgment.chapters:
                    lines.append(
                        f"- Chapter `{chapter.chapter_ref}`: **{chapter.verdict}** — {_snippet(chapter.reason)}"
                    )
    return "\n".join(lines) + "\n"


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
