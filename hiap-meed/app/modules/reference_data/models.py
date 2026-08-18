"""Strict public request and response contracts for reference-data APIs."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.modules.prioritizer.localization import supported_languages


class ReferenceDataContract(BaseModel):
    """Base contract that rejects fields outside the documented public schema."""

    model_config = ConfigDict(extra="forbid")


class ActionPathwaysQuery(ReferenceDataContract):
    """Languages the caller wants included in the action catalogue response."""

    language: list[str] = Field(
        default_factory=list,
        description=(
            "Repeatable presentation-language code. Omit to return every available "
            "localization; HIAP-MEED always fetches the canonical all-language catalogue."
        ),
    )

    @field_validator("language")
    @classmethod
    def _normalize_languages(cls, values: list[str]) -> list[str]:
        """Normalize, deduplicate, and validate caller-selected languages."""
        if any(not value.strip() for value in values):
            raise ValueError("language values must not be blank")
        normalized = list(dict.fromkeys(value.strip().lower() for value in values))
        unsupported = sorted(set(normalized) - set(supported_languages()))
        if unsupported:
            raise ValueError(
                "language contains unsupported values: "
                f"{unsupported}; supported languages are {sorted(supported_languages())}"
            )
        return normalized


class CountryQuery(ReferenceDataContract):
    """Country selected by the caller for a city-related data request."""

    country_code: str = Field(
        min_length=2,
        max_length=2,
        pattern=r"^[A-Za-z]{2}$",
        description=(
            "Caller-selected ISO alpha-2 country code. HIAP-MEED normalizes it and "
            "owns all technical upstream parameters and filtering."
        ),
    )

    @field_validator("country_code", mode="before")
    @classmethod
    def _normalize_country_code(cls, value: str) -> str:
        """Normalize a validated country code to uppercase."""
        return value.strip().upper()


class ClimateFinanceOpportunitiesQuery(CountryQuery):
    """Country, sector, and finance route chosen for an opportunity search."""

    sector: str | None = Field(
        default=None,
        min_length=1,
        description=(
            "Caller-selected action sector. When omitted, HIAP-MEED deliberately "
            "skips the upstream request and returns an empty result with a warning."
        ),
    )
    route: str | None = Field(
        default=None,
        min_length=1,
        description=(
            "Caller-selected finance route used by backend screening. Eligibility, "
            "technical limits, status rules, ordering, and result caps are not selectable."
        ),
    )

    @field_validator("sector", "route", mode="before")
    @classmethod
    def _normalize_optional_scope(cls, value: str | None) -> str | None:
        """Trim optional domain values without changing their vocabulary."""
        return value.strip() if value is not None else None


class ClimateFinanceProjectsQuery(CountryQuery):
    """Country and climate action chosen for a comparable-project search."""

    action_id: str = Field(
        min_length=1,
        description=(
            "Caller-selected action identifier. HIAP-MEED owns the upstream query "
            "construction, validation, ordering, and five-project limit."
        ),
    )

    @field_validator("action_id", mode="before")
    @classmethod
    def _normalize_action_id(cls, value: str) -> str:
        """Trim the caller-selected action identifier."""
        return value.strip()


class ReferenceDataMeta(ReferenceDataContract):
    """Common metadata returned by every successful reference-data response."""

    generated_at_utc: str
    backend_consumer: str = "hiap-meed"
    upstream_provider: str = "global-api"
    api_context: dict[str, str | int]
    total_records: int = Field(ge=0)


class CityIndicatorResponse(ReferenceDataContract):
    """One city indicator with its source value, unit, and display category."""

    key: str
    value: float | str | None
    unit: str | None
    category: str | None


class CityResponse(ReferenceDataContract):
    """Stable city record exposed to reference-data consumers."""

    locode: str
    city_name: str
    country_code: str | None
    region_name: str
    population_size: int | None
    area_km2: float | None
    population_density: float | None
    indicators: list[CityIndicatorResponse]


class CityAttributesResponse(ReferenceDataContract):
    """Successful city-attributes response."""

    city: CityResponse
    meta: ReferenceDataMeta
    warnings: list[str]


class ActionImpactResponse(ReferenceDataContract):
    """Emissions impact details supplied by Global API for one action."""

    sector_number: str
    subsector_number: list[int]
    gpc_reference_number: list[str]
    impact_relationship: str | None
    impact_text: str | None
    impact_numeric: int | None
    methodology: str | None


class ActionCoBenefitResponse(ReferenceDataContract):
    """One named co-benefit supplied by Global API for one action."""

    impact_relationship: str | None
    impact_text: str | None
    impact_numeric: int | None
    methodology: str | None


class ActionPathwayResponse(ReferenceDataContract):
    """Prioritizable action fields and impacts returned to consumers."""

    action_id: str
    action_name: str
    action_type: str | None
    description: str | None
    name_i18n: dict[str, str]
    description_i18n: dict[str, str]
    investment_cost: str | None
    implementation_timeline: str | None
    co_benefits: dict[str, ActionCoBenefitResponse]
    emissions: ActionImpactResponse | None


class ActionPathwaysResponse(ReferenceDataContract):
    """Successful action-pathways response."""

    actions: list[ActionPathwayResponse]
    meta: ReferenceDataMeta
    warnings: list[str]


class PolicyEvidenceResponse(ReferenceDataContract):
    """Policy evidence with Global API signal values passed through unchanged."""

    document_type: str | None = Field(
        description="Unchanged Global API document_type value."
    )
    scope: Literal["national", "regional", "municipal"] | None = Field(
        description=(
            "Derived geographic scope for a recognized document type; null when "
            "the source type is missing or unknown."
        )
    )
    document_name: str | None
    signal_type: str | None
    signal_relation: str | None = Field(
        description="Unchanged Global API signal_relation value."
    )
    signal_strength: str | None
    doc_relevance: str | None = Field(
        description="Unchanged Global API doc_relevance value."
    )
    evidence_strength: float | None


class ActionPolicyScoreResponse(ReferenceDataContract):
    """One action's policy score and all evidence returned by HIAP-MEED."""

    action_id: str
    policy_support_score: float | None
    policy_support_category: str | None
    finding_count: int | None
    document_count: int | None
    policy_evidence: list[PolicyEvidenceResponse]


