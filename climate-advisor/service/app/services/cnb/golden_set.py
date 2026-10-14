"""Fixture loading, exact integrity checks, and extraction-stage judgment scoring.

Python validates fixture artifacts, quotations, IDs, and judge references. It
never infers semantic coverage or claim support from keywords or number presence.
Chapter writing, verification, and editing build on these helpers in their own
modules.
"""

from __future__ import annotations

import hashlib
import logging
from collections import Counter
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from pathlib import Path

from app.models.cnb.context_bundle import SelectedSource
from app.models.cnb.golden_set import (
    DraftingInput,
    GoldenContract,
    ExpectedFact,
    GoldenFixture,
    GoldenLocator,
    JudgeEvaluation,
    JudgeInput,
    ReferenceDraft,
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
from app.utils.cnb_information_markers import (
    information_marker_key,
    information_needed_markers,
)
from app.utils.concept_note_context import readable_source_heading
from pydantic import BaseModel

logger = logging.getLogger(__name__)
GOLDEN_FIXTURE_FILE = "golden.json"


@dataclass(frozen=True)
class LoadedFixture:
    """A validated fixture with its Markdown parsed into production source units."""

    fixture: GoldenFixture
    directory: Path
    markdown: str
    units: list[SourceUnit]
    drafting_input: DraftingInput | None = None
    reference_draft: ReferenceDraft | None = None


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
    extraction_ids = {fact.id for fact in fixture.extraction.facts}
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


def extraction_judge_input(
    loaded: LoadedFixture, source: SelectedSource
) -> tuple[JudgeInput, list[str]]:
    """Judge retained quotations against the full source, excluding generated prose."""
    failures, retained = verify_excerpts(loaded, source)
    golden = loaded.fixture.extraction
    return JudgeInput(
        stage="extraction",
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
        errors += exactly_once(label, expected, actual)

    # Validate exact output spans and chapter ownership before accepting coverage.
    expected_facts = {fact.id: fact for fact in payload.expected_facts}
    for item in [*judgment.facts, *judgment.topics]:
        if item.verdict != "missing" and not item.output_refs:
            errors.append(f"{item.id}: non-missing verdict needs output references")
        if item.verdict == "missing" and item.output_refs:
            errors.append(f"{item.id}: missing verdict must not cite output")
        for ref in item.output_refs:
            errors += reference_errors(ref, outputs)
    for item in judgment.facts:
        fact = expected_facts.get(item.id)
        for ref in item.output_refs:
            unit = outputs.get(ref.unit_id)
            if (
                unit
                and payload.stage == "extraction"
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
        errors += reference_errors(claim.output, outputs)
        output = outputs.get(claim.output.unit_id)
        checks = [(claim.verdict, claim.evidence, {"source", "context"})]
        if payload.stage == "extraction":
            if claim.supplied_verdict is not None or claim.supplied_evidence:
                errors.append("extraction must not judge supplied-evidence support")
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
                errors += reference_errors(ref, evidence)
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
            errors += reference_errors(ref, outputs)
            unit = outputs.get(ref.unit_id)
            if unit and unit.chapter_ref != chapter.chapter_ref:
                errors.append(
                    f"{chapter.chapter_ref}: reference belongs to another chapter"
                )
    for conflict in judgment.contradictions:
        for ref in conflict.output_refs:
            errors += reference_errors(ref, outputs)
    return errors


def exactly_once(label: str, expected: Sequence[str], actual: Sequence[str]) -> list[str]:
    """Require one verdict per expected ID, with no extras or repeats."""
    if len(set(expected)) != len(expected) or Counter(expected) != Counter(actual):
        return [f"{label}: expected exactly one verdict for each supplied ID"]
    return []


_FOLD = str.maketrans({"‘": "'", "’": "'", "“": '"', "”": '"', "„": '"', "–": "-", "—": "-", " ": " "})


_IGNORED = set("()[]{}*_`\"'")


def _folded(text: str) -> tuple[str, list[int]]:
    """Case-, whitespace-, quote-, dash- and bracket-folded text with original offsets."""
    chars: list[str] = []
    offsets: list[int] = []
    for index, char in enumerate(text.translate(_FOLD)):
        # Brackets, quote marks, and Markdown emphasis never change meaning;
        # commas and periods are kept so numbers cannot merge.
        if char in _IGNORED:
            continue
        if char.isspace():
            if chars and chars[-1] == " ":
                continue
            char = " "
        for folded in char.casefold():
            chars.append(folded)
            offsets.append(index)
    return "".join(chars), offsets


def _repointed_unit(ref: TextReference, units: dict[str, TextUnit]) -> TextUnit | None:
    """The one real unit a mistyped unit ID unambiguously denotes, if any.

    Only units with the same kind and scope prefix (for example
    ``supplied/shared``) and the same final field name that contain the quote
    verbatim are candidates. The candidate sharing the longest ID suffix with
    the mistyped ID wins; a tie or no candidate is rejected.
    """
    parts = ref.unit_id.split("/")
    if len(parts) < 3:
        return None

    def shared_suffix(unit_id: str) -> int:
        """Number of trailing path segments the two IDs have in common."""
        count = 0
        for a, b in zip(reversed(unit_id.split("/")), reversed(parts)):
            if a != b:
                break
            count += 1
        return count

    candidates = sorted(
        (
            (shared_suffix(unit_id), unit)
            for unit_id, unit in units.items()
            if unit_id.split("/")[:2] == parts[:2]
            and unit_id.rsplit("/", 1)[-1] == parts[-1]
            and ref.quote in unit.text
        ),
        key=lambda item: item[0],
        reverse=True,
    )
    if not candidates or (len(candidates) > 1 and candidates[0][0] == candidates[1][0]):
        return None
    return candidates[0][1]


def repair_references(judgment: GoldenContract, units: dict[str, TextUnit]) -> list[str]:
    """Snap near-verbatim judge references to the one exact span they denote.

    A quote that differs from its unit only in case, whitespace, typographic
    quotes, dashes, brackets, or emphasis markers, and matches exactly one span
    after folding, is replaced with that exact span. A mistyped unit ID is re-pointed only to the single
    unit with the same kind, scope, and field name that contains the quote
    verbatim. A verbatim quote cited from the wrong unit (for example the
    neighbouring page) is re-pointed only to the single unit of the same kind
    and chapter scope that contains it, so evidence never changes chapters.
    Anything else is left for validation to reject. Returns a description of
    every repair for the report.
    """
    repairs: list[str] = []

    def visit(value: object) -> None:
        """Walk models and lists, snapping each text reference in place."""
        if isinstance(value, TextReference):
            unit = units.get(value.unit_id)
            if unit is None:
                target = _repointed_unit(value, units)
                if target is not None:
                    repairs.append(f"{value.unit_id} -> {target.id}")
                    value.unit_id = target.id
                return
            if value.quote in unit.text:
                return
            haystack, offsets = _folded(unit.text)
            needle = _folded(value.quote)[0].strip()
            start = haystack.find(needle) if needle else -1
            if start < 0 or haystack.find(needle, start + 1) >= 0:
                elsewhere = [
                    other
                    for other in units.values()
                    if other.kind == unit.kind
                    and other.chapter_ref == unit.chapter_ref
                    and value.quote.strip()
                    and value.quote in other.text
                ]
                if start < 0 and len(elsewhere) == 1:
                    repairs.append(f"{value.unit_id} -> {elsewhere[0].id} (quote found there)")
                    value.unit_id = elsewhere[0].id
                return
            end = offsets[start + len(needle) - 1] + 1
            exact = unit.text[offsets[start] : end]
            repairs.append(f"{value.unit_id}: {value.quote!r} -> {exact!r}")
            value.quote = exact
        elif isinstance(value, BaseModel):
            for name in type(value).model_fields:
                visit(getattr(value, name))
        elif isinstance(value, list):
            for item in value:
                visit(item)

    visit(judgment)
    return repairs


def units_by_id(payload: object) -> dict[str, TextUnit]:
    """Every output and evidence unit of a judge payload, by ID."""
    return {unit.id: unit for unit in [*payload.outputs, *payload.evidence]}


def reference_errors(ref: TextReference, units: dict[str, TextUnit]) -> list[str]:
    """Verify a nonempty verbatim span in a known text unit."""
    unit = units.get(ref.unit_id)
    if unit is None:
        return [f"unknown text unit: {ref.unit_id}"]
    if not ref.quote.strip() or ref.quote not in unit.text:
        return [f"non-exact judge quotation in {ref.unit_id}"]
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

    # Unsupported meaning and contradictions are never averaged away.
    is_extraction = payload.stage == "extraction"
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
        if not is_extraction and claim.supplied_verdict != "supported":
            report.semantic_failures.append(
                f"{claim.output.unit_id}: {claim.supplied_verdict} by drafter input: {claim.reason}"
            )
    for conflict in judgment.contradictions:
        report.semantic_failures.append(f"contradictory output: {conflict.reason}")


def score_extraction(
    loaded: LoadedFixture,
    payload: JudgeInput,
    judgment: JudgeEvaluation,
    integrity_failures: list[str],
) -> StageReport:
    """Aggregate validated extraction verdicts without lexical surrogate scoring."""
    repairs = repair_references(judgment, units_by_id(payload))
    errors = validate_judgment(payload, judgment)
    report = StageReport(
        integrity_failures=integrity_failures,
        judgment=judgment,
        evaluation_errors=errors,
        details={"repaired_quotes": repairs},
    )
    if errors:
        return report
    thresholds = loaded.fixture.extraction.thresholds
    score_facts_and_claims(
        payload, judgment, report, thresholds.min_required_fact_coverage
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
