"""Fixture loading, exact integrity checks, and extraction-stage judgment scoring.

Python validates fixture artifacts and the production output's quotations, and
checks that the judge returned one verdict per expected item. Extraction fact
citations must point to exact retained text in their receiving chapter. Python
never infers semantic coverage or claim support from keywords or number presence.
Chapter writing, verification, and editing build on these helpers in their own
modules.
"""

from __future__ import annotations

import hashlib
import json
import logging
from collections import Counter
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from pathlib import Path

from app.models.cnb.context_bundle import SelectedSource
from app.services.citycatalyst_client import ConceptNoteMarkdownArtifact
from app.services.cnb.source_analysis import (
    SourceUnit,
    excerpt_source_anchor,
    source_unit_anchor,
    source_unit_page,
    verify_source_artifact,
)
from app.utils.cnb_information_markers import (
    information_marker_key,
    information_needed_markers,
)
from app.utils.concept_note_context import readable_source_heading

from benchmark.cnb.golden_set.models import (
    DraftingInput,
    ExpectedFact,
    GoldenFixture,
    GoldenLocator,
    JudgeEvaluation,
    JudgeInput,
    ReferenceDraft,
    StageReport,
    TextUnit,
)

logger = logging.getLogger(__name__)
GOLDEN_FIXTURE_FILE = "golden.json"


@dataclass(frozen=True)
class LoadedFixture:
    """Pinned reference evidence and optional fresh OCR input for the same source."""

    fixture: GoldenFixture
    directory: Path
    markdown: str
    units: list[SourceUnit]
    drafting_input: DraftingInput | None = None
    reference_draft: ReferenceDraft | None = None
    input_units: list[SourceUnit] | None = None
    input_markdown: str | None = None
    input_sha256: str | None = None


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
    drafting_input = None
    if fixture.chapter_writing is not None:
        drafting_input = DraftingInput.model_validate_json(
            (directory / fixture.chapter_writing.input).read_text(encoding="utf-8")
        )
    reference_names = {
        stage.reference_draft
        for stage in (fixture.verification, fixture.editing)
        if stage is not None
    }
    if len(reference_names) > 1:
        raise ValueError(f"{fixture.fixture_id}: stages use different reference drafts")
    reference_draft = None
    if reference_names:
        reference_draft = ReferenceDraft.model_validate_json(
            (directory / reference_names.pop()).read_text(encoding="utf-8")
        )
    return LoadedFixture(
        fixture=fixture,
        directory=directory,
        markdown=markdown,
        units=units,
        drafting_input=drafting_input,
        reference_draft=reference_draft,
    )


def golden_evidence_problems(loaded: LoadedFixture) -> list[str]:
    """Return extraction evidence that is not exact text at an allowed locator."""
    problems: list[str] = []
    for fact in loaded.fixture.extraction.facts:
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