class PolicyAggregatesResponse(ReferenceDataContract):
    """Policy-alignment aggregates derived from the normalized evidence."""

    national: float | None
    regional: float | None
    municipal: float | None


class ActionPolicyScoresResponse(ReferenceDataContract):
    """Successful action-policy-scores response."""

    locode: str
    scores: list[ActionPolicyScoreResponse]
    aggregates: PolicyAggregatesResponse
    meta: ReferenceDataMeta
    warnings: list[str]


class ActionMitigationScoreResponse(ReferenceDataContract):
    """Mitigation-feasibility result returned for one climate action."""

    action_id: str
    action_score: float | None
    rank_within_city: int | None
    dimension_scores: dict[str, float]


class ActionMitigationScoresResponse(ReferenceDataContract):
    """Successful mitigation-feasibility response."""

    locode: str
    country_code: str
    scores: list[ActionMitigationScoreResponse]
    meta: ReferenceDataMeta
    warnings: list[str]


class FinancialActionInputsResponse(ReferenceDataContract):
    """Action cost and preparation inputs behind a feasibility score."""

    capital_intensity: float | None
    preparation_complexity: float | None


class FinancialCityInputsResponse(ReferenceDataContract):
    """City profile input behind a feasibility score."""

    profile: str | None


class FinancialFinanceInputsResponse(ReferenceDataContract):
    """Funding-access inputs behind a feasibility score."""

    fund_access: str | None
    n_reachable_opportunities: int | None


class FinancialEvidenceInputsResponse(ReferenceDataContract):
    """Comparable-project count behind a feasibility score."""

    n_existing_projects: int | None


class FinancialFeasibilityInputsResponse(ReferenceDataContract):
    """Source inputs that explain a financial-feasibility result."""

    action: FinancialActionInputsResponse
    city: FinancialCityInputsResponse
    finance: FinancialFinanceInputsResponse
    evidence: FinancialEvidenceInputsResponse


class ActionFinancialScoreResponse(ReferenceDataContract):
    """Financial-feasibility source row, including its display inputs."""

    action_id: str
    action_name: str | None
    sector: str | None
    financial_feasibility: float | None
    route: str | None
    reason: str | None
    inputs: FinancialFeasibilityInputsResponse


class ActionFinancialScoresResponse(ReferenceDataContract):
    """Successful financial-feasibility response."""

    locode: str
    country_code: str
    data: list[ActionFinancialScoreResponse]
    meta: ReferenceDataMeta
    warnings: list[str]


class CurrentFinanceOpportunityResponse(ReferenceDataContract):
    """Current finance opportunity selected by backend-owned screening."""

    opportunity_name: str
    funder_name: str | None
    instrument: str | None
    status: str | None
    source_url: str | None


class MonitoringFinanceOpportunityResponse(CurrentFinanceOpportunityResponse):
    """Recurring closed finance opportunity retained for monitoring."""

    recurrence: str | None


class ClimateFinanceOpportunitiesResponse(ReferenceDataContract):
    """Successful current and monitoring finance-opportunities response."""

    current: list[CurrentFinanceOpportunityResponse]
    monitor: list[MonitoringFinanceOpportunityResponse]
    meta: ReferenceDataMeta
    warnings: list[str]


class ClimateFinanceProjectFundingSourceResponse(ReferenceDataContract):
    """Funding source details displayed for a comparable project."""

    cycle: str | int | None
    amount: float | None
    amount_unit: str | None
    funder_name: str | None


class ClimateFinanceProjectActionMatchResponse(ReferenceDataContract):
    """Action match and confidence supplied for a comparable project."""

    action_id: str
    confidence: str | None


class ClimateFinanceProjectResponse(ReferenceDataContract):
    """Comparable project details supplied by the shared catalogue query."""

    project_name: str
    project_name_i18n: dict[str, str]
    sector: str | None
    jurisdiction: str | None
    lifecycle_stage: str | None
    funding_channel: str | None
    cost_total: float | None
    amount_unit: str | None
    funding_sources: list[ClimateFinanceProjectFundingSourceResponse]
    action_matches: list[ClimateFinanceProjectActionMatchResponse]


class ClimateFinanceProjectsResponse(ReferenceDataContract):
    """Successful comparable-projects response."""

    projects: list[ClimateFinanceProjectResponse]
    meta: ReferenceDataMeta
    warnings: list[str]
