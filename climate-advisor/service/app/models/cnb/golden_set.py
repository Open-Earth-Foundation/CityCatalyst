"""Fixture, judge, and report contracts for the four-stage CNB golden set.

Stages follow the production pipeline: extraction (source analysis), chapter
writing, verification (chapter validation), and editing. Python checks exact
contracts; a model judges meaning, support, and consistency using cited text.
"""

from __future__ import annotations

from typing import Any, Literal

from app.models.cnb.concept_note_chapter_validation import (
    ChapterValidationFindingCategory,
)
from app.models.cnb.concept_note_markdown import ConceptNoteSourceFormat
from pydantic import BaseModel, ConfigDict, Field, SerializeAsAny, model_validator


class GoldenContract(BaseModel):
    """Reject unknown fields so fixture typos fail instead of being ignored."""

    model_config = ConfigDict(extra="forbid")


# --------------------------------------------------------------------------
# Fixture: source and stage-1 extraction expectations
# --------------------------------------------------------------------------


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


class ExtractionThresholds(GoldenContract):
    """Coverage gates for one semantically judged analysis."""

    min_required_fact_coverage: float = Field(default=0.75, ge=0, le=1)
    min_topic_coverage: float = Field(default=0.6, ge=0, le=1)


class ExtractionGolden(GoldenContract):
    """Stage-1 expectations for one source document."""

    facts: list[GoldenFact] = Field(min_length=1)
    topics: list[GoldenTopic] = Field(default_factory=list)
    thresholds: ExtractionThresholds = Field(default_factory=ExtractionThresholds)


# --------------------------------------------------------------------------
# Fixture: stage-2 chapter writing expectations
# --------------------------------------------------------------------------


class DraftFact(GoldenContract):
    """A fact the drafted note should carry into one of the allowed chapters.

    ``extraction_fact`` links a document fact to the stage-1 fact it depends on,
    so the report can tell extraction losses from drafting losses.
    """

    id: str = Field(min_length=1)
    statement: str = Field(min_length=1)
    origin: Literal["document", "context_bundle", "application_context"]
    required: bool = True
    chapters: list[str] = Field(default_factory=list)
    extraction_fact: str | None = None


class ExpectedGap(GoldenContract):
    """Information the application asks for that no input supplies.

    The drafter must flag it with an ``[Information needed: ...]`` marker and a
    structured gap instead of inventing a value.
    """

    id: str = Field(min_length=1)
    statement: str = Field(min_length=1)
    required: bool = True
    chapters: list[str] = Field(default_factory=list)


class ChapterWritingThresholds(GoldenContract):
    """Fact-transfer and gap-flagging gates for one judged draft."""

    min_required_fact_coverage: float = Field(default=0.7, ge=0, le=1)
    min_gap_recall: float = Field(default=0.75, ge=0, le=1)


class ChapterWritingGolden(GoldenContract):
    """Stage-2 expectations plus the application input file they draft against."""

    input: str = Field(default="drafting_input.json", min_length=1)
    facts: list[DraftFact] = Field(min_length=1)
    gaps: list[ExpectedGap] = Field(default_factory=list)
    thresholds: ChapterWritingThresholds = Field(
        default_factory=ChapterWritingThresholds
    )


class DraftingInput(GoldenContract):
    """Funder, application template, and authoritative city context for drafting.

    Each chapter's ``required_fields`` assigns the template inventory to chapters,
    as the production chapter validator requires.
    """

    run_name: str = Field(min_length=1)
    funder: str = Field(min_length=1)
    opportunity: str = Field(min_length=1)
    template_name: str = Field(min_length=1)
    chapter_schema: list[dict[str, Any]] = Field(min_length=1)
    required_fields: list[str] = Field(default_factory=list)
    cc_context: dict[str, Any] = Field(default_factory=dict)


# --------------------------------------------------------------------------
# Fixture: frozen reference draft shared by verification and editing
# --------------------------------------------------------------------------


class ReferenceGap(GoldenContract):
    """One open structured gap, in the drafter's output shape."""

    field_key: str = Field(pattern=r"^[a-z0-9]+(?:_[a-z0-9]+)*$")
    question: str = Field(min_length=1)
    why_asking: str = Field(min_length=1)
    severity: Literal["critical", "noncritical"]


class ReferenceChapter(GoldenContract):
    """One reviewed chapter body with its open gaps."""

    chapter_ref: str = Field(min_length=1)
    body_markdown: str = Field(min_length=1)
    gaps: list[ReferenceGap] = Field(default_factory=list)