def ground_truth_fingerprints(loaded: LoadedFixture) -> dict[str, str]:
    """Fingerprint the source, complete template input, and semantic requirement policy."""
    template = loaded.drafting_input.model_dump(mode="json") if loaded.drafting_input else None
    requirements = {
        stage: getattr(loaded.fixture, stage).model_dump(mode="json")
        for stage in ("extraction", "chapter_writing", "verification", "editing")
        if getattr(loaded.fixture, stage) is not None
    }
    fingerprints = {
        "source_sha256": hashlib.sha256(loaded.markdown.encode("utf-8")).hexdigest(),
        "template_sha256": hashlib.sha256(
            json.dumps(template, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        ).hexdigest(),
        "requirements_sha256": hashlib.sha256(
            json.dumps(requirements, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        ).hexdigest(),
    }
    if loaded.fixture.source.original_pdf is not None:
        fingerprints["original_pdf_sha256"] = loaded.fixture.source.original_pdf.sha256
    return fingerprints


def approval_problems(loaded: LoadedFixture) -> list[str]:
    """Return review blockers separately from fixture validity and raw quality scores."""
    approval = loaded.fixture.approval
    problems = []
    if approval.status != "approved":
        problems.append(f"ground truth approval is {approval.status}; Product review required")
    if not approval.reviewer or not approval.reviewer.strip() or approval.reviewed_at is None:
        problems.append("ground truth approval lacks reviewer or review date")
    for name, fingerprint in ground_truth_fingerprints(loaded).items():
        if getattr(approval, name) != fingerprint:
            problems.append(f"ground truth approval has stale or missing {name}")
    return problems


def evaluated_approval(loaded: LoadedFixture) -> dict[str, object]:
    """Return report-ready approval status, blockers, and current fingerprints."""
    errors = approval_problems(loaded)
    status = "pending"
    if loaded.fixture.approval.status == "approved":
        status = "stale" if errors else "approved"
    return {
        "approval_status": status,
        "approval_errors": errors,
        "fingerprints": ground_truth_fingerprints(loaded),
    }


def extraction_pair_id(fact_id: str, chapter_ref: str) -> str:
    """Identify a stable source fact and one receiving chapter without ambiguity."""
    return f"{fact_id}::{chapter_ref}"


def fixture_problems(loaded: LoadedFixture) -> list[str]:
    """Check cross-file references a typo would otherwise silently break.

    Covers chapter references, extraction-fact links, the validator's field
    ownership rule, and reference-draft markers. Defect and edit checks live in
    the verification and editing modules.
    """
    problems = golden_evidence_problems(loaded)
    fixture = loaded.fixture
    original = fixture.source.original_pdf
    if original is not None:
        pdf = loaded.directory / original.path
        if not pdf.exists():
            problems.append(f"original PDF missing: {original.path}")
        elif hashlib.sha256(pdf.read_bytes()).hexdigest() != original.sha256:
            problems.append(f"original PDF digest mismatch: {original.path}")
    writing, template = fixture.chapter_writing, loaded.drafting_input
    if writing is None or template is None:
        if fixture.verification or fixture.editing:
            problems.append("verification and editing require chapter_writing input")
        return problems
    refs = [chapter["chapter_ref"] for chapter in template.chapter_schema]
    if len(refs) != len(set(refs)):
        problems.append("duplicate template chapter IDs")
    extraction_ids = {fact.id for fact in fixture.extraction.facts}
    for fact in fixture.extraction.facts:
        problems += [
            f"{fact.id}: unknown receiving chapter {requirement.chapter_ref}"
            for requirement in fact.requirements if requirement.chapter_ref not in refs
        ]
    for item in [*writing.facts, *writing.gaps]:
        problems += [
            f"{item.id}: unknown chapter {ref}" for ref in item.chapters if ref not in refs
        ]
    for fact in writing.facts:
        if fact.extraction_fact and fact.extraction_fact not in extraction_ids:
            problems.append(f"{fact.id}: unknown extraction fact {fact.extraction_fact}")
    owned = {
        field for chapter in template.chapter_schema for field in chapter.get("required_fields", [])
    }
    problems += [
        f"required field not assigned to a chapter: {field}"
        for field in template.required_fields
        if field not in owned
    ]
    reference = loaded.reference_draft
    if reference is not None:
        if [chapter.chapter_ref for chapter in reference.chapters] != refs:
            problems.append("reference draft chapters do not match the template order")
        for chapter in reference.chapters:
            problems += [
                f"reference {chapter.chapter_ref}: {problem}"
                for problem in marker_parity_problems(chapter.body_markdown, chapter.gaps)
            ]
    return problems


def marker_parity_problems(body: str, gaps: Sequence[object]) -> list[str]:
    """Mirror production's one-to-one marker/gap rule (workspace persistence).

    Production rejects a generated chapter whose ``[Information needed: ...]``
    markers and structured gap questions do not match exactly once each.
    """
    markers = Counter(information_marker_key(marker) for marker in information_needed_markers(body))
    questions = Counter(information_marker_key(gap.question) for gap in gaps)
    problems = [
        f"marker without structured gap: {key}"
        for key in sorted((markers - questions).elements())
    ]
    problems += [
        f"structured gap without marker: {key}"
        for key in sorted((questions - markers).elements())
    ]
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
    """Reject incorrect locator types and non-exact quotes; retain verified text.

    Document-level quotations become ``retained/<n>/<anchor>`` units and
    per-chapter quotations ``retained/<chapter_ref>/<n>/<anchor>``.
    """
    input_units = loaded.units if loaded.input_units is None else loaded.input_units
    units = {source_unit_anchor(unit): unit for unit in input_units}
    is_pdf = loaded.fixture.source.source_format == "pdf"
    failures: list[str] = []
    verified: list[TextUnit] = []
    groups = [(None, source.key_excerpts)] + [
        (item.chapter_ref, item.excerpts) for item in source.chapter_excerpts
    ]
    for chapter_ref, excerpts in groups:
        prefix = f"{chapter_ref}/" if chapter_ref else ""
        for index, excerpt in enumerate(excerpts):
            anchor = excerpt_source_anchor(excerpt)
            unit = units.get(anchor)
            if unit is None or (excerpt.page is not None) != is_pdf:
                failures.append(f"excerpt {prefix}{index}: invalid locator {anchor}")
            elif not excerpt.text.strip() or excerpt.text not in unit.text:
                failures.append(
                    f"excerpt {prefix}{index}: non-exact or empty quotation at {anchor}"
                )
            else:
                verified.append(
                    TextUnit(
                        id=f"retained/{prefix}{index}/{anchor}",
                        text=excerpt.text,
                        kind="output",
                        chapter_ref=chapter_ref,
                    )
                )
    return failures, verified


def source_evidence(loaded: LoadedFixture) -> list[TextUnit]:
    """Give the judge the complete authoritative document with stable locators."""
    return [
        TextUnit(id=f"source/{source_unit_anchor(unit)}", text=unit.text, kind="source")
        for unit in loaded.units
    ]


def extraction_judge_input(
    loaded: LoadedFixture, source: SelectedSource, *, candidate: LoadedFixture | None = None
) -> tuple[JudgeInput, list[str]]:
    """Judge each chapter-fact pair against that chapter's retained quotations."""
    failures, retained = verify_excerpts(candidate or loaded, source)
    golden = loaded.fixture.extraction
    return JudgeInput(
        stage="extraction",
        expected_facts=[
            ExpectedFact(
                id=extraction_pair_id(f.id, requirement.chapter_ref),
                fact_id=f.id,
                chapter_ref=requirement.chapter_ref,
                statement=f.statement,
                required=requirement.priority == "mandatory",
                chapters=[requirement.chapter_ref],
            )
            for f in golden.facts
            for requirement in f.requirements
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
    """Require complete verdicts and valid chapter-local extraction fact citations."""
    errors: list[str] = []
    all_ids = [unit.id for unit in [*payload.outputs, *payload.evidence]]
    if len(set(all_ids)) != len(all_ids):
        errors.append("duplicate input text-unit IDs")
    for label, expected, actual in (
        ("facts", [f.id for f in payload.expected_facts], [f.id for f in judgment.facts]),
        ("topics", [t.id for t in payload.expected_topics], [t.id for t in judgment.topics]),
        (
            "chapters",
            [c.chapter_ref for c in payload.chapter_requirements],
            [c.chapter_ref for c in judgment.chapters],
        ),
    ):
        errors += exactly_once(label, expected, actual)
    if payload.stage == "extraction":
        expected = {fact.id: fact for fact in payload.expected_facts}
        outputs = {unit.id: unit for unit in payload.outputs}
        for item in judgment.facts:
            fact = expected.get(item.id)
            if fact is None:
                continue
            if item.verdict != "missing" and not item.output_refs:
                errors.append(f"{item.id}: non-missing verdict requires chapter output citations")
            for reference in item.output_refs:
                unit = outputs.get(reference.unit_id)
                if (
                    unit is None or unit.kind != "output"
                    or not unit.id.startswith("retained/")
                    or fact.chapter_ref is None or unit.chapter_ref != fact.chapter_ref
                    or not reference.quote.strip() or reference.quote not in unit.text
                ):
                    errors.append(f"{item.id}: citation must be exact retained text in {fact.chapter_ref}")
    return errors


def exactly_once(label: str, expected: Sequence[str], actual: Sequence[str]) -> list[str]:
    """Require one verdict per expected ID, with no extras or repeats."""
    if len(set(expected)) != len(expected) or Counter(expected) != Counter(actual):
        return [f"{label}: expected exactly one verdict for each supplied ID"]
    return []


def score_facts_and_claims(
    payload: JudgeInput,
    judgment: JudgeEvaluation,
    report: StageReport,
    min_required_fact_coverage: float,
) -> None:
    """Add coverage metrics and fail unsupported, unclear, or contradictory output."""
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
    if coverage < min_required_fact_coverage:
        report.semantic_failures.append(
            f"required_fact_coverage {coverage:.2f} < {min_required_fact_coverage}"
        )

    if payload.stage == "extraction":
        desirable = {fact.id for fact in payload.expected_facts if not fact.required}
        desirable_covered = sum(
            item.id in desirable and item.verdict == "covered" for item in judgment.facts
        )
        report.metrics["mandatory_pairs"] = len(required)
        report.metrics["desirable_pairs"] = len(desirable)
        report.metrics["desirable_pairs_covered"] = desirable_covered
        if desirable:
            report.metrics["desirable_fact_coverage"] = desirable_covered / len(desirable)
        report.details["desirable_fact_coverage"] = {
            "covered": desirable_covered,
            "total": len(desirable),
            "coverage": desirable_covered / len(desirable) if desirable else None,
        }
        report.details["missing_mandatory_pairs"] = [
            item.id for item in judgment.facts
            if item.id in required and item.verdict != "covered"
        ]
        verdicts = {item.id: item.verdict for item in judgment.facts}
        requirements = [
            {
                "id": fact.id,
                "fact_id": fact.fact_id,
                "chapter_ref": fact.chapter_ref,
                "priority": "mandatory" if fact.required else "desirable",
                "statement": fact.statement,
                "verdict": verdicts[fact.id],
            }
            for fact in payload.expected_facts
        ]
        report.details["requirements"] = requirements
        chapter_coverage = {}
        for chapter_ref in dict.fromkeys(row["chapter_ref"] for row in requirements):
            rows = [row for row in requirements if row["chapter_ref"] == chapter_ref]
            coverage = {}
            for priority in ("mandatory", "desirable"):
                matches = [row for row in rows if row["priority"] == priority]
                covered_count = sum(row["verdict"] == "covered" for row in matches)
                coverage[priority] = {
                    "covered": covered_count,
                    "total": len(matches),
                    "coverage": covered_count / len(matches) if matches else None,
                }
            coverage["missing_mandatory_pairs"] = [
                row["id"] for row in rows
                if row["priority"] == "mandatory" and row["verdict"] != "covered"
            ]
            chapter_coverage[chapter_ref] = coverage
        report.details["chapter_coverage"] = chapter_coverage

    # Unsupported meaning and contradictions are never averaged away.
    is_extraction = payload.stage == "extraction"
    for fact in judgment.facts:
        if fact.verdict == "contradicted":
            report.semantic_failures.append(f"contradicted fact: {fact.id}")
    supported = 0
    for claim in judgment.claims:
        # One failure per claim, naming every way it is not fully supported.
        verdicts = [f"{claim.verdict} by the source"] if claim.verdict != "supported" else []
        if not is_extraction and claim.supplied_verdict not in {None, "supported"}:
            verdicts.append(f"{claim.supplied_verdict} by the drafter input")
        if not claim.self_contained:
            verdicts.append("lacks sufficient context")
        supported += not verdicts
        if verdicts:
            report.semantic_failures.append(
                f"{claim.output.unit_id}: claim {', '.join(verdicts)}: {claim.reason}"
            )
    if judgment.claims:
        report.metrics["claim_support_rate"] = supported / len(judgment.claims)
    for conflict in judgment.contradictions:
        report.semantic_failures.append(f"contradictory output: {conflict.reason}")


def score_extraction(
    loaded: LoadedFixture,
    payload: JudgeInput,
    judgment: JudgeEvaluation,
    integrity_failures: list[str],
) -> StageReport:
    """Aggregate validated extraction verdicts without lexical surrogate scoring."""
    errors = validate_judgment(payload, judgment)
    report = StageReport(
        integrity_failures=integrity_failures,
        judgment=judgment,
        evaluation_errors=errors,
    )
    if errors:
        return report
    thresholds = loaded.fixture.extraction.thresholds
    score_facts_and_claims(
        payload, judgment, report, 1.0
    )
    topics = sum(t.verdict == "covered" for t in judgment.topics)
    topic_rate = topics / len(judgment.topics) if judgment.topics else 1.0
    report.metrics["topic_coverage"] = topic_rate
    if topic_rate < thresholds.min_topic_coverage:
        report.semantic_failures.append(
            f"topic_coverage {topic_rate:.2f} < {thresholds.min_topic_coverage}"
        )
    logger.info(
        "Golden judgment stage=extraction semantic_failures=%s",
        len(report.semantic_failures),
    )
    return report
