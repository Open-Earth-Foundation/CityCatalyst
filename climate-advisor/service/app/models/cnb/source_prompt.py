"""Identifier-free model contracts; backend source locators never leave the reader."""

from pydantic import BaseModel, ConfigDict, Field


class SectionEvidence(BaseModel):
    """Evidence for the section at the same position in the input array."""

    model_config = ConfigDict(extra="forbid")
    excerpts: list[str] = Field(default_factory=list, max_length=20)
    caveats: list[str] = Field(default_factory=list, max_length=10)


class DocumentMappingReading(BaseModel):
    """One mapping result with an entry for every supplied section, in order."""

    model_config = ConfigDict(extra="forbid")
    summary: str = Field(min_length=1, max_length=3000)
    topics: list[str] = Field(default_factory=list, max_length=30)
    sections: list[SectionEvidence]


class QuestionReading(BaseModel):
    """Question evidence aligned to every supplied section, including empty ones."""

    model_config = ConfigDict(extra="forbid")
    sections: list[SectionEvidence]


class ReadableExcerpt(BaseModel):
    """An exact quotation with a human-readable document location."""

    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=4000)
    page: int | None = Field(default=None, ge=1)
    heading: str | None = None


class DocumentSummary(BaseModel):
    """A source summary without backend coverage keys or fingerprint locators."""

    model_config = ConfigDict(extra="forbid")
    summary: str = Field(min_length=1, max_length=4000)
    topics: list[str] = Field(default_factory=list, max_length=30)
    key_excerpts: list[ReadableExcerpt] = Field(default_factory=list, max_length=20)
