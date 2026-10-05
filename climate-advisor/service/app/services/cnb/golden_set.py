"""Deterministic scoring for the CNB source-grounding golden set.

Loads checked-in fixtures, revalidates their Markdown with the production
source contract, and scores stage-1 source analyses and stage-2 chapter drafts.
Scoring never calls a model; the live evaluator supplies model outputs. Text
matching is wording-tolerant so rephrasing does not fail exact-string checks,
while excerpts and locators are still checked exactly.
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from difflib import SequenceMatcher
from itertools import combinations
from pathlib import Path
from statistics import mean

from app.models.cnb.context_bundle import SelectedSource, SourceExcerpt
from app.models.cnb.golden_set import (
    DraftFactFinding,
    DraftingGolden,
    DraftingInput,
    DraftingScore,
    DraftingThresholds,
    ExcerptFinding,
    GoldenFact,
    GoldenFixture,
    GoldenLocator,
    NumberFinding,
    SentenceFinding,
    SourceAnalysisRunScore,
    SourceAnalysisThresholds,
    StabilityScore,
    TermMatch,
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

GOLDEN_FIXTURE_FILE = "golden.json"
MIN_EVIDENCE_OVERLAP_CHARS = 40
MAX_FINDING_CHARS = 200
ROUNDING_TOLERANCE = 0.01
ROUNDING_MIN_VALUE = 10_000
_PUNCTUATION = str.maketrans(
    {
        "‐": "-",
        "‑": "-",
        "‒": "-",
        "–": "-",
        "—": "-",
        "−": "-",
        "‘": "'",
        "’": "'",
        "“": '"',
        "”": '"',
        " ": " ",
    }
)
_THOUSANDS_SEPARATOR = re.compile(r"(?<=\d),(?=\d{3}(?!\d))")
_NUMBER = re.compile(
    r"(?<![\w.])(?P<digits>\d+(?:\.\d+)?)"
    r"(?:\s*(?P<scale>thousand|million|billion)\b)?",
    re.IGNORECASE,
)
_SCALES = {"thousand": 1e3, "million": 1e6, "billion": 1e9}
_SENTENCE_BOUNDARY = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\"'(])")
_WORD = re.compile(r"[a-z]+")
_PRONOUN_OPENERS = {"it", "its", "they", "their", "he", "she"}
_DEMONSTRATIVE_OPENERS = {"this", "these", "those", "such"}
_NAMED_SUBJECT_WINDOW = 5
_STOPWORDS = {
    "about",
    "also",
    "been",
    "being",
    "both",
    "document",
    "documents",
    "each",
    "from",
    "have",
    "into",
    "more",
    "most",
    "other",
    "same",
    "should",
    "some",
    "such",
    "than",
    "that",
    "their",
    "them",
    "then",
    "there",
    "these",
    "they",
    "this",
    "those",
    "through",
    "were",
    "what",
    "when",
    "where",
    "which",
    "while",
    "will",
    "with",
    "would",
    "states",
    "stated",
    "describes",
    "described",
    "notes",
    "noted",
    "reports",
    "reported",
    "supplied",
}


@dataclass(frozen=True)
class LoadedFixture:
    """A validated fixture with its Markdown parsed into production source units."""

    fixture: GoldenFixture
    directory: Path
    markdown: str
    units: list[SourceUnit]


@dataclass(frozen=True)
class DraftedChapter:
    """One generated chapter body keyed by its template reference."""

    chapter_ref: str
    title: str
    body_markdown: str


def load_golden_fixtures(
    root: Path,
    fixture_ids: Iterable[str] | None = None,
) -> list[LoadedFixture]:
    """Load every fixture directory under ``root``, optionally filtered by id.

    Raises ``ValueError`` when a requested fixture id does not exist.
    """
    directories = sorted(path.parent for path in root.glob(f"*/{GOLDEN_FIXTURE_FILE}"))
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


def normalize_text(value: str) -> str:
    """Casefold and normalize punctuation, digit grouping, and whitespace."""
    value = _THOUSANDS_SEPARATOR.sub("", value.translate(_PUNCTUATION).casefold())
    return re.sub(r"\s+", " ", value).strip()


def matches_terms(text: str, match: TermMatch) -> bool:
    """Return whether normalized text contains one alternative from every group.

    Terms must start at a word boundary; terms ending in a digit must also end
    at one, so ``601`` never matches ``6010`` while ``prioriti`` matches
    ``prioritization``.
    """
    normalized = normalize_text(text)
    return all(
        any(_contains_term(normalized, normalize_text(term)) for term in group)
        for group in match.all_of
    )


def extract_numbers(text: str) -> list[tuple[str, float]]:
    """Return significant figures as raw text and value, ignoring single digits."""
    numbers: list[tuple[str, float]] = []
    for match in _NUMBER.finditer(_THOUSANDS_SEPARATOR.sub("", text)):
        digits, scale = match.group("digits"), match.group("scale")
        value = float(digits) * (_SCALES[scale.casefold()] if scale else 1)
        if "." not in digits and value < 10:
            continue
        numbers.append((match.group(0), value))
    return numbers


def split_sentences(text: str) -> list[str]:
    """Split prose into sentences without breaking decimals or abbreviations."""
    return [
        part.strip() for part in _SENTENCE_BOUNDARY.split(text.strip()) if part.strip()
    ]


def score_source_analysis(
    loaded: LoadedFixture,
    source: SelectedSource,
    *,
    run: int,
) -> SourceAnalysisRunScore:
    """Score one analysis for locators, exact excerpts, facts, topics, and claims."""
    golden = loaded.fixture.source_analysis
    units_by_anchor = {source_unit_anchor(unit): unit for unit in loaded.units}
    is_pdf = loaded.fixture.source.source_format == "pdf"

    # Step 1: every returned excerpt must cite a real unit and be exact there.
    findings: list[ExcerptFinding] = []
    invalid_locators = 0
    non_exact = 0
    verified: list[SourceExcerpt] = []
    for excerpt in source.key_excerpts:
        anchor = excerpt_source_anchor(excerpt)
        unit = units_by_anchor.get(anchor)
        if unit is None or (excerpt.page is not None) != is_pdf:
            invalid_locators += 1
            findings.append(_excerpt_finding(excerpt, "locator_not_in_source"))
        elif excerpt.text not in unit.text:
            non_exact += 1
            findings.append(_excerpt_finding(excerpt, "text_not_exact_at_locator"))
        else:
            verified.append(excerpt)

    # Step 2: expected facts must be stated and backed by a retained excerpt.
    covered = [
        fact for fact in golden.facts if matches_terms(source.summary, fact.match)
    ]
    required = [fact for fact in golden.facts if fact.required]
    covered_ids = {fact.id for fact in covered}
    missing_required = [fact.id for fact in required if fact.id not in covered_ids]
    ungrounded = [
        fact.id
        for fact in covered
        if not any(_excerpt_grounds_fact(excerpt, fact) for excerpt in verified)
    ]

    # Step 3: expected topics may appear in any returned topic wording.
    missing_topics = [
        topic.id
        for topic in golden.topics
        if not any(
            matches_terms(name, TermMatch(all_of=[topic.any_of]))
            for name in source.topics
        )
    ]

    # Step 4: each summary sentence needs retained-excerpt support and a subject.
    sentences = split_sentences(source.summary)
    support_text = " ".join(
        [*(excerpt.text for excerpt in verified), source.source_label, source.filename]
    )
    unsupported = [
        finding
        for sentence in sentences
        if (
            finding := _unsupported_sentence(
                sentence,
                support_text,
                golden.thresholds.min_sentence_term_support,
            )
        )
        is not None
    ]
    ambiguous = [
        SentenceFinding(sentence=_truncate(sentence), reason="ambiguous_subject")
        for sentence in sentences
        if _has_ambiguous_subject(sentence)
    ]

    return SourceAnalysisRunScore(
        run=run,
        required_fact_coverage=_ratio(
            len(required) - len(missing_required), len(required)
        ),
        fact_grounding=_ratio(len(covered) - len(ungrounded), len(covered)),
        topic_coverage=_ratio(
            len(golden.topics) - len(missing_topics), len(golden.topics), empty=1.0
        ),
        unsupported_sentence_rate=_ratio(len(unsupported), len(sentences)),
        ambiguous_sentence_rate=_ratio(len(ambiguous), len(sentences)),
        invalid_locators=invalid_locators,
        non_exact_excerpts=non_exact,
        covered_facts=sorted(covered_ids),
        missing_required_facts=missing_required,
        ungrounded_facts=ungrounded,
        missing_topics=missing_topics,
        unsupported_sentences=unsupported,
        ambiguous_sentences=ambiguous,
        excerpt_findings=findings,
    )


def compare_source_analyses(
    sources: Sequence[SelectedSource],
    scores: Sequence[SourceAnalysisRunScore],
    facts: Sequence[GoldenFact],
) -> StabilityScore:
    """Measure agreement between repeated analyses of one unchanged source."""
    covered_by_run = [set(score.covered_facts) for score in scores]
    unstable = [
        fact.id
        for fact in facts
        if len({fact.id in covered for covered in covered_by_run}) > 1
    ]
    topics = [{normalize_text(topic) for topic in source.topics} for source in sources]
    excerpts = [
        {
            (excerpt_source_anchor(item), normalize_text(item.text))
            for item in source.key_excerpts
        }
        for source in sources
    ]
    locators = [
        {excerpt_source_anchor(item) for item in source.key_excerpts}
        for source in sources
    ]
    return StabilityScore(
        runs=len(sources),
        fact_agreement=_ratio(len(facts) - len(unstable), len(facts), empty=1.0),
        unstable_facts=unstable,
        topic_jaccard=_mean_pairwise_jaccard(topics),
        excerpt_jaccard=_mean_pairwise_jaccard(excerpts),
        locator_jaccard=_mean_pairwise_jaccard(locators),
    )


def source_analysis_failures(
    thresholds: SourceAnalysisThresholds,
    scores: Sequence[SourceAnalysisRunScore],
) -> list[str]:
    """Apply documented gates: integrity per run, semantic rates as run means."""
    failures: list[str] = []

    # Integrity must hold in every run; a single invalid citation is a regression.
    worst_invalid = max(score.invalid_locators for score in scores)
    worst_non_exact = max(score.non_exact_excerpts for score in scores)
    if worst_invalid > thresholds.max_invalid_locators:
        failures.append(
            f"invalid_locators {worst_invalid} > {thresholds.max_invalid_locators}"
        )
    if worst_non_exact > thresholds.max_non_exact_excerpts:
        failures.append(
            f"non_exact_excerpts {worst_non_exact} > {thresholds.max_non_exact_excerpts}"
        )

    # Semantic metrics vary with sampling, so gate their mean across runs.
    minimums = {
        "required_fact_coverage": thresholds.min_required_fact_coverage,
        "fact_grounding": thresholds.min_fact_grounding,
        "topic_coverage": thresholds.min_topic_coverage,
    }
    maximums = {
        "unsupported_sentence_rate": thresholds.max_unsupported_sentence_rate,
        "ambiguous_sentence_rate": thresholds.max_ambiguous_sentence_rate,
    }
    for name, limit in minimums.items():
        value = mean(getattr(score, name) for score in scores)
        if value < limit:
            failures.append(f"{name} {value:.2f} < {limit:.2f}")
    for name, limit in maximums.items():
        value = mean(getattr(score, name) for score in scores)
        if value > limit:
            failures.append(f"{name} {value:.2f} > {limit:.2f}")
    return failures


def score_drafting(
    golden: DraftingGolden,
    chapters: Sequence[DraftedChapter],
    input_text: str,
) -> DraftingScore:
    """Score drafted chapters for expected-fact carry-over and invented figures.

    ``input_text`` is everything the drafter received except its own earlier
    output, so a figure is supported only when some input contains it.
    """
    # Step 1: find each expected fact in the chapters where the template needs it.
    facts: list[DraftFactFinding] = []
    for fact in golden.facts:
        found_in = [
            chapter.chapter_ref
            for chapter in chapters
            if matches_terms(chapter.body_markdown, fact.match)
        ]
        allowed = set(fact.chapters)
        facts.append(
            DraftFactFinding(
                fact_id=fact.id,
                origin=fact.origin,
                required=fact.required,
                found_in=found_in,
                covered=bool(allowed.intersection(found_in) if allowed else found_in),
            )
        )
    required = [fact for fact in facts if fact.required]

    # Step 2: every significant drafted figure must appear in the drafter input.
    available = [value for _, value in extract_numbers(input_text)]
    total_numbers = 0
    unsupported: list[NumberFinding] = []
    for chapter in chapters:
        for raw, value in extract_numbers(chapter.body_markdown):
            total_numbers += 1
            if not _number_supported(value, available):
                unsupported.append(
                    NumberFinding(
                        chapter_ref=chapter.chapter_ref,
                        number=raw,
                        context=_context(chapter.body_markdown, raw),
                    )
                )

    return DraftingScore(
        figures_checked=total_numbers,
        required_fact_coverage=_ratio(
            sum(fact.covered for fact in required), len(required), empty=1.0
        ),
        unsupported_number_rate=_ratio(len(unsupported), total_numbers),
        empty_chapters=[
            chapter.chapter_ref
            for chapter in chapters
            if not chapter.body_markdown.strip()
        ],
        facts=facts,
        unsupported_numbers=unsupported,
    )


def drafting_failures(
    thresholds: DraftingThresholds, score: DraftingScore
) -> list[str]:
    """Apply documented stage-2 gates to one drafted note."""
    failures: list[str] = []
    if score.required_fact_coverage < thresholds.min_required_fact_coverage:
        failures.append(
            f"required_fact_coverage {score.required_fact_coverage:.2f} "
            f"< {thresholds.min_required_fact_coverage:.2f}"
        )
    if score.unsupported_number_rate > thresholds.max_unsupported_number_rate:
        failures.append(
            f"unsupported_number_rate {score.unsupported_number_rate:.2f} "
            f"> {thresholds.max_unsupported_number_rate:.2f}"
        )
    if len(score.empty_chapters) > thresholds.max_empty_chapters:
        failures.append(
            f"empty_chapters {len(score.empty_chapters)} > {thresholds.max_empty_chapters}"
        )
    return failures


def _contains_term(text: str, term: str) -> bool:
    """Match a term at a word start, and at a word end when it ends in a digit."""
    end = r"(?![0-9])" if term[-1:].isdigit() else ""
    return re.search(rf"(?<![a-z0-9]){re.escape(term)}{end}", text) is not None


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


def _excerpt_grounds_fact(excerpt: SourceExcerpt, fact: GoldenFact) -> bool:
    """Return whether an excerpt overlaps fact evidence at an allowed locator."""
    for evidence in fact.evidence:
        for locator in evidence.locators:
            if locator.page is not None:
                at_locator = excerpt.page == locator.page
            else:
                at_locator = excerpt.anchor is not None and _heading_matches(
                    readable_source_heading(excerpt.anchor), locator
                )
            if at_locator and _texts_overlap(excerpt.text, evidence.text):
                return True
    return False


def _texts_overlap(left: str, right: str) -> bool:
    """Return whether two quotations share a substantial exact passage."""
    left, right = normalize_text(left), normalize_text(right)
    if left in right or right in left:
        return True
    longest = SequenceMatcher(None, left, right, autojunk=False).find_longest_match(
        0, len(left), 0, len(right)
    )
    return longest.size >= min(MIN_EVIDENCE_OVERLAP_CHARS, len(left), len(right))


def _unsupported_sentence(
    sentence: str,
    support_text: str,
    min_term_support: float,
) -> SentenceFinding | None:
    """Flag figures or wording that no retained excerpt or source name supports."""
    available = [value for _, value in extract_numbers(support_text)]
    missing_numbers = [
        raw
        for raw, value in extract_numbers(sentence)
        if not _number_supported(value, available)
    ]
    if missing_numbers:
        return SentenceFinding(
            sentence=_truncate(sentence),
            reason=f"figures_not_in_retained_excerpts: {', '.join(missing_numbers)}",
        )
    terms = _content_terms(sentence)
    if not terms:
        return None
    support = len(terms & _content_terms(support_text)) / len(terms)
    if support < min_term_support:
        return SentenceFinding(
            sentence=_truncate(sentence),
            reason=f"term_support {support:.2f} < {min_term_support:.2f}",
        )
    return None


def _content_terms(text: str) -> set[str]:
    """Return crude stems of substantive words for overlap scoring."""
    return {
        word[:6]
        for word in _WORD.findall(normalize_text(text))
        if len(word) >= 4 and word not in _STOPWORDS
    }


def _number_supported(value: float, available: Sequence[float]) -> bool:
    """Accept exact figures, or rounded figures for large monetary-scale values."""
    for candidate in available:
        if abs(value - candidate) < 1e-9:
            return True
        if (
            candidate >= ROUNDING_MIN_VALUE
            and abs(value - candidate) <= ROUNDING_TOLERANCE * candidate
        ):
            return True
    return False


def _has_ambiguous_subject(sentence: str) -> bool:
    """Flag a pronoun opener, or a demonstrative not followed by a proper name.

    "It funds..." and "This plan funds..." are ambiguous outside their
    partition; "This Harbor Point plan funds..." names its subject.
    """
    words = re.findall(r"[A-Za-z][\w'-]*", sentence)
    if not words:
        return False
    opener = words[0].casefold()
    if opener in _PRONOUN_OPENERS:
        return True
    following = words[1 : 1 + _NAMED_SUBJECT_WINDOW]
    return opener in _DEMONSTRATIVE_OPENERS and not any(
        word[0].isupper() for word in following
    )


def _mean_pairwise_jaccard(groups: Sequence[set]) -> float:
    """Average Jaccard similarity over every pair of runs."""
    pairs = list(combinations(groups, 2))
    if not pairs:
        return 1.0
    return mean(
        len(left & right) / len(left | right) if left | right else 1.0
        for left, right in pairs
    )


def _ratio(numerator: float, denominator: int, *, empty: float = 0.0) -> float:
    """Return a rounded ratio, or ``empty`` when there is nothing to measure."""
    return round(numerator / denominator, 4) if denominator else empty


def _excerpt_finding(excerpt: SourceExcerpt, reason: str) -> ExcerptFinding:
    """Describe a failing excerpt with a truncated quotation only."""
    return ExcerptFinding(
        locator=excerpt_source_anchor(excerpt),
        excerpt=_truncate(excerpt.text),
        reason=reason,
    )


def _context(text: str, needle: str) -> str:
    """Return a short window of generated text around one figure."""
    flattened = re.sub(r"\s+", " ", _THOUSANDS_SEPARATOR.sub("", text))
    index = flattened.find(needle)
    start = max(index - 60, 0)
    return _truncate(flattened[start : index + len(needle) + 60])


def _truncate(value: str) -> str:
    """Bound report text so findings never reproduce long source passages."""
    value = re.sub(r"\s+", " ", value).strip()
    return (
        value
        if len(value) <= MAX_FINDING_CHARS
        else f"{value[: MAX_FINDING_CHARS - 1]}…"
    )
