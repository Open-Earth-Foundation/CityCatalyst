"""Research model contracts without persisted or generated identity fields."""

from app.models.cnb.research import (
    FundedProjectResearchResult,
    FunderCriterionResearchResult,
    FunderResearchResult,
    FundingOpportunityResearchResultRow,
    TemplateChapterDraft,
)
from pydantic import BaseModel, ConfigDict, Field
from pydantic.json_schema import SkipJsonSchema


class ResearchFacts(BaseModel):
    """Strict model-facing research facts, separate from persistence identity."""

    model_config = ConfigDict(extra="forbid")


class FunderFacts(FunderResearchResult):
    """Reuse the factual contract while keeping its internal join key off the wire."""

    funder_ref: SkipJsonSchema[str] = Field(default="", exclude=True)


class OpportunityFacts(FundingOpportunityResearchResultRow):
    """One opportunity's semantic fields; its parent is the dossier funder."""

    funding_opportunity_ref: SkipJsonSchema[str] = Field(default="", exclude=True)
    funder_ref: SkipJsonSchema[str] = Field(default="", exclude=True)


class ProjectFacts(FundedProjectResearchResult):
    """A funded project; array order carries correspondence between turns."""

    funded_project_ref: SkipJsonSchema[str] = Field(default="", exclude=True)
    funder_ref: SkipJsonSchema[str] = Field(default="", exclude=True)


class ChapterFacts(TemplateChapterDraft):
    """Human-readable template chapter fields only."""

    chapter_ref: SkipJsonSchema[str] = Field(default="", exclude=True)


class TemplateFacts(ResearchFacts):
    """Template content belonging to the single opportunity in this dossier."""

    template_name: str
    output_format: str | None = None
    chapter_schema: list[ChapterFacts] = Field(default_factory=list)
    required_fields: list[str] = Field(default_factory=list)


class CriterionFacts(FunderCriterionResearchResult):
    """Criterion content without internal record references."""

    criterion_ref: SkipJsonSchema[str] = Field(default="", exclude=True)
    funding_opportunity_ref: SkipJsonSchema[str] = Field(default="", exclude=True)


class SourceAssessment(ResearchFacts):
    """Classify a source by its captured public URL, not a fingerprint token."""

    source_url: str = Field(min_length=1)
    source_type: str
    publication_date: str | None = None
    license_status: str | None = None


class ResearchEvidence(ResearchFacts):
    """Evidence identifies a public source and a zero-based project array position."""

    project_position: int | None = Field(default=None, ge=0)
    field: str
    source_url: str | None
    source_location: str | None = None
    quote_or_summary: str


class MissingFact(ResearchFacts):
    """A missing semantic field, using normal zero-based array paths."""

    field: str
    reason: str


class ConflictingFact(ResearchFacts):
    """Conflicting facts point to positions in this response's evidence array."""

    field: str
    candidate_values: list[str]
    evidence_positions: list[int] = Field(default_factory=list)
    explanation: str


class ResearchPromptResult(ResearchFacts):
    """Model result whose identity and integrity metadata are assigned by code."""

    funder: FunderFacts
    funding_opportunities: list[OpportunityFacts]
    funded_projects: list[ProjectFacts]
    funder_templates: list[TemplateFacts] = Field(default_factory=list)
    funder_criteria: list[CriterionFacts] = Field(default_factory=list)
    source_assessments: list[SourceAssessment] = Field(default_factory=list)
    evidence: list[ResearchEvidence] = Field(default_factory=list)
    gaps: list[MissingFact] = Field(default_factory=list)
    conflicts: list[ConflictingFact] = Field(default_factory=list)