class ReferenceDraft(GoldenContract):
    """A reviewed production draft frozen so later stages are isolated from drafting.

    ``selected_source`` is the reviewed extraction output (summary, topics,
    key excerpts) the draft was written from; editing cites it as source evidence.
    """

    provenance: str = Field(min_length=1)
    selected_source: dict[str, Any]
    chapters: list[ReferenceChapter] = Field(min_length=1)


class TextEdit(GoldenContract):
    """Replace one unique exact passage in a reference chapter."""

    chapter_ref: str = Field(min_length=1)
    find: str = Field(min_length=1)
    replace: str


class GapRef(GoldenContract):
    """Identify one reference gap by chapter and key."""

    chapter_ref: str = Field(min_length=1)
    field_key: str = Field(min_length=1)


class GapAddition(GoldenContract):
    """Add one open gap to a chapter, keeping markers and gaps in parity."""

    chapter_ref: str = Field(min_length=1)
    gap: ReferenceGap


DefectKind = Literal[
    "cross_chapter_conflict",
    "internal_conflict",
    "logic_error",
    "gap_inconsistency",
    "unflagged_missing_information",
]


class SeededDefect(GoldenContract):
    """A known defect injected into the reference draft for the validator to find."""

    id: str = Field(min_length=1)
    kind: DefectKind
    description: str = Field(min_length=1)
    edits: list[TextEdit] = Field(default_factory=list)
    remove_gaps: list[GapRef] = Field(default_factory=list)
    add_gaps: list[GapAddition] = Field(default_factory=list)
    expected_chapters: list[str] = Field(min_length=1)
    expected_categories: list[ChapterValidationFindingCategory] = Field(min_length=1)

    @model_validator(mode="after")
    def require_change(self) -> SeededDefect:
        """A defect must change the draft."""
        if not (self.edits or self.remove_gaps or self.add_gaps):
            raise ValueError("A seeded defect must edit text or gaps")
        return self


class VerificationThresholds(GoldenContract):
    """Detection gates for one validator run over the seeded draft."""

    min_defect_recall: float = Field(default=0.75, ge=0, le=1)
    max_false_alarm_rate: float = Field(default=0.25, ge=0, le=1)


class VerificationGolden(GoldenContract):
    """Stage-3 seeded defects applied to the reference draft."""

    reference_draft: str = Field(default="reference_draft.json", min_length=1)
    defects: list[SeededDefect] = Field(min_length=1)
    thresholds: VerificationThresholds = Field(default_factory=VerificationThresholds)


class EditExpectation(GoldenContract):
    """A semantic statement about the document after an edit."""

    id: str = Field(min_length=1)
    statement: str = Field(min_length=1)


class EditMessage(GoldenContract):
    """One earlier visible chat message."""

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1)


class EditCase(GoldenContract):
    """One chat edit request against the reference draft.

    ``allowed_chapters`` lists every chapter the edit may change; any other
    changed chapter is a collateral edit. A clarification case allows none.
    """

    id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]*$")
    instruction: str = Field(min_length=1)
    focused_chapter: str | None = None
    recent_messages: list[EditMessage] = Field(default_factory=list)
    expected_outcome: Literal["edit", "clarification"]
    allowed_chapters: list[str] = Field(default_factory=list)
    expected_changes: list[EditExpectation] = Field(default_factory=list)
    must_preserve: list[EditExpectation] = Field(default_factory=list)

    @model_validator(mode="after")
    def check_outcome(self) -> EditCase:
        """Clarifications change nothing; edits name what must change."""
        if self.expected_outcome == "clarification" and (
            self.allowed_chapters or self.expected_changes
        ):
            raise ValueError("A clarification case cannot expect changes")
        if self.expected_outcome == "edit" and not (
            self.allowed_chapters and self.expected_changes
        ):
            raise ValueError("An edit case needs allowed chapters and expected changes")
        return self


class EditingGolden(GoldenContract):
    """Stage-4 edit requests applied to the reference draft."""

    reference_draft: str = Field(default="reference_draft.json", min_length=1)
    cases: list[EditCase] = Field(min_length=1)


class OriginalPdf(GoldenContract):
    """The checked-in PDF that ``source.md`` was produced from, for reference.

    Never read by any stage; it lets reviewers compare the OCR output with the
    document. ``notes`` records any redaction applied to the public original.
    """

    path: str = Field(default="source.pdf", min_length=1)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    url: str | None = None
    notes: str | None = None


class GoldenSourceFile(GoldenContract):
    """Checked-in, non-sensitive Markdown in the same shape CC delivers to CA."""

    original_pdf: OriginalPdf | None = None
    path: str = Field(default="source.md", min_length=1)
    filename: str = Field(min_length=1)
    source_label: str = Field(min_length=1)
    source_format: ConceptNoteSourceFormat
    language: str = Field(default="en", pattern=r"^[a-z]{2}$")
    page_count: int | None = Field(default=None, ge=1)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    provenance: str = Field(min_length=1)


