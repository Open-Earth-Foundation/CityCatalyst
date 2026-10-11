"""Exact integrity checks and aggregation of evidence-based LLM judgments.

Python validates fixture artifacts, quotations, IDs, and judge references. It
never infers semantic coverage or claim support from keywords or number presence.
"""

from __future__ import annotations

import logging
from collections import Counter
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from pathlib import Path

from app.models.cnb.context_bundle import SelectedSource
from app.models.cnb.golden_set import (
    DraftingInput,
    ExpectedFact,
    GoldenFixture,
    GoldenLocator,
    JudgeEvaluation,
    JudgeInput,
    StageReport,
    TextReference,
    TextUnit,
)
from app.services.citycatalyst_client import ConceptNoteMarkdownArtifact
from app.services.cnb.source_analysis import (
    SourceUnit,
    excerpt_source_anchor,
    source_unit_anchor,
    source_unit_page,
    verify_source_artifact,
)
from app.utils.concept_note_context import readable_source_heading

logger = logging.getLogger(__name__)
GOLDEN_FIXTURE_FILE = "golden.json"


@dataclass(frozen=True)
class LoadedFixture:
    """A validated fixture with its Markdown parsed into production source units."""

    fixture: GoldenFixture
    directory: Path
    markdown: str
    units: list[SourceUnit]


def load_golden_fixtures(
    root: Path,
    fixture_ids: Iterable[str] | None = None,
) -> list[LoadedFixture]:
    """Load every fixture directory under ``root``, optionally filtered by id.

    Raises ``ValueError`` when a requested fixture id does not exist.
    """
    directories = sorted(path.parent for path in root.glob(f"*/{GOLDEN_FIXTURE_FILE}"))
    if not directories:
        raise ValueError(f"No golden fixtures found in {root}")
    loaded = [load_golden_fixture(directory) for directory in directories]
    if fixture_ids is None:
        return loaded
    wanted = set(fixture_ids)
    unknown = wanted - {item.fixture.fixture_id for item in loaded}
    if unknown:
        raise ValueError(f"Unknown golden fixtures: {', '.join(sorted(unknown))}")
    return [item for item in loaded if item.fixture.fixture_id in wanted]


def load_golden_fixture(directory: Path) -> LoadedFixture:
    """Read one fixture and revalidate its Markdown with the production contract.

    Raises ``SourceAnalysisError`` when the digest, page markers, or page count
    no longer match the declared source, so stale fixtures fail loudly.
    """
    fixture = GoldenFixture.model_validate_json(
        (directory / GOLDEN_FIXTURE_FILE).read_text(encoding="utf-8")
    )
    markdown = (directory / fixture.source.path).read_text(encoding="utf-8")
    pointer = f"golden/{fixture.fixture_id}/{fixture.source.path}"
    units = verify_source_artifact(
        artifact=ConceptNoteMarkdownArtifact(
            markdown=markdown,
            markdown_s3_key=pointer,
            sha256=fixture.source.sha256,
            source_format=fixture.source.source_format,
            page_count=fixture.source.page_count,
        ),
        markdown_s3_key=pointer,
        sha256=fixture.source.sha256,
        source_format=fixture.source.source_format,
        page_count=fixture.source.page_count,
    )
    return LoadedFixture(
        fixture=fixture,
        directory=directory,
        markdown=markdown,
        units=units,
    )


def load_drafting_input(loaded: LoadedFixture) -> DraftingInput:
    """Read the frozen stage-2 input declared by a fixture."""
    if loaded.fixture.drafting is None:
        raise ValueError(f"{loaded.fixture.fixture_id} has no drafting stage")
    path = loaded.directory / loaded.fixture.drafting.input
    return DraftingInput.model_validate_json(path.read_text(encoding="utf-8"))


