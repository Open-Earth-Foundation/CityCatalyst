"""Internal models for City Action Report / output-plan generation."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from app.modules.prioritizer.internal_models import (
    Action,
    ActionFinancialFeasibilityScoreRecord,
    ActionMitigationFeasibilityScoreRecord,
    ActionPolicyScoreRecord,
    CityData,
    ClimateFinanceOpportunityRecord,
    ClimateFinanceProjectRecord,
    LegalAssessmentRecord,
)
from app.modules.prioritizer.models import (
    CityActionReportChapter,
    PrioritizerApiCityResult,
    PrioritizerApiRequest,
    RankedActionResult,
)


ChapterKey = Literal[
    "snapshot",
    "the_action",
    "action_impact",
    "city_fit",
    "policy_backing",
    "legal_mandate_delivery",
    "financing_precedents_pathway",
    "sources_assumptions",
]


class ReportContext(BaseModel):
    """
    Normalized input for one output-plan report.

    The context combines ranking facts from the frontend prioritization snapshot
    with live backend enrichment. It is intentionally single-city and
    single-action so chapter prompts never receive unrelated ranked actions.
    """

    locode: str
    country_code: str
    action_id: str
    language: str
    prioritization_request: PrioritizerApiRequest
    prioritization_city_result: PrioritizerApiCityResult
    ranked_action: RankedActionResult
    action: Action
    city: CityData
    policy_score: ActionPolicyScoreRecord | None = None
    legal_assessment: LegalAssessmentRecord | None = None
    mitigation_feasibility: ActionMitigationFeasibilityScoreRecord | None = None
    financial_feasibility: ActionFinancialFeasibilityScoreRecord | None = None
    finance_opportunities: list[ClimateFinanceOpportunityRecord] = Field(
        default_factory=list
    )
    comparable_projects: list[ClimateFinanceProjectRecord] = Field(default_factory=list)
    source_metadata: dict[str, Any] = Field(default_factory=dict)
    limitations: list[str] = Field(default_factory=list)


class ReportChapterInput(BaseModel):
    """Curated input passed to one chapter prompt or deterministic builder."""

    key: ChapterKey
    title: str
    language: str
    facts: dict[str, Any] = Field(default_factory=dict)
    source_refs: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    notion_coverage: list[str] = Field(default_factory=list)
    notion_deferred: list[str] = Field(default_factory=list)
    unsupported_claims: list[str] = Field(default_factory=list)


class ReportChapterDraft(BaseModel):
    """Structured chapter draft returned by the LLM service."""

    key: ChapterKey
    title: str
    markdown: str
    source_refs: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)


class ReportGenerationResult(BaseModel):
    """Chapter drafts plus provider I/O diagnostics."""

    chapters: list[CityActionReportChapter]
    llm_io: dict[str, Any] = Field(default_factory=dict)
