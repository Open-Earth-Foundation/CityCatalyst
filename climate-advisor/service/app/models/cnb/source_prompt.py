"""Identifier-free model contracts; backend source locators never leave the reader."""

from pydantic import BaseModel, ConfigDict, Field


class DocumentMappingReading(BaseModel):
    """One partition's summary, topics and exact quotations; the backend locates each quote."""

    model_config = ConfigDict(extra="forbid")
    summary: str = Field(min_length=1, max_length=3000)
    topics: list[str] = Field(default_factory=list, max_length=30)
    excerpts: list[str] = Field(default_factory=list, max_length=60)


class QuestionReading(BaseModel):
    """Exact quotations answering one question; the backend locates each quote."""

    model_config = ConfigDict(extra="forbid")
    excerpts: list[str] = Field(default_factory=list, max_length=60)
    caveats: list[str] = Field(default_factory=list, max_length=10)


class ChapterTaggedExcerpt(BaseModel):
    """An exact quotation and the template chapters whose requirements it serves."""

    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=4000)
    chapter_refs: list[str] = Field(min_length=1, max_length=50)


class ChapterEvidenceSection(BaseModel):
    """Quotations found while reviewing one section; the entry's position is never used."""

    model_config = ConfigDict(extra="forbid")
    excerpts: list[ChapterTaggedExcerpt] = Field(default_factory=list, max_length=100)


class ChapterEvidenceReading(BaseModel):
    """A section-by-section checklist of chapter-tagged quotations; the backend locates each quote."""

    model_config = ConfigDict(extra="forbid")
    sections: list[ChapterEvidenceSection]


class ReadableExcerpt(BaseModel):
    """An exact quotation; the backend finds its location in the source."""

    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=4000)


class ChapterExcerptChoice(BaseModel):
    """The quotations chosen for one template chapter."""

    model_config = ConfigDict(extra="forbid")
    chapter_ref: str = Field(min_length=1, max_length=255)
    excerpts: list[ReadableExcerpt] = Field(default_factory=list, max_length=300)


class ChapterEvidenceSelection(BaseModel):
    """Prioritized quotation choices for chapters over their token budget."""

    model_config = ConfigDict(extra="forbid")
    chapters: list[ChapterExcerptChoice] = Field(default_factory=list, max_length=100)


class DocumentSummary(BaseModel):
    """A source summary without backend coverage keys or fingerprint locators."""

    model_config = ConfigDict(extra="forbid")
    summary: str = Field(min_length=1, max_length=4000)
    topics: list[str] = Field(default_factory=list, max_length=30)
    key_excerpts: list[ReadableExcerpt] = Field(default_factory=list, max_length=20)