def golden_evidence_problems(loaded: LoadedFixture) -> list[str]:
    """Return fixture evidence that is not exact text at an allowed locator."""
    problems: list[str] = []
    for fact in loaded.fixture.source_analysis.facts:
        for evidence in fact.evidence:
            units = [
                unit
                for locator in evidence.locators
                for unit in _units_at(loaded.units, locator)
            ]
            if not units:
                problems.append(f"{fact.id}: no source unit matches its locators")
            elif not any(evidence.text in unit.text for unit in units):
                problems.append(
                    f"{fact.id}: evidence text is not exact at its locators"
                )
    return problems


def _units_at(units: Sequence[SourceUnit], locator: GoldenLocator) -> list[SourceUnit]:
    """Return source units at a page, or under a Markdown heading path."""
    if locator.page is not None:
        return [unit for unit in units if source_unit_page(unit) == locator.page]
    return [
        unit
        for unit in units
        if source_unit_page(unit) is None
        and _heading_matches(readable_source_heading(source_unit_anchor(unit)), locator)
    ]


def _heading_matches(heading: str, locator: GoldenLocator) -> bool:
    """Accept the exact heading path or any nested subsection of it."""
    expected = locator.heading or ""
    return heading == expected or heading.startswith(f"{expected}/")


def verify_excerpts(
    loaded: LoadedFixture, source: SelectedSource
) -> tuple[list[str], list[TextUnit]]:
    """Reject incorrect locator types and non-exact quotes; retain verified text."""
    units = {source_unit_anchor(unit): unit for unit in loaded.units}
    is_pdf = loaded.fixture.source.source_format == "pdf"
    failures: list[str] = []
    verified: list[TextUnit] = []
    for index, excerpt in enumerate(source.key_excerpts):
        anchor = excerpt_source_anchor(excerpt)
        unit = units.get(anchor)
        if unit is None or (excerpt.page is not None) != is_pdf:
            failures.append(f"excerpt {index}: invalid locator {anchor}")
        elif not excerpt.text.strip() or excerpt.text not in unit.text:
            failures.append(
                f"excerpt {index}: non-exact or empty quotation at {anchor}"
            )
        else:
            verified.append(
                TextUnit(
                    id=f"retained/{index}/{anchor}",
                    text=excerpt.text,
                    kind="output",
                )
            )
    return failures, verified


def source_evidence(loaded: LoadedFixture) -> list[TextUnit]:
    """Give the judge the complete authoritative document with stable locators."""
    return [
        TextUnit(id=f"source/{source_unit_anchor(unit)}", text=unit.text, kind="source")
        for unit in loaded.units
    ]


def source_judge_input(
    loaded: LoadedFixture, source: SelectedSource
) -> tuple[JudgeInput, list[str]]:
    """Judge retained quotations against the full source, excluding generated prose."""
    failures, retained = verify_excerpts(loaded, source)
    golden = loaded.fixture.source_analysis
    return JudgeInput(
        stage="source_analysis",
        expected_facts=[
            ExpectedFact(
                id=f.id, statement=f.statement, required=f.required, chapters=[]
            )
            for f in golden.facts
        ],
        expected_topics=golden.topics,
        chapter_requirements=[],
        outputs=[
            *retained,
            *[
                TextUnit(id=f"topic/{i}", text=topic, kind="output")
                for i, topic in enumerate(source.topics)
            ],
        ],
        evidence=source_evidence(loaded),
    ), failures