class GoldenFixture(GoldenContract):
    """One golden-set case: a source document and its four stage expectations."""

    fixture_id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]*$")
    description: str = Field(min_length=1)
    source: GoldenSourceFile
    extraction: ExtractionGolden
    chapter_writing: ChapterWritingGolden | None = None
    verification: VerificationGolden | None = None
    editing: EditingGolden | None = None


Stage = Literal["extraction", "chapter_writing", "verification", "editing"]
STAGES: tuple[Stage, ...] = ("extraction", "chapter_writing", "verification", "editing")
CoverageVerdict = Literal["covered", "partially_covered", "missing", "contradicted"]
SupportVerdict = Literal[
    "supported", "partially_supported", "unsupported", "contradicted", "uncertain"
]


# --------------------------------------------------------------------------
# Judge inputs
# --------------------------------------------------------------------------


class TextUnit(GoldenContract):
    """Addressable verbatim text for deterministic reference verification.

    ``draft`` units are the document a later stage started from: the seeded
    draft for verification, or the pre-edit draft for editing.
    """

    id: str
    text: str
    kind: Literal["source", "context", "supplied", "draft", "output"]
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
    """Extraction or chapter-writing payload; expectations are never evidence."""

    stage: Literal["extraction", "chapter_writing"]
    expected_facts: list[ExpectedFact]
    expected_topics: list[GoldenTopic]
    expected_gaps: list[ExpectedFact] = Field(default_factory=list)
    chapter_requirements: list[ChapterRequirement]
    outputs: list[TextUnit]
    evidence: list[TextUnit]


class DefectInput(GoldenContract):
    """A seeded defect as the verification judge sees it."""

    id: str
    kind: DefectKind
    description: str
    chapters: list[str]


class VerificationJudgeInput(GoldenContract):
    """Validator findings against the seeded draft and the original source."""

    stage: Literal["verification"] = "verification"
    defects: list[DefectInput]
    outputs: list[TextUnit]
    evidence: list[TextUnit]


class EditCaseInput(GoldenContract):
    """One edit request, what the pipeline did, and what should hold afterwards."""

    id: str
    instruction: str
    expected_outcome: Literal["edit", "clarification"]
    observed_outcome: str
    clarification: str | None = None
    expected_changes: list[EditExpectation]
    must_preserve: list[EditExpectation]


class EditingJudgeInput(GoldenContract):
    """Edit outcomes with before/after text, the reference draft, and the source."""

    stage: Literal["editing"] = "editing"
    cases: list[EditCaseInput]
    outputs: list[TextUnit]
    evidence: list[TextUnit]


# --------------------------------------------------------------------------
# Judge outputs
# --------------------------------------------------------------------------


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
    """Structured extraction judgments, validated before any metrics are trusted."""

    facts: list[CoverageJudgment]
    topics: list[CoverageJudgment]
    claims: list[ClaimJudgment]
    chapters: list[ChapterJudgment]
    contradictions: list[ContradictionJudgment]


class GapJudgment(GoldenContract):
    """Whether one expected gap was flagged instead of filled with an invented value."""

    id: str
    verdict: Literal["flagged", "partially_flagged", "not_flagged", "fabricated"]
    output_refs: list[TextReference]
    reason: str = Field(min_length=1, max_length=1200)


class FlaggedGapJudgment(GoldenContract):
    """Whether one gap the drafter raised is genuine, actionable, and consistent."""

    unit_id: str
    verdict: Literal["valid", "answerable_from_inputs", "answered_elsewhere", "unclear"]
    evidence: list[TextReference]
    reason: str = Field(min_length=1, max_length=1200)


class ChapterWritingEvaluation(JudgeEvaluation):
    """Extraction judgments plus missing-information assessments for drafts."""

    gaps: list[GapJudgment]
    flagged_gaps: list[FlaggedGapJudgment]


class DefectJudgment(GoldenContract):
    """Whether validator findings identify one seeded defect."""

    id: str
    verdict: Literal["detected", "partially_detected", "missed"]
    finding_refs: list[TextReference]
    reason: str = Field(min_length=1, max_length=1200)


class FindingJudgment(GoldenContract):
    """Whether one validator finding that matches no seeded defect is genuine."""

    unit_id: str
    verdict: Literal["valid", "false_alarm", "duplicate"]
    evidence: list[TextReference]
    reason: str = Field(min_length=1, max_length=1200)


