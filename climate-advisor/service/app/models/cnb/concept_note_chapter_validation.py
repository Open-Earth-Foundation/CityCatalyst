"""Contracts for two-pass Concept Note chapter validation."""

from __future__ import annotations

from typing import Annotated, ClassVar, Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

ChapterValidationStatus = Literal["ready", "needs_review", "incomplete"]
ChapterValidationPhase = Literal["completeness", "consistency", "evidence"]
ChapterValidationSeverity = Literal["warning", "blocking"]
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


class ChapterValidationFindingDraft(BaseModel):
    """Concise actionable finding returned by a validation pass."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    category: ChapterValidationFindingCategory
    severity: ChapterValidationSeverity
    message: ConciseText
    suggested_action: ConciseText
    involved_chapter_ids: list[UUID] = Field(min_length=1, max_length=10)
    excerpts: list[ExcerptText] = Field(default_factory=list, max_length=3)


class _ChapterValidationOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    allowed_categories: ClassVar[set[ChapterValidationFindingCategory]]
    findings: list[ChapterValidationFindingDraft] = Field(
        default_factory=list,
        max_length=50,
    )

    @model_validator(mode="after")
    def validate_categories(self) -> Self:
        if any(
            finding.category not in self.allowed_categories for finding in self.findings
        ):
            raise ValueError("validation output contains an out-of-scope finding")
        return self


class ChapterCompletenessValidationOutput(_ChapterValidationOutput):
    """Missing-information and evidence findings from the first pass."""

    allowed_categories = {
        "missing_information",
        "template_constraint",
        "unresolved_gap",
        "evidence",
    }


class ChapterConsistencyValidationOutput(_ChapterValidationOutput):
    """Logic and contradiction findings from the second pass."""

    allowed_categories = {
        "internal_conflict",
        "cross_chapter_conflict",
        "logic_error",
    }


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
    findings: list[ChapterValidationFinding] = Field(default_factory=list)
