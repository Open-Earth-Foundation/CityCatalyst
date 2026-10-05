"""Golden-set fixture and report contracts for CNB grounding evaluation.

Stage 1 (``source_analysis``) checks one analyzed source document against
expected facts, topics, exact excerpts, and allowed locators. Stage 2
(``drafting``) checks that drafted chapters carry expected document and
context-bundle facts without inventing figures. Expectations use any-of term
groups so harmless rewording does not fail exact-string checks.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.cnb.concept_note_markdown import ConceptNoteSourceFormat


class GoldenContract(BaseModel):
    """Reject unknown fields so fixture typos fail instead of being ignored."""

    model_config = ConfigDict(extra="forbid")


class TermMatch(GoldenContract):
    """Wording-tolerant match: every group needs one case-insensitive alternative."""

    all_of: list[list[str]] = Field(min_length=1)

    @model_validator(mode="after")
    def require_alternatives(self) -> TermMatch:
        """Reject empty groups, which would otherwise match every text."""
        if any(
            not group or not all(term.strip() for term in group)
            for group in self.all_of
        ):
            raise ValueError("Every term group needs at least one non-empty term")
        return self


class GoldenLocator(GoldenContract):
    """One allowed citation location: a PDF page or a Markdown heading path."""

    page: int | None = Field(default=None, ge=1)
    heading: str | None = Field(default=None, min_length=1)

    @model_validator(mode="after")
    def require_one_locator(self) -> GoldenLocator:
        """Mirror the production rule of exactly one locator per excerpt."""
        if (self.page is None) == (self.heading is None):
            raise ValueError("Golden locators require exactly one page or heading")
        return self


class GoldenEvidence(GoldenContract):
    """Exact source text that supports a fact at one of its allowed locators."""

    text: str = Field(min_length=1)
    locators: list[GoldenLocator] = Field(min_length=1)


class GoldenFact(GoldenContract):
    """A fact a correct source summary should state, with its exact evidence."""

    id: str = Field(min_length=1)
    statement: str = Field(min_length=1)
    required: bool = True
    match: TermMatch
    evidence: list[GoldenEvidence] = Field(min_length=1)


class GoldenTopic(GoldenContract):
    """A topic the analysis should name, matched by any listed alternative."""

    id: str = Field(min_length=1)
    any_of: list[str] = Field(min_length=1)


class SourceAnalysisThresholds(GoldenContract):
    """Documented gates; rates are means across repeated runs."""

    min_required_fact_coverage: float = Field(default=0.75, ge=0, le=1)
    min_fact_grounding: float = Field(default=0.6, ge=0, le=1)
    min_topic_coverage: float = Field(default=0.6, ge=0, le=1)
    max_unsupported_sentence_rate: float = Field(default=0.2, ge=0, le=1)
    max_ambiguous_sentence_rate: float = Field(default=0.2, ge=0, le=1)
    max_invalid_locators: int = Field(default=0, ge=0)
    max_non_exact_excerpts: int = Field(default=0, ge=0)
    min_sentence_term_support: float = Field(default=0.6, ge=0, le=1)


class SourceAnalysisGolden(GoldenContract):
    """Stage-1 expectations for one source document."""

    facts: list[GoldenFact] = Field(min_length=1)
    topics: list[GoldenTopic] = Field(default_factory=list)
    thresholds: SourceAnalysisThresholds = Field(
        default_factory=SourceAnalysisThresholds
    )


class DraftFact(GoldenContract):
    """A fact the drafted note should carry into one of the allowed chapters."""

    id: str = Field(min_length=1)
    statement: str = Field(min_length=1)
    origin: Literal["document", "context_bundle", "application_context"]
    required: bool = True
    chapters: list[str] = Field(default_factory=list)
    match: TermMatch


class DraftingThresholds(GoldenContract):
    """Documented stage-2 gates for one drafted note."""

    min_required_fact_coverage: float = Field(default=0.7, ge=0, le=1)
    max_unsupported_number_rate: float = Field(default=0.1, ge=0, le=1)
    max_empty_chapters: int = Field(default=0, ge=0)


class DraftingGolden(GoldenContract):
    """Stage-2 expectations plus the frozen input file they are drafted from."""

    input: str = Field(default="drafting_input.json", min_length=1)
    facts: list[DraftFact] = Field(min_length=1)
    thresholds: DraftingThresholds = Field(default_factory=DraftingThresholds)


class DraftingInput(GoldenContract):
    """Frozen context bundle and application template for stage 2.

    ``selected_source`` is a reviewed stage-1 result without identity fields;
    the evaluator adds the fixture's upload identity and digest.
    """

    run_name: str = Field(min_length=1)
    funder: str = Field(min_length=1)
    opportunity: str = Field(min_length=1)
    template_name: str = Field(min_length=1)
    chapter_schema: list[dict[str, Any]] = Field(min_length=1)
    required_fields: list[str] = Field(default_factory=list)
    cc_context: dict[str, Any] = Field(default_factory=dict)
    selected_source: dict[str, Any]


class GoldenSourceFile(GoldenContract):
    """Checked-in, non-sensitive Markdown in the same shape CC delivers to CA."""

    path: str = Field(default="source.md", min_length=1)
    filename: str = Field(min_length=1)
    source_label: str = Field(min_length=1)
    source_format: ConceptNoteSourceFormat
    page_count: int | None = Field(default=None, ge=1)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    provenance: str = Field(min_length=1)


class GoldenFixture(GoldenContract):
    """One golden-set case: a source document and its stage expectations."""

    fixture_id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]*$")
    description: str = Field(min_length=1)
    source: GoldenSourceFile
    source_analysis: SourceAnalysisGolden
    drafting: DraftingGolden | None = None


class SentenceFinding(BaseModel):
    """One summary sentence that failed a grounding heuristic."""

    sentence: str
    reason: str


class ExcerptFinding(BaseModel):
    """One returned excerpt whose locator or exact text could not be verified."""

    locator: str
    excerpt: str
    reason: str


class SourceAnalysisRunScore(BaseModel):
    """Semantic correctness of one analysis run."""

    run: int
    required_fact_coverage: float
    fact_grounding: float
    topic_coverage: float
    unsupported_sentence_rate: float
    ambiguous_sentence_rate: float
    invalid_locators: int
    non_exact_excerpts: int
    covered_facts: list[str]
    missing_required_facts: list[str]
    ungrounded_facts: list[str]
    missing_topics: list[str]
    unsupported_sentences: list[SentenceFinding]
    ambiguous_sentences: list[SentenceFinding]
    excerpt_findings: list[ExcerptFinding]


class StabilityScore(BaseModel):
    """Agreement between repeated runs on unchanged input, reported separately."""

    runs: int
    fact_agreement: float
    unstable_facts: list[str]
    topic_jaccard: float
    excerpt_jaccard: float
    locator_jaccard: float


class DraftFactFinding(BaseModel):
    """Where one expected drafting fact was found, if anywhere."""

    fact_id: str
    origin: str
    required: bool
    found_in: list[str]
    covered: bool


class NumberFinding(BaseModel):
    """A drafted figure absent from every input the drafter received."""

    chapter_ref: str
    number: str
    context: str


class DraftingScore(BaseModel):
    """Stage-2 coverage and figure grounding for one drafted note."""

    figures_checked: int
    required_fact_coverage: float
    unsupported_number_rate: float
    empty_chapters: list[str]
    facts: list[DraftFactFinding]
    unsupported_numbers: list[NumberFinding]


class SourceAnalysisReport(BaseModel):
    """Stage-1 runs, stability, and gate failures for one fixture."""

    runs: list[SourceAnalysisRunScore]
    stability: StabilityScore | None
    failures: list[str]


class DraftingReport(BaseModel):
    """Stage-2 score and gate failures for one fixture."""

    score: DraftingScore
    failures: list[str]


class FixtureReport(BaseModel):
    """Evaluation results for one golden fixture."""

    fixture_id: str
    source_sha256: str
    source_format: ConceptNoteSourceFormat
    source_analysis: SourceAnalysisReport | None = None
    drafting: DraftingReport | None = None

    @property
    def passed(self) -> bool:
        """Return whether every evaluated stage met its documented gates."""
        stages = [self.source_analysis, self.drafting]
        return all(not stage.failures for stage in stages if stage is not None)


class GoldenSetReport(BaseModel):
    """Complete developer-readable evaluation report without source text."""

    generated_at: str
    analysis_contract_version: str
    models: dict[str, dict[str, str | None]]
    fixtures: list[FixtureReport]

    @property
    def passed(self) -> bool:
        """Return whether every fixture passed."""
        return all(fixture.passed for fixture in self.fixtures)
