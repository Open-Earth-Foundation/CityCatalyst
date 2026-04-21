"""
Pydantic models for external API payloads and top-level endpoint contracts.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, model_validator

from app.modules.prioritizer.config import resolve_impact_text_multiplier

# ============================================================================
# FRONTEND REQUEST ENVELOPE MODELS (CityCatalyst -> hiap-meed)
# ----------------------------------------------------------------------------
# Composition:
# - PrioritizerApiRequest
#   - meta: FrontendRequestMeta
#     - apiContext: FrontendApiContext
#   - requestData: PrioritizerRequestData
#     - cityDataList: list[FrontendCityInput]
#       - cityEmissionsData: FrontendCityEmissionsData
#         - gpcData: dict[str, GpcDataEntry]
#           - activities: list[GpcActivity]
# ============================================================================


class FrontendApiContext(BaseModel):
    """Frontend request API context metadata."""

    endpoint: str
    locodes: list[str] = Field(default_factory=list)


class FrontendRequestMeta(BaseModel):
    """Metadata envelope for prioritizer requests sent by CityCatalyst."""

    requestId: str
    generatedAtUtc: str
    backendConsumer: str
    upstreamProvider: str
    apiContext: FrontendApiContext
    totalRecords: int


class GpcActivity(BaseModel):
    """Single activity record for one GPC key."""

    activityName: str
    totalEmissions: float | None = None
    totalEmissionsUnit: str | None = None
    activityValue: float | None = None
    activityUnit: str | None = None
    dataSource: str | None = None
    notationKey: str | None = None


class GpcDataEntry(BaseModel):
    """One GPC reference key payload containing optional activities."""

    notationKey: str | None = None
    activities: list[GpcActivity] = Field(default_factory=list)


class FrontendCityEmissionsData(BaseModel):
    """City emissions payload provided by frontend request."""

    inventoryYear: int | None = None
    gpcData: dict[str, GpcDataEntry] = Field(default_factory=dict)


class FrontendCityInput(BaseModel):
    """Single city payload within frontend prioritizer request."""

    locode: str = Field(min_length=1)
    countryCode: str = Field(min_length=2, max_length=2)
    populationSize: int | None = None
    excludedActionsFreeText: str | None = None
    weightsOverride: dict[str, float] | None = None
    cityStrategicPreferenceSectors: list[str] = Field(default_factory=list)
    cityStrategicPreferenceOther: str | None = None
    cityEmissionsData: FrontendCityEmissionsData


class PrioritizerRequestData(BaseModel):
    """RequestData section of frontend prioritizer request payload."""

    requestedLanguages: list[str] = Field(default_factory=lambda: ["en"])
    topN: int | None = Field(default=None, ge=1)
    createExplanations: bool = False
    cityDataList: list[FrontendCityInput] = Field(min_length=1)


class PrioritizerApiRequest(BaseModel):
    """Frontend -> hiap-meed request envelope for single or multi-city prioritization."""

    meta: FrontendRequestMeta
    requestData: PrioritizerRequestData


# ============================================================================
# UPSTREAM RESPONSE MODELS (global-api -> hiap-meed)
# ----------------------------------------------------------------------------
# Composition:
# - CityApiResponse
#   - meta: UpstreamMeta
#     - api_context: UpstreamApiContext
#   - city: CityApiItem
# - CitiesApiResponse
#   - meta: UpstreamMeta
#   - cities: list[CityApiItem]
# - ActionsApiResponse
#   - meta: UpstreamMeta
#   - actions: list[ActionApiItem]
#     - emissions: ActionImpactEntry
#     - coBenefits: dict[str, ActionImpactEntry]
#     - socioeconomicIndicators: list[ActionSocioeconomicIndicatorRule]
# - ActionsPolicySignalsApiResponse
#   - meta: UpstreamMeta
#   - policy_signals: list[PolicySignalByAction]
#     - policy_signals: list[PolicySignal]
# - ActionsLegalApiResponse
#   - meta: ActionsLegalApiMeta (extends UpstreamMeta)
#   - legal_requirements: list[LegalRequirementsByAction]
#     - requirements: list[LegalRequirement]
# ============================================================================


class UpstreamApiContext(BaseModel):
    """Common API context metadata returned by upstream APIs."""

    endpoint: str
    locode: str | None = None


class UpstreamMeta(BaseModel):
    """Common metadata envelope returned by upstream APIs."""

    generated_at_utc: str
    backend_consumer: str
    upstream_provider: str
    api_context: UpstreamApiContext
    total_records: int


class CityIndicator(BaseModel):
    """Single city indicator object used in city API payload."""

    attribute_value: float | str | None = None
    attribute_units: str | None = None
    attribute_category: str | None = None


class CityApiItem(BaseModel):
    """City item shape returned by upstream `GET /v1/cities/{locode}`."""

    comuna_name: str
    locode: str
    countryCode: str | None = None
    region_name: str
    comuna_code: str
    region_code: str
    populationSize: int | None = None
    populationDensity: float | None = None
    area: float | None = None
    unemployment_rate: CityIndicator | None = None
    renter_share: CityIndicator | None = None
    employment_in_transport_and_logistics: CityIndicator | None = None
    electricity_access_rate: CityIndicator | None = None
    industry_construction_employment: CityIndicator | None = None
    median_household_income: CityIndicator | None = None
    public_transport_share: CityIndicator | None = None
    poverty_rate: CityIndicator | None = None
    home_ownership: CityIndicator | None = None


class ActionImpactEntry(BaseModel):
    """Single impact entry (emissions or co-benefit category) for one action."""

    sector_number: str
    subsector_number: int
    gpc_reference_number: list[str]
    impact_relationship: str | None = None
    impact_text: str | None = None
    impact_numeric: int | None = None
    methodology: str | None = None


class ActionSocioeconomicIndicatorRule(BaseModel):
    """One socioeconomic fit rule row attached to an action."""

    indicator_key: str
    direction: str
    weight: float
    rationale: str | None = None

    @model_validator(mode="after")
    def _validate_direction_and_weight(self) -> ActionSocioeconomicIndicatorRule:
        """Validate direction enum and weight bounds for socioeconomic rules."""
        normalized_direction = self.direction.strip().lower()
        if normalized_direction not in {"supportive", "constraining"}:
            raise ValueError(
                "socioeconomicIndicators[].direction must be `supportive` or "
                f"`constraining`, got `{self.direction}`"
            )
        if self.weight < 0.0 or self.weight > 1.0:
            raise ValueError(
                "socioeconomicIndicators[].weight must be within [0, 1], "
                f"got {self.weight}"
            )
        self.direction = normalized_direction
        return self


class ActionApiItem(BaseModel):
    """Action item shape returned by upstream `GET /v1/actions`."""

    actionId: str
    actionName: str
    description: str | None = None
    actionCategory: str | None = None
    actionSubcategory: str | None = None
    costInvestmentNeeded: str | None = None
    timelineForImplementation: str | None = None
    coBenefits: dict[str, ActionImpactEntry] = Field(default_factory=dict)
    emissions: ActionImpactEntry | None = None
    socioeconomicIndicators: list[ActionSocioeconomicIndicatorRule] = Field(
        default_factory=list
    )

    @model_validator(mode="after")
    def _validate_emissions_impact_text_band_present(self) -> ActionApiItem:
        """Validate emissions impact includes a non-empty text band."""
        emissions_entry = self.emissions
        if emissions_entry is None:
            return self
        impact_text = emissions_entry.impact_text
        if impact_text is None or not impact_text.strip():
            raise ValueError(
                f"Action `{self.actionId}` is missing emissions.impact_text"
            )
        # Validate that the text band can be resolved by configured impact mapping.
        resolve_impact_text_multiplier(impact_text)
        return self


class CityApiResponse(BaseModel):
    """Response model for `GET /v1/cities/{locode}`."""

    meta: UpstreamMeta
    city: CityApiItem


class CitiesApiResponse(BaseModel):
    """Response model for city list endpoints."""

    meta: UpstreamMeta
    cities: list[CityApiItem] = Field(default_factory=list)


class ActionsApiResponse(BaseModel):
    """Response model for `GET /v1/actions`."""

    meta: UpstreamMeta
    actions: list[ActionApiItem] = Field(default_factory=list)


class PolicySignal(BaseModel):
    """Single policy signal evidence item for one action."""

    location_scope: str
    location_name: str
    signal_type: str
    signal_relation: str
    signal_strength: str
    evidence_ids: list[str] = Field(default_factory=list)
    evidence_count: int = 0


class PolicySignalByAction(BaseModel):
    """Policy signal collection grouped by action ID."""

    action_id: str
    policy_signals: list[PolicySignal] = Field(default_factory=list)
    policy_support_score: float | None = Field(default=None, ge=0.0, le=1.0)


class ActionsPolicySignalsApiResponse(BaseModel):
    """Response model for city-scoped policy alignment endpoint."""

    meta: UpstreamMeta
    policy_signals: list[PolicySignalByAction] = Field(default_factory=list)


class LegalRequirement(BaseModel):
    """Single legal requirement alignment check for one action."""

    signal_code: str
    signal_name: str
    operator: str
    required_value: str | None = None
    legal_signal_value: str | None = None
    strength: str
    alignment_status: str
    location_scope: str | None = None
    location_name: str | None = None
    evidence_ids: list[str] = Field(default_factory=list)
    evidence_count: int = 0


class LegalRequirementsByAction(BaseModel):
    """Legal requirements grouped by action ID."""

    action_id: str
    requirements: list[LegalRequirement] = Field(default_factory=list)


class ActionsLegalApiMeta(UpstreamMeta):
    """Metadata for actions/legal response including test descriptors."""

    test_cases: dict[str, str] = Field(default_factory=dict)
    strength_scale: list[str] = Field(default_factory=list)


class ActionsLegalApiResponse(BaseModel):
    """Response model for city-scoped legal alignment endpoint."""

    meta: ActionsLegalApiMeta
    legal_requirements: list[LegalRequirementsByAction] = Field(default_factory=list)


class PrioritizationResponse(BaseModel):
    """Per-city prioritization output used by the API response."""

    ranked_action_ids: list[str] = Field(default_factory=list)
    ranked_actions: list[RankedActionResult] = Field(default_factory=list)
    metadata: dict[str, object] = Field(default_factory=dict)


class RankedActionResult(BaseModel):
    """Public ranked action payload returned to API consumers."""

    action_id: str
    rank: int
    final_score: float
    impact_score: float
    alignment_score: float
    feasibility_score: float
    evidence_summary: dict[str, object] = Field(default_factory=dict)
    explanation: str | None = None


class PrioritizerApiCityResult(BaseModel):
    """One city result entry returned by the prioritization endpoint."""

    locode: str = Field(min_length=1)
    ranked_action_ids: list[str] = Field(default_factory=list)
    ranked_actions: list[RankedActionResult] = Field(default_factory=list)
    metadata: dict[str, object] = Field(default_factory=dict)


class PrioritizerApiResponse(BaseModel):
    """Top-level response for the frontend prioritization request envelope."""

    results: list[PrioritizerApiCityResult] = Field(default_factory=list)


