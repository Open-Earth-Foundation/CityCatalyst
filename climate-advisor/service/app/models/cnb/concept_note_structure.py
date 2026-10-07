"""Validated run-owned chapter structure and explicit before/after proposals."""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class StructureChapter(BaseModel):
    """Stable chapter identity; array order determines document order."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    chapter_id: UUID
    template_section_id: str | None = None
    required: bool = False
    title: str = Field(min_length=1, max_length=255)
    description: str = Field(default="", max_length=4000)

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        """Keep chapter headings nonempty and on one line."""
        value = value.strip()
        if not value or "\n" in value or "\r" in value:
            raise ValueError("Chapter title must be nonempty and on one line")
        return value


class StructureState(BaseModel):
    """An optimistic snapshot including content revisions in its fingerprint."""

    fingerprint: str
    chapters: list[StructureChapter]


class StructureSaveRequest(BaseModel):
    """Explicit replacement of one exact run structure."""

    model_config = ConfigDict(extra="forbid")
    expected_fingerprint: str = Field(pattern=r"^[0-9a-f]{64}$")
    chapters: list[StructureChapter] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def unique_chapters(self) -> StructureSaveRequest:
        """Reject duplicate identities before touching storage."""
        if len({c.chapter_id for c in self.chapters}) != len(self.chapters):
            raise ValueError("Chapter identities must be unique")
        return self


class StructureProposal(BaseModel):
    """Immutable structural preview applied only after user acceptance."""

    before: StructureState
    after: list[StructureChapter]


class StructurePlannedChapter(BaseModel):
    """Agent addresses existing chapters by catalogue position, never invented IDs."""

    model_config = ConfigDict(extra="forbid")
    chapter_position: int | None = Field(default=None, ge=0)
    title: str = Field(min_length=1, max_length=255)
    description: str = Field(max_length=4000)
