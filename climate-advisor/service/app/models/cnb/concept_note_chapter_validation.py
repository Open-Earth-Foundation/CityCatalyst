"""Contracts for two-pass Concept Note chapter validation."""

from __future__ import annotations

from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

ChapterValidationStatus = Literal["ready", "needs_review", "incomplete"]
ChapterValidationCheckStatus = Literal["pass", "warning", "fail"]
ChapterValidationPhase = Literal["completeness", "consistency", "evidence"]
ChapterValidationSeverity = Literal["warning", "blocking"]
ChapterValidationCheckKey = Literal[
    "required_content",
    "template_constraints",
    "blocking_gaps",
    "evidence_citations",
    "internal_consistency",
    "cross_chapter_consistency",
]
ChapterValidationFindingCategory = Literal[
    "missing_information",
    "template_constraint",
    "unresolved_gap",
    "evidence",
    "internal_conflict",
    "cross_chapter_conflict",
    "logic_error",
]

ConciseText = Annotated[str, Field(min_length=1, max_length=1_000)]
ExcerptText = Annotated[str, Field(min_length=1, max_length=500)]


class ChapterValidationChapter(BaseModel):
    """One active chapter supplied by the workspace repository."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    chapter_id: UUID
    template_section_id: str | None = None
    title: str = Field(min_length=1, max_length=500)
    position: int = Field(ge=0)
    required: bool
    body_markdown: str | None = None
    revision_number: int | None = Field(default=None, ge=1)


class ChapterValidationTemplate(BaseModel):
    """Application-template context used by the completeness pass."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    template_id: UUID
    name: str = Field(min_length=1, max_length=500)
    output_format: str | None = None
    chapter_schema: list[dict[str, object]] = Field(default_factory=list)
    required_fields: list[str] = Field(default_factory=list)


class ChapterValidationGap(BaseModel):
    """One open workspace gap relevant to the target chapter."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    severity: str = Field(min_length=1, max_length=100)
    reason: str = Field(min_length=1, max_length=2_000)
    field_key: str | None = Field(default=None, max_length=255)


class ChapterValidationEvidenceLink(BaseModel):
    """Persisted evidence metadata available for target-chapter claims."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    selected_source_label: str = Field(min_length=1, max_length=1_000)
    source_location: str | None = Field(default=None, max_length=2_000)
    claim_ref: str | None = Field(default=None, max_length=1_000)
    quote_or_summary: str | None = Field(default=None, max_length=4_000)


class ChapterValidationRequest(BaseModel):
    """Repository-facing immutable inputs for one explicit validation attempt."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    target_chapter_id: UUID
    validation_input_fingerprint: str = Field(pattern=r"^[0-9a-f]{64}$")
    chapters: list[ChapterValidationChapter] = Field(min_length=1)
    template: ChapterValidationTemplate | None = None
    open_gaps: list[ChapterValidationGap] = Field(default_factory=list)
    evidence_links: list[ChapterValidationEvidenceLink] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_chapter_identity(self) -> Self:
        """Require one unique target inside the active document snapshot."""
        chapter_ids = [chapter.chapter_id for chapter in self.chapters]
        if len(chapter_ids) != len(set(chapter_ids)):
            raise ValueError("chapters must contain unique chapter_id values")
        if self.target_chapter_id not in chapter_ids:
            raise ValueError("target_chapter_id must identify an active chapter")
        return self


class ChapterValidationPassCheck(BaseModel):
    """Compact check returned by one LLM validation pass."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    key: ChapterValidationCheckKey
    status: ChapterValidationCheckStatus
    message: ConciseText | None = None


class ChapterValidationFindingDraft(BaseModel):
    """Concise actionable finding returned by a validation pass."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    category: ChapterValidationFindingCategory
    severity: ChapterValidationSeverity
    message: ConciseText
    suggested_action: ConciseText
    involved_chapter_ids: list[UUID] = Field(min_length=1, max_length=10)
    excerpts: list[ExcerptText] = Field(default_factory=list, max_length=3)


class ChapterCompletenessValidationOutput(BaseModel):
    """Structured output of the missing-information-first LLM pass."""

    model_config = ConfigDict(extra="forbid")

    checks: list[ChapterValidationPassCheck] = Field(min_length=3, max_length=3)
    findings: list[ChapterValidationFindingDraft] = Field(
        default_factory=list,
        max_length=50,
    )

    @model_validator(mode="after")
    def validate_completeness_contract(self) -> Self:
        """Keep pass one limited to completeness and evidence concerns."""
        _require_check_keys(
            self.checks,
            {"required_content", "template_constraints", "evidence_citations"},
        )
        allowed_categories = {
            "missing_information",
            "template_constraint",
            "unresolved_gap",
            "evidence",
        }
        if any(finding.category not in allowed_categories for finding in self.findings):
            raise ValueError("completeness output contains a consistency finding")
        return self


class ChapterConsistencyValidationOutput(BaseModel):
    """Structured output of one target-versus-document LLM pass."""

    model_config = ConfigDict(extra="forbid")

    checks: list[ChapterValidationPassCheck] = Field(min_length=2, max_length=2)
    findings: list[ChapterValidationFindingDraft] = Field(
        default_factory=list,
        max_length=50,
    )

    @model_validator(mode="after")
    def validate_consistency_contract(self) -> Self:
        """Keep pass two limited to logic and contradiction findings."""
        _require_check_keys(
            self.checks,
            {"internal_consistency", "cross_chapter_consistency"},
        )
        allowed_categories = {
            "internal_conflict",
            "cross_chapter_conflict",
            "logic_error",
        }
        if any(finding.category not in allowed_categories for finding in self.findings):
            raise ValueError("consistency output contains a completeness finding")
        return self


class ChapterValidationCheck(BaseModel):
    """Stable public check contract persisted and exposed to the frontend."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    key: ChapterValidationCheckKey
    label: str = Field(min_length=1, max_length=200)
    status: ChapterValidationCheckStatus
    message: ConciseText | None = None


class ChapterValidationFinding(BaseModel):
    """Stable public finding contract persisted and exposed to the frontend."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    phase: ChapterValidationPhase
    category: ChapterValidationFindingCategory
    severity: ChapterValidationSeverity
    message: ConciseText
    suggested_action: ConciseText
    involved_chapter_ids: list[UUID] = Field(min_length=1, max_length=10)
    excerpts: list[ExcerptText] = Field(default_factory=list, max_length=3)


class ChapterValidationDecision(BaseModel):
    """Persistence-ready result produced only after both validation passes."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    target_chapter_id: UUID
    validated_revision_number: int | None = Field(default=None, ge=1)
    validation_input_fingerprint: str = Field(pattern=r"^[0-9a-f]{64}$")
    status: ChapterValidationStatus
    checks: list[ChapterValidationCheck] = Field(min_length=6, max_length=6)
    findings: list[ChapterValidationFinding] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_final_check_set(self) -> Self:
        """Guarantee the public result always contains all fixed checks once."""
        _require_check_keys(
            self.checks,
            {
                "required_content",
                "template_constraints",
                "blocking_gaps",
                "evidence_citations",
                "internal_consistency",
                "cross_chapter_consistency",
            },
        )
        return self


def _require_check_keys(
    checks: list[ChapterValidationPassCheck] | list[ChapterValidationCheck],
    expected: set[str],
) -> None:
    """Reject missing, duplicate, or out-of-scope fixed checks."""
    actual = [check.key for check in checks]
    if len(actual) != len(set(actual)) or set(actual) != expected:
        raise ValueError(f"checks must contain exactly: {sorted(expected)}")