def validate_judgment(payload: JudgeInput, judgment: JudgeEvaluation) -> list[str]:
    """Reject incomplete IDs and fabricated or wrongly scoped judge references.

    This verifies the evaluator's contract, not the correctness of its semantic
    verdicts. Invalid evaluations are reported separately from product failures.
    """
    errors: list[str] = []
    outputs = {unit.id: unit for unit in payload.outputs}
    evidence = {unit.id: unit for unit in payload.evidence}
    all_ids = [unit.id for unit in [*payload.outputs, *payload.evidence]]
    if len(set(all_ids)) != len(all_ids):
        errors.append("duplicate input text-unit IDs")

    # Every expected item must receive exactly one judgment.
    for label, expected, actual in (
        (
            "facts",
            [f.id for f in payload.expected_facts],
            [f.id for f in judgment.facts],
        ),
        (
            "topics",
            [t.id for t in payload.expected_topics],
            [t.id for t in judgment.topics],
        ),
        (
            "chapters",
            [c.chapter_ref for c in payload.chapter_requirements],
            [c.chapter_ref for c in judgment.chapters],
        ),
    ):
        if len(set(expected)) != len(expected) or Counter(expected) != Counter(actual):
            errors.append(f"{label}: expected exactly one verdict for each supplied ID")

    # Validate exact output spans and chapter ownership before accepting coverage.
    expected_facts = {fact.id: fact for fact in payload.expected_facts}
    for item in [*judgment.facts, *judgment.topics]:
        if item.verdict != "missing" and not item.output_refs:
            errors.append(f"{item.id}: non-missing verdict needs output references")
        if item.verdict == "missing" and item.output_refs:
            errors.append(f"{item.id}: missing verdict must not cite output")
        for ref in item.output_refs:
            errors += _reference_errors(ref, outputs)
    for item in judgment.facts:
        fact = expected_facts.get(item.id)
        for ref in item.output_refs:
            unit = outputs.get(ref.unit_id)
            if (
                unit
                and payload.stage == "source_analysis"
                and not unit.id.startswith("retained/")
            ):
                errors.append(
                    f"{item.id}: source fact must be evaluated in retained quotations"
                )
            if fact and fact.chapters and item.verdict == "covered" and unit:
                if unit.chapter_ref not in fact.chapters:
                    errors.append(
                        f"{item.id}: covered fact cited outside allowed chapters"
                    )
    for item in judgment.topics:
        if any(not ref.unit_id.startswith("topic/") for ref in item.output_refs):
            errors.append(f"{item.id}: topic verdict must cite a returned topic")

    # A positive support verdict must cite verified evidence of the correct kind.
    if not judgment.claims and any(
        item.verdict == "covered" for item in judgment.facts
    ):
        errors.append("covered factual output has no claim judgments")
    for claim in judgment.claims:
        errors += _reference_errors(claim.output, outputs)
        output = outputs.get(claim.output.unit_id)
        checks = [(claim.verdict, claim.evidence, {"source", "context"})]
        if payload.stage == "source_analysis":
            if claim.supplied_verdict is not None or claim.supplied_evidence:
                errors.append(
                    "source analysis must not judge supplied-evidence support"
                )
        else:
            if claim.supplied_verdict is None:
                errors.append(
                    f"{claim.output.unit_id}: missing supplied-evidence verdict"
                )
            checks.append(
                (claim.supplied_verdict, claim.supplied_evidence, {"supplied"})
            )
        for verdict, refs, kinds in checks:
            if (
                verdict in {"supported", "partially_supported", "contradicted"}
                and not refs
            ):
                errors.append(f"{claim.output.unit_id}: {verdict} needs evidence")
            for ref in refs:
                errors += _reference_errors(ref, evidence)
                unit = evidence.get(ref.unit_id)
                if unit and unit.kind not in kinds:
                    errors.append(f"{ref.unit_id}: wrong evidence kind")
                if unit and unit.kind == "supplied" and unit.chapter_ref is not None:
                    if output and unit.chapter_ref != output.chapter_ref:
                        errors.append(
                            f"{ref.unit_id}: evidence was supplied to a different chapter"
                        )

    for chapter in judgment.chapters:
        if chapter.verdict != "not_satisfied" and not chapter.output_refs:
            errors.append(
                f"{chapter.chapter_ref}: satisfied chapter needs output references"
            )
        for ref in chapter.output_refs:
            errors += _reference_errors(ref, outputs)
            unit = outputs.get(ref.unit_id)
            if unit and unit.chapter_ref != chapter.chapter_ref:
                errors.append(
                    f"{chapter.chapter_ref}: reference belongs to another chapter"
                )
    for conflict in judgment.contradictions:
        for ref in conflict.output_refs:
            errors += _reference_errors(ref, outputs)
    return errors


