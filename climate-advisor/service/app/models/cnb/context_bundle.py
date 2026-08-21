"""Typed contracts for PDF-first Concept Note context bundles."""

from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ContextBundleContract(BaseModel):
    """Base contract that rejects undocumented model output fields."""

    model_config = ConfigDict(extra="forbid")


class SourceExcerpt(ContextBundleContract):
    """Exact source text with a one-based page citation."""

    text: str = Field(min_length=1, max_length=4000)
    page: int = Field(ge=1)


class SelectedSource(ContextBundleContract):
    """Compact, persisted summary of one ready city PDF."""

    upload_id: UUID
    source_label: str
    filename: str
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    page_count: int = Field(ge=1)
    summary: str = Field(min_length=1, max_length=4000)
    topics: list[str] = Field(max_length=30)
    key_excerpts: list[SourceExcerpt] = Field(max_length=20)


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
    """Reader output for one complete page-preserving partition."""

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
    excerpts: list[SourceExcerpt] = Field(default_factory=list, max_length=20)
    pages_processed: int = Field(ge=1)
    pages_total: int = Field(ge=1)
    segments_processed: int = Field(ge=1)
    segments_total: int = Field(ge=1)
    caveats: list[str] = Field(default_factory=list, max_length=10)


class ContextBundleRetryResponse(ContextBundleContract):
    """Accepted response for a scoped background bundle rebuild."""

    run_id: UUID
    status: Literal["queued"]
