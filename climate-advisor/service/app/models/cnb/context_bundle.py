"""Typed contracts for source-aware Concept Note context bundles."""

from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

from app.models.concept_note_markdown import ConceptNoteSourceFormat
from pydantic import BaseModel, ConfigDict, Field, model_validator


class ContextBundleContract(BaseModel):
    """Base contract that rejects undocumented model output fields."""

    model_config = ConfigDict(extra="forbid")


class SourceExcerpt(ContextBundleContract):
    """Exact source text with one PDF page or native Markdown block anchor."""

    text: str = Field(min_length=1, max_length=4000)
    page: int | None = Field(default=None, ge=1)
    anchor: str | None = Field(default=None, min_length=1, max_length=255)

    @model_validator(mode="after")
    def validate_locator(self) -> SourceExcerpt:
        """Require exactly one source locator for every excerpt."""
        if (self.page is None) == (self.anchor is None):
            raise ValueError("Source excerpts require exactly one page or anchor")
        return self


class SelectedSource(ContextBundleContract):
    """Compact, persisted summary of one ready city source."""

    upload_id: UUID
    source_label: str
    filename: str
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    source_format: ConceptNoteSourceFormat = "pdf"
    page_count: int | None = Field(default=None, ge=1)
    block_count: int | None = Field(default=None, ge=1)
    summary: str = Field(min_length=1, max_length=4000)
    topics: list[str] = Field(max_length=30)
    key_excerpts: list[SourceExcerpt] = Field(max_length=20)

    @model_validator(mode="after")
    def validate_source_counts(self) -> SelectedSource:
        """Keep PDF page counts separate from Markdown block counts."""
        if self.source_format == "pdf":
            if self.page_count is None or self.block_count is not None:
                raise ValueError("PDF sources require only page_count")
        elif self.block_count is None or self.page_count is not None:
            raise ValueError("Markdown sources require only block_count")
        return self


class BundleCcContext(BaseModel):
    """CityCatalyst-owned sections with explicit nullable absence."""

    model_config = ConfigDict(extra="allow")

    city: dict[str, Any] | None = None
    project: dict[str, Any] | None = None
    ghgi: dict[str, Any] | None = None
    ccra: dict[str, Any] | None = None
    hiap: dict[str, Any] | None = None


class ConceptNoteContextBundle(BaseModel):
    """Complete bundle skeleton while allowing later workflows to add sections."""

    model_config = ConfigDict(extra="allow")

    selected_sources: list[SelectedSource] = Field(default_factory=list)
    cc_context: BundleCcContext = Field(default_factory=BundleCcContext)
    funder_context: dict[str, Any] | None = None
    similar_projects: list[dict[str, Any]] = Field(default_factory=list)
    document_context: dict[str, Any] | None = None


class SourcePartitionMap(ContextBundleContract):
    """Reader output for one complete source-preserving partition."""

    summary: str = Field(min_length=1, max_length=3000)
    topics: list[str] = Field(max_length=30)
    excerpts: list[SourceExcerpt] = Field(max_length=20)
    covered_segment_ids: list[str] = Field(min_length=1)


class SourceDocumentSynthesis(ContextBundleContract):
    """Final compact document summary assembled from every partition."""

    summary: str = Field(min_length=1, max_length=4000)
    topics: list[str] = Field(max_length=30)
    key_excerpts: list[SourceExcerpt] = Field(max_length=20)


class SourceQuestionReading(ContextBundleContract):
    """Question-focused evidence returned for one partition."""

    excerpts: list[SourceExcerpt] = Field(max_length=20)
    caveats: list[str] = Field(default_factory=list, max_length=10)
    covered_segment_ids: list[str] = Field(min_length=1)


class SourceQueryResult(ContextBundleContract):
    """Verified evidence payload returned by concept_note.sources.query."""

    found: bool
    upload_id: UUID
    source_label: str
    source_format: ConceptNoteSourceFormat
    excerpts: list[SourceExcerpt] = Field(default_factory=list, max_length=20)
    units_processed: int = Field(ge=1)
    units_total: int = Field(ge=1)
    segments_processed: int = Field(ge=1)
    segments_total: int = Field(ge=1)
    caveats: list[str] = Field(default_factory=list, max_length=10)


class ContextBundleRetryResponse(ContextBundleContract):
    """Accepted response for a scoped background bundle rebuild."""

    run_id: UUID
    status: Literal["queued"]