class VerificationEvaluation(GoldenContract):
    """Seeded-defect recall and finding precision judgments."""

    defects: list[DefectJudgment]
    findings: list[FindingJudgment]


class ExpectationJudgment(GoldenContract):
    """Whether one expected change happened."""

    id: str
    verdict: Literal["applied", "partially_applied", "not_applied", "contradicted"]
    output_refs: list[TextReference]
    reason: str = Field(min_length=1, max_length=1200)


class PreservationJudgment(GoldenContract):
    """Whether one statement that must survive the edit still holds."""

    id: str
    verdict: Literal["preserved", "altered", "removed"]
    output_refs: list[TextReference]
    reason: str = Field(min_length=1, max_length=1200)


class ChangeJudgment(GoldenContract):
    """Whether one applied change is authorized by the instruction or evidence."""

    unit_id: str
    verdict: Literal["supported", "unsupported", "contradicts_source", "out_of_scope"]
    evidence: list[TextReference]
    reason: str = Field(min_length=1, max_length=1200)


class EditCaseJudgment(GoldenContract):
    """All judgments for one edit case."""

    case_id: str
    expected_changes: list[ExpectationJudgment]
    preserved: list[PreservationJudgment]
    changes: list[ChangeJudgment]
    contradictions: list[ContradictionJudgment]


class EditingEvaluation(GoldenContract):
    """Edit fidelity, preservation, and post-edit consistency judgments."""

    cases: list[EditCaseJudgment]


# --------------------------------------------------------------------------
# Reports
# --------------------------------------------------------------------------


class StageReport(GoldenContract):
    """Separate product failures from invalid or unavailable evaluation results.

    ``details`` carries deterministic stage artefacts (transfer table, marker
    parity, validator findings, edit outcomes) for review.
    """

    metrics: dict[str, float] = Field(default_factory=dict)
    integrity_failures: list[str] = Field(default_factory=list)
    semantic_failures: list[str] = Field(default_factory=list)
    evaluation_errors: list[str] = Field(default_factory=list)
    details: dict[str, Any] = Field(default_factory=dict)
    judgment: SerializeAsAny[GoldenContract] | None = None

    @property
    def passed(self) -> bool:
        """An unavailable judgment can never produce a passing stage."""
        return self.judgment is not None and not (
            self.integrity_failures or self.semantic_failures or self.evaluation_errors
        )


class AgentUsage(GoldenContract):
    """Model requests one agent made: count, tokens, provider cost, and time.

    ``cost_usd`` is what OpenRouter reports per response, including the
    provider's charge for bring-your-own-key requests. ``request_seconds`` sums
    request durations, so concurrent requests can exceed the stage's wall time.
    """

    requests: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    reasoning_tokens: int = 0
    cost_usd: float = 0.0
    request_seconds: float = 0.0


class StageUsage(AgentUsage):
    """Wall time of one fixture stage and its model usage, overall and per agent.

    ``agents`` is keyed by the configured prompt that sent each request (for
    example ``cnb_chapter_drafting``), or ``other``.
    """

    seconds: float = 0.0
    agents: dict[str, AgentUsage] = Field(default_factory=dict)


class FixtureReport(GoldenContract):
    """Single-pass results for the enabled stages of one fixture."""

    fixture_id: str
    source_sha256: str
    source_format: ConceptNoteSourceFormat
    extraction: StageReport | None = None
    chapter_writing: StageReport | None = None
    verification: StageReport | None = None
    editing: StageReport | None = None
    usage: dict[str, StageUsage] = Field(default_factory=dict)

    @property
    def passed(self) -> bool:
        """Require at least one evaluated stage and no stage failures."""
        stages = [getattr(self, stage) for stage in STAGES if getattr(self, stage)]
        return bool(stages) and all(stage.passed for stage in stages)


class GoldenSetReport(GoldenContract):
    """Evaluation provenance and results; contains no complete source documents.

    ``run_id`` names the run folder, ``label`` is an optional human note, and
    ``code_version`` is the git commit (with ``-dirty`` for local changes) so
    runs can be compared.
    """

    run_id: str | None = None
    label: str | None = None
    code_version: str | None = None
    # Elapsed time of the whole run; fixtures may have run concurrently.
    wall_seconds: float | None = None
    generated_at: str
    analysis_contract_version: str
    judge_prompt_versions: dict[str, str]
    models: dict[str, dict[str, str | None]]
    fixtures: list[FixtureReport]

    @property
    def passed(self) -> bool:
        """Require evaluated fixtures and successful results for every one."""
        return bool(self.fixtures) and all(fixture.passed for fixture in self.fixtures)