def _reference_errors(ref: TextReference, units: dict[str, TextUnit]) -> list[str]:
    """Verify a nonempty verbatim span in a known text unit."""
    unit = units.get(ref.unit_id)
    if unit is None:
        return [f"unknown text unit: {ref.unit_id}"]
    if not ref.quote.strip() or ref.quote not in unit.text:
        return [f"non-exact judge quotation in {ref.unit_id}"]
    return []


def score_judgment(
    loaded: LoadedFixture,
    payload: JudgeInput,
    judgment: JudgeEvaluation,
    integrity_failures: list[str],
) -> StageReport:
    """Aggregate validated semantic verdicts without lexical surrogate scoring."""
    errors = validate_judgment(payload, judgment)
    report = StageReport(
        integrity_failures=integrity_failures,
        judgment=judgment,
        evaluation_errors=errors,
    )
    if errors:
        return report

    # Count only fully covered requirements; partial coverage remains visible.
    required = {fact.id for fact in payload.expected_facts if fact.required}
    covered = sum(
        item.id in required and item.verdict == "covered" for item in judgment.facts
    )
    coverage = covered / len(required) if required else 1.0
    report.metrics["required_fact_coverage"] = coverage
    for verdict in ("covered", "partially_covered", "missing", "contradicted"):
        report.metrics[f"required_facts_{verdict}"] = sum(
            item.id in required and item.verdict == verdict for item in judgment.facts
        )
    is_source = payload.stage == "source_analysis"
    thresholds = (
        loaded.fixture.source_analysis.thresholds
        if is_source
        else loaded.fixture.drafting.thresholds
    )
    if coverage < thresholds.min_required_fact_coverage:
        report.semantic_failures.append(
            f"required_fact_coverage {coverage:.2f} < {thresholds.min_required_fact_coverage}"
        )

    # Unsupported meaning and contradictions are never averaged away.
    for fact in judgment.facts:
        if fact.verdict == "contradicted":
            report.semantic_failures.append(f"contradicted fact: {fact.id}")
    for claim in judgment.claims:
        if claim.verdict != "supported":
            report.semantic_failures.append(
                f"{claim.output.unit_id}: {claim.verdict} claim: {claim.reason}"
            )
        if not claim.self_contained:
            report.semantic_failures.append(
                f"{claim.output.unit_id}: claim lacks sufficient context: {claim.reason}"
            )
        if not is_source and claim.supplied_verdict != "supported":
            report.semantic_failures.append(
                f"{claim.output.unit_id}: {claim.supplied_verdict} by drafter input: {claim.reason}"
            )
    for conflict in judgment.contradictions:
        report.semantic_failures.append(f"contradictory output: {conflict.reason}")

    # Source analysis must retain useful evidence; drafting must answer its template.
    if is_source:
        topics = sum(t.verdict == "covered" for t in judgment.topics)
        topic_rate = topics / len(judgment.topics) if judgment.topics else 1.0
        report.metrics["topic_coverage"] = topic_rate
        if topic_rate < thresholds.min_topic_coverage:
            report.semantic_failures.append(
                f"topic_coverage {topic_rate:.2f} < {thresholds.min_topic_coverage}"
            )
    else:
        required_chapters = {
            c.chapter_ref for c in payload.chapter_requirements if c.required
        }
        for chapter in judgment.chapters:
            if (
                chapter.chapter_ref in required_chapters
                and chapter.verdict != "satisfied"
            ):
                report.semantic_failures.append(
                    f"{chapter.chapter_ref}: {chapter.verdict}: {chapter.reason}"
                )
    logger.info(
        "Golden judgment stage=%s semantic_failures=%s",
        payload.stage,
        len(report.semantic_failures),
    )
    return report
