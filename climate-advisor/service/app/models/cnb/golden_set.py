"""Fixture, judge, and report contracts for single-pass CNB evaluation.

Python checks source integrity and judge references. A model judges semantic
coverage, claim support, clarity, and chapter requirements using cited evidence.
"""

from __future__ import annotations

from typing import Any, Literal

from app.models.cnb.concept_note_markdown import ConceptNoteSourceFormat
from pydantic import BaseModel, ConfigDict, Field, model_validator


class GoldenContract(BaseModel):
    """Reject unknown fields so fixture typos fail instead of being ignored."""

    model_config = ConfigDict(extra="forbid")


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
    """A fact retained source quotations should preserve, with exact evidence."""

    id: str = Field(min_length=1)
    statement: str = Field(min_length=1)
    required: bool = True
    evidence: list[GoldenEvidence] = Field(min_length=1)


class GoldenTopic(GoldenContract):
    """A topic the analysis should convey, regardless of wording."""

    id: str = Field(min_length=1)
    statement: str = Field(min_length=1)


class SourceAnalysisThresholds(GoldenContract):
    """Coverage gates for one semantically judged analysis."""

    min_required_fact_coverage: float = Field(default=0.75, ge=0, le=1)
    min_topic_coverage: float = Field(default=0.6, ge=0, le=1)


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


class DraftingThresholds(GoldenContract):
    """Fact coverage gate for one semantically judged draft."""

    min_required_fact_coverage: float = Field(default=0.7, ge=0, le=1)


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


Stage = Literal["source_analysis", "drafting", "end_to_end"]
CoverageVerdict = Literal["covered", "partially_covered", "missing", "contradicted"]
SupportVerdict = Literal[
    "supported", "partially_supported", "unsupported", "contradicted", "uncertain"
]


class TextUnit(GoldenContract):
    """Addressable verbatim text for deterministic reference verification."""

    id: str
    text: str
    kind: Literal["source", "context", "supplied", "output"]
    chapter_ref: str | None = None


class ExpectedFact(GoldenContract):
    """Meaning to preserve, with optional allowed output chapters."""

    id: str
    statement: str
    required: bool
    chapters: list[str]


class ChapterRequirement(GoldenContract):
    """Application requirement evaluated against one output chapter."""

    chapter_ref: str
    title: str
    description: str
    required: bool


class JudgeInput(GoldenContract):
    """Exact judge payload; expectations are targets, never factual evidence."""

    stage: Stage
    expected_facts: list[ExpectedFact]
    expected_topics: list[GoldenTopic]
    chapter_requirements: list[ChapterRequirement]
    outputs: list[TextUnit]
    evidence: list[TextUnit]


class TextReference(GoldenContract):
    """A verbatim span in a declared input or output unit."""

    unit_id: str
    quote: str = Field(min_length=1)


class CoverageJudgment(GoldenContract):
    """One expected fact or topic and the output passages expressing it."""

    id: str
    verdict: CoverageVerdict
    output_refs: list[TextReference]
    reason: str = Field(min_length=1, max_length=1200)


class ClaimJudgment(GoldenContract):
    """A substantive output claim checked against truth and supplied evidence."""

    output: TextReference
    verdict: SupportVerdict
    evidence: list[TextReference]
    supplied_verdict: SupportVerdict | None
    supplied_evidence: list[TextReference]
    self_contained: bool
    reason: str = Field(min_length=1, max_length=1200)


class ChapterJudgment(GoldenContract):
    """Whether a chapter answers its question without fabricating missing inputs."""

    chapter_ref: str
    verdict: Literal["satisfied", "partially_satisfied", "not_satisfied"]
    output_refs: list[TextReference]
    reason: str = Field(min_length=1, max_length=1200)


class ContradictionJudgment(GoldenContract):
    """Two or more output passages making incompatible statements."""

    output_refs: list[TextReference] = Field(min_length=2)
    reason: str = Field(min_length=1, max_length=1200)


class JudgeEvaluation(GoldenContract):
    """Structured semantic judgments, validated before any metrics are trusted."""

    facts: list[CoverageJudgment]
    topics: list[CoverageJudgment]
    claims: list[ClaimJudgment]
    chapters: list[ChapterJudgment]
    contradictions: list[ContradictionJudgment]


class StageReport(GoldenContract):
    """Separate product failures from invalid or unavailable evaluation results."""

    metrics: dict[str, float] = Field(default_factory=dict)
    integrity_failures: list[str] = Field(default_factory=list)
    semantic_failures: list[str] = Field(default_factory=list)
    evaluation_errors: list[str] = Field(default_factory=list)
    judgment: JudgeEvaluation | None = None

    @property
    def passed(self) -> bool:
        """An unavailable judgment can never produce a passing stage."""
        return self.judgment is not None and not (
            self.integrity_failures or self.semantic_failures or self.evaluation_errors
        )


class FixtureReport(GoldenContract):
    """Single-pass results for the enabled stages of one fixture."""

    fixture_id: str
    source_sha256: str
    source_format: ConceptNoteSourceFormat
    source_analysis: StageReport | None = None
    drafting: StageReport | None = None
    end_to_end: StageReport | None = None

    @property
    def passed(self) -> bool:
        """Require at least one evaluated stage and no stage failures."""
        stages = [
            s for s in (self.source_analysis, self.drafting, self.end_to_end) if s
        ]
        return bool(stages) and all(stage.passed for stage in stages)


class GoldenSetReport(GoldenContract):
    """Evaluation provenance and results; contains no complete source documents."""

    generated_at: str
    analysis_contract_version: str
    judge_prompt_versions: dict[str, str]
    models: dict[str, dict[str, str | None]]
    fixtures: list[FixtureReport]

    @property
    def passed(self) -> bool:
        """Require evaluated fixtures and successful results for every one."""
        return bool(self.fixtures) and all(fixture.passed for fixture in self.fixtures)
