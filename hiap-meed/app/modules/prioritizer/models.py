"""
Pydantic models for external API payloads and top-level endpoint contracts.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.modules.prioritizer.config import resolve_impact_text_multiplier
from app.modules.prioritizer.services.co_benefit_mapping import ALLOWED_CO_BENEFIT_KEYS
from app.modules.prioritizer.utils.sector_mapping import ALLOWED_SECTOR_TAGS


def _validate_allowed_string_list(
    *,
    values: list[str],
    field_name: str,
    allowed_values: set[str],
) -> list[str]:
    """Validate one string-list field against an exact allowed taxonomy."""
    normalized_values = list(dict.fromkeys(values))
    invalid_values = [
        value for value in normalized_values if value not in allowed_values
    ]
    if invalid_values:
        raise ValueError(
            f"{field_name} must contain only supported values: "
            f"{sorted(allowed_values)}; got invalid values {invalid_values}"
        )
    return normalized_values

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
    excludedActionIds: list[str] = Field(default_factory=list)
    weightsOverride: dict[str, float] | None = None
    cityStrategicPreferenceSectors: list[str] = Field(default_factory=list)
    cityStrategicPreferenceTimeframes: list[
        Literal["short", "medium", "long", "no_preference"]
    ] = Field(default_factory=lambda: ["no_preference"])
    cityStrategicPreferenceOther: str | None = None
    cityEmissionsData: FrontendCityEmissionsData

    @field_validator("cityStrategicPreferenceSectors")
    @classmethod
    def _validate_city_preference_sectors(cls, values: list[str]) -> list[str]:
        """Validate that city preferred sectors use the supported taxonomy only."""
        return _validate_allowed_string_list(
            values=values,
            field_name="cityStrategicPreferenceSectors",
            allowed_values=ALLOWED_SECTOR_TAGS,
        )

    # Normalize only omission/duplication before Literal validation. All
    # non-empty entries must already match the exact frontend contract.
    @field_validator("cityStrategicPreferenceTimeframes", mode="before")
    @classmethod
    def _normalize_timeframe_preferences(cls, value: object) -> object:
        """Normalize timeframe preferences before enum validation runs."""
        # Missing or null input means "neutral" rather than "invalid".
        if value is None:
            return ["no_preference"]
        if not isinstance(value, list):
            return value

        normalized_preferences: list[str] = []
        for item in value:
            # Keep frontend-provided values as-is so unexpected spellings,
            # casing, or whitespace are rejected by the Literal validator.
            if item != "":
                normalized_preferences.append(str(item))

        # An empty list behaves the same as no explicit preference.
        if not normalized_preferences:
            return ["no_preference"]
        # Preserve user intent order while removing duplicates.
        return list(dict.fromkeys(normalized_preferences))

    # Run a second validation pass after normalization + Literal validation to
    # enforce the business rule that "no_preference" cannot be combined with a
    # concrete timeframe choice.
    @model_validator(mode="after")
    def _validate_timeframe_preferences(self) -> FrontendCityInput:
        """Ensure `no_preference` is not mixed with explicit timeframe choices."""
        preferences = self.cityStrategicPreferenceTimeframes
        if "no_preference" in preferences and len(preferences) > 1:
            raise ValueError(
                "cityStrategicPreferenceTimeframes cannot combine `no_preference` "
                "with other timeframe preferences"
            )
        return self


class PrioritizerRequestData(BaseModel):
    """RequestData section of frontend prioritizer request payload."""

    requestedLanguages: list[str] = Field(default_factory=lambda: ["en"])
    topN: int | None = Field(default=None, ge=1)
    createExplanations: bool = False
    cityDataList: list[FrontendCityInput] = Field(min_length=1)

    @field_validator("requestedLanguages", mode="before")
    @classmethod
    def _normalize_requested_languages(cls, value: object) -> object:
        """Normalize missing/empty requested languages to a single English default."""
        if value is None:
            return ["en"]
        if not isinstance(value, list):
            return value

        normalized_languages = [
            str(item).strip() for item in value if str(item).strip()
        ]
        if not normalized_languages:
            return ["en"]
        return normalized_languages


class PrioritizerApiRequest(BaseModel):
    """Frontend -> hiap-meed request envelope for single or multi-city prioritization."""

    meta: FrontendRequestMeta
    requestData: PrioritizerRequestData


# ============================================================================
# EXCLUSION PREVIEW REQUEST/RESPONSE MODELS (CityCatalyst -> hiap-meed)
# ----------------------------------------------------------------------------
# Composition:
# - ExclusionPreviewApiRequest
#   - meta: FrontendRequestMeta
#     - apiContext: FrontendApiContext
#   - requestData: ExclusionPreviewRequestData
#     - cityDataList: list[ExclusionPreviewCityInput]
# - ExclusionPreviewApiResponse
#   - results: list[ExclusionPreviewCityResult]
#     - proposedExcludedActions: list[ProposedExcludedAction]
#     - exclusionSummary: ExclusionSummary
#       - byReasonType: dict[str, ExclusionSummaryReasonGroup]
# ============================================================================


class ExclusionPreviewCityInput(BaseModel):
    """Single city payload for exclusion-preference preview."""

    locode: str = Field(min_length=1)
    excludedSectorTags: list[str] = Field(default_factory=list)
    excludedCoBenefitKeys: list[str] = Field(default_factory=list)
    excludedActionsFreeText: str | None = None

    @field_validator("excludedSectorTags")
    @classmethod
    def _validate_excluded_sector_tags(cls, values: list[str]) -> list[str]:
        """Validate that excluded sector tags use the supported taxonomy only."""
        return _validate_allowed_string_list(
            values=values,
            field_name="excludedSectorTags",
            allowed_values=ALLOWED_SECTOR_TAGS,
        )

    @field_validator("excludedCoBenefitKeys")
    @classmethod
    def _validate_excluded_co_benefit_keys(cls, values: list[str]) -> list[str]:
        """Validate that excluded co-benefit keys use the supported taxonomy only."""
        return _validate_allowed_string_list(
            values=values,
            field_name="excludedCoBenefitKeys",
            allowed_values=set(ALLOWED_CO_BENEFIT_KEYS),
        )


class ExclusionPreviewRequestData(BaseModel):
    """RequestData section for exclusion preview requests."""

    cityDataList: list[ExclusionPreviewCityInput] = Field(min_length=1)


class ExclusionPreviewApiRequest(BaseModel):
    """Frontend -> hiap-meed request envelope for exclusion preview."""

    meta: FrontendRequestMeta
    requestData: ExclusionPreviewRequestData


class ProposedExcludedAction(BaseModel):
    """One action proposed for exclusion before user confirmation."""

    actionId: str
    actionName: str
    reasons: list[str] = Field(default_factory=list)
    matchedBy: list[str] = Field(default_factory=list)


class ExclusionSummaryReasonGroup(BaseModel):
    """Grouped exclusion count and action IDs for one reason type."""

    count: int = 0
    actionIds: list[str] = Field(default_factory=list)


class ExclusionSummary(BaseModel):
    """Summary of proposed exclusions grouped for frontend review."""

    totalProposed: int = 0
    byReasonType: dict[str, ExclusionSummaryReasonGroup] = Field(default_factory=dict)


class ExclusionPreviewCityResult(BaseModel):
    """Per-city exclusion preview response."""

    locode: str = Field(min_length=1)
    proposedExcludedActions: list[ProposedExcludedAction] = Field(default_factory=list)
    exclusionSummary: ExclusionSummary = Field(default_factory=ExclusionSummary)
    warnings: list[str] = Field(default_factory=list)


class ExclusionPreviewApiResponse(BaseModel):
    """Top-level response for exclusion preview."""

    results: list[ExclusionPreviewCityResult] = Field(default_factory=list)


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
        """Validate emissions impact includes a non-empty, known text band."""
        emissions_entry = self.emissions
        if emissions_entry is None:
            return self

        impact_text = emissions_entry.impact_text
        if impact_text is None or not impact_text.strip():
            raise ValueError(f"Action `{self.actionId}` is missing emissions.impact_text")
        # Validate that the text band can be resolved by configured impact mapping.
        resolve_impact_text_multiplier(impact_text)
        return self

    @model_validator(mode="after")
    def _validate_co_benefit_impact_numeric_range(self) -> ActionApiItem:
        """Validate co-benefit numeric impact values stay within `[-2, 2]`."""
        for co_benefit_key, co_benefit_entry in self.coBenefits.items():
            impact_numeric = co_benefit_entry.impact_numeric
            if impact_numeric is None:
                continue
            if impact_numeric < -2 or impact_numeric > 2:
                raise ValueError(
                    "Action "
                    f"`{self.actionId}` has coBenefits.{co_benefit_key}.impact_numeric="
                    f"{impact_numeric} outside allowed range [-2, 2]"
                )
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


