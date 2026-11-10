"""Fixture, judge, and report contracts for the four-stage CNB golden set.

Stages follow the production pipeline: extraction (source analysis), chapter
writing, verification (chapter validation), and editing. Python checks exact
contracts; a model judges meaning, support, and consistency using cited text.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Literal

from app.models.cnb.concept_note_chapter_validation import (
    ChapterValidationFindingCategory,
)
from app.models.cnb.concept_note_markdown import ConceptNoteSourceFormat
from pydantic import BaseModel, ConfigDict, Field, SerializeAsAny, model_validator

from benchmark.utils.models import StageUsage


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


class FactRequirement(GoldenContract):
    """One receiving chapter's priority for a source fact."""

    chapter_ref: str = Field(pattern=r"^[a-zA-Z0-9_-]+$")
    priority: Literal["mandatory", "desirable"]


class GoldenFact(GoldenContract):
    """A fact retained source quotations should preserve, with exact evidence."""

    id: str = Field(pattern=r"^[a-zA-Z0-9_-]+$")
    statement: str = Field(min_length=1)
    requirements: list[FactRequirement] = Field(min_length=1)
    evidence: list[GoldenEvidence] = Field(min_length=1)

    @model_validator(mode="after")
    def unique_chapters(self) -> GoldenFact:
        """A chapter-fact pair has exactly one priority."""
        refs = [item.chapter_ref for item in self.requirements]
        if len(refs) != len(set(refs)):
            raise ValueError("Duplicate receiving chapter for a fact")
        return self


class GoldenTopic(GoldenContract):
    """A topic the analysis should convey, regardless of wording."""

    id: str = Field(min_length=1)
    statement: str = Field(min_length=1)


class ExtractionThresholds(GoldenContract):
    """Coverage gates for one semantically judged analysis."""

    min_topic_coverage: float = Field(default=0.6, ge=0, le=1)


class ExtractionGolden(GoldenContract):
    """Stage-1 expectations for one source document."""

    facts: list[GoldenFact] = Field(min_length=1)
    topics: list[GoldenTopic] = Field(default_factory=list)
    thresholds: ExtractionThresholds = Field(default_factory=ExtractionThresholds)

    @model_validator(mode="after")
    def unique_fact_ids(self) -> ExtractionGolden:
        """Fact identities must remain unambiguous when expanded by chapter."""
        ids = [fact.id for fact in self.facts]
        if len(ids) != len(set(ids)):
            raise ValueError("Duplicate extraction fact ID")
        return self


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
    """The pinned PDF used for fresh conversion and source review.

    ``notes`` records any redaction applied to the public original; conversion
    always uses these local bytes rather than downloading the original URL.
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


class GroundTruthApproval(GoldenContract):
    """Human review of the exact source, template, and requirement policy."""

    status: Literal["draft", "pending", "approved"] = "draft"
    reviewer: str | None = Field(default=None, min_length=1)
    reviewed_at: date | None = None
    source_sha256: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")
    original_pdf_sha256: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")
    template_sha256: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")
    requirements_sha256: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")

    @model_validator(mode="after")
    def approved_metadata(self) -> GroundTruthApproval:
        """An approval claim requires attributable, fingerprinted human review."""
        if self.status == "approved" and not (
            self.reviewer and self.reviewer.strip() and self.reviewed_at
            and self.source_sha256 and self.template_sha256 and self.requirements_sha256
        ):
            raise ValueError("Approved ground truth requires reviewer, date, and fingerprints")
        if self.status == "approved" and self.reviewed_at > date.today():
            raise ValueError("Ground truth review date cannot be in the future")
        return self


class GoldenFixture(GoldenContract):
    """One golden-set case: a source document and its four stage expectations."""

    fixture_id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]*$")
    description: str = Field(min_length=1)
    source: GoldenSourceFile
    approval: GroundTruthApproval = Field(default_factory=GroundTruthApproval)
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
    # Extraction uses one pair per receiving chapter; drafting remains aggregate.
    fact_id: str | None = None
    chapter_ref: str | None = None


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


class FixtureReport(GoldenContract):
    """Single-pass results for the enabled stages of one fixture."""

    fixture_id: str
    source_sha256: str
    source_format: ConceptNoteSourceFormat
    approval_status: Literal["pending", "approved", "stale"] = "pending"
    approval_errors: list[str] = Field(default_factory=list)
    extraction: StageReport | None = None
    chapter_writing: StageReport | None = None
    verification: StageReport | None = None
    editing: StageReport | None = None
    usage: dict[str, StageUsage] = Field(default_factory=dict)
    input_provenance: dict[str, Any] = Field(default_factory=dict)
    inapplicable_reason: str | None = None

    @property
    def passed(self) -> bool:
        """Require current approved ground truth and successful evaluated stages."""
        if self.inapplicable_reason:
            return True
        stages = [getattr(self, stage) for stage in STAGES if getattr(self, stage)]
        return (
            self.approval_status == "approved" and not self.approval_errors
            and bool(stages) and all(stage.passed for stage in stages)
        )


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
    requested_stages: list[str] = Field(default_factory=list)
    expected_fixture_ids: list[str] = Field(default_factory=list)
    input_path: Literal["markdown", "pdf"] = "markdown"
    corpus_fingerprint: str | None = None
    evaluator_fingerprint: str | None = None
    completed: bool = True
    run_errors: list[str] = Field(default_factory=list)

    @property
    def passed(self) -> bool:
        """Require evaluated fixtures and successful results for every one."""
        return (
            not self.evaluation_unavailable
            and all(fixture.passed for fixture in self.fixtures)
        )

    @property
    def quality_failures(self) -> bool:
        """Preserve quality findings even when another stage is unavailable."""
        return any(
            stage.integrity_failures or stage.semantic_failures
            for fixture in self.fixtures
            for name in STAGES
            if (stage := getattr(fixture, name)) is not None
        )

    @property
    def evaluation_unavailable(self) -> bool:
        """An incomplete run or missing judgment is distinct from bad quality."""
        if not self.completed or self.run_errors or not self.fixtures:
            return True
        if set(self.expected_fixture_ids) - {f.fixture_id for f in self.fixtures}:
            return True
        applicable = [f for f in self.fixtures if not f.inapplicable_reason]
        if not applicable:
            return True
        for fixture in applicable:
            if fixture.approval_status != "approved" or fixture.approval_errors:
                return True
            names = self.requested_stages or [s for s in STAGES if getattr(fixture, s)]
            for name in names:
                stage = getattr(fixture, name)
                if stage is None or stage.judgment is None or stage.evaluation_errors:
                    return True
        return False
