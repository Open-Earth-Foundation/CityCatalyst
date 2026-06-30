"""
Pydantic models for external API payloads and top-level endpoint contracts.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.modules.prioritizer.scoring_config import resolve_impact_text_multiplier
from app.modules.prioritizer.utils.co_benefit_taxonomy import ALLOWED_CO_BENEFIT_KEYS
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
# CALLER REQUEST ENVELOPE MODELS (external frontend or upstream caller -> hiap-meed)
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
    """Caller request API context metadata."""

    model_config = ConfigDict(extra="forbid")

    endpoint: str = Field(description="Caller route or endpoint that originated the request.")
    locodes: list[str] = Field(
        default_factory=list,
        description="One or more UN/LOCODE values included in the request context.",
    )


class FrontendRequestMeta(BaseModel):
    """Metadata envelope for prioritizer requests sent by the current caller."""

    model_config = ConfigDict(extra="forbid")

    requestId: str = Field(description="Caller-generated request identifier.")
    generatedAtUtc: str = Field(
        description="Caller timestamp for when the request envelope was created."
    )
    backendConsumer: str = Field(
        description="Backend service expected to consume this request."
    )
    upstreamProvider: str = Field(
        description="Originating frontend or upstream caller name."
    )
    apiContext: FrontendApiContext = Field(
        description="Lightweight caller route context for observability."
    )
    totalRecords: int = Field(description="Number of city records carried in the request.")


class GpcActivity(BaseModel):
    """Single activity record for one GPC key."""

    model_config = ConfigDict(extra="forbid")

    activityType: str | None = None
    totalEmissions: float | None = None
    totalEmissionsUnit: str | None = None
    activityValue: float | None = None
    activityUnit: str | None = None
    dataSource: str | None = None
    notationKey: str | None = None


class GpcDataEntry(BaseModel):
    """One GPC reference key payload containing optional activities."""

    model_config = ConfigDict(extra="forbid")

    notationKey: str | None = None
    activities: list[GpcActivity] = Field(default_factory=list)


class FrontendCityEmissionsData(BaseModel):
    """City emissions payload provided by the caller request."""

    model_config = ConfigDict(extra="forbid")

    inventoryYear: int | None = Field(
        default=None,
        description="Inventory year for the provided city emissions data, when known.",
    )
    gpcData: dict[str, GpcDataEntry] = Field(
        default_factory=dict,
        description="City emissions keyed by GPC reference number.",
    )

    @model_validator(mode="after")
    def _validate_total_emissions_signs(self) -> FrontendCityEmissionsData:
        """
        Enforce GPC emissions sign rules on frontend activity rows.

        General rule:
        - non-AFOLU GPC keys may be zero or positive only

        AFOLU exception:
        - `V.*` may be negative, zero, or positive
        """
        for gpc_reference_number, gpc_entry in self.gpcData.items():
            is_afolu = gpc_reference_number.startswith("V.")
            for activity_index, activity in enumerate(gpc_entry.activities):
                if activity.totalEmissions is None:
                    continue
                if activity.totalEmissions < 0 and not is_afolu:
                    raise ValueError(
                        "cityEmissionsData.gpcData contains negative totalEmissions "
                        "outside AFOLU; only `V.*` may be negative "
                        f"(gpc_reference_number={gpc_reference_number}, "
                        f"activity_index={activity_index})"
                    )
        return self


class FrontendCityInput(BaseModel):
    """Single city payload within frontend prioritizer request."""

    model_config = ConfigDict(extra="forbid")

    locode: str = Field(min_length=1, description="UN/LOCODE for the city to rank actions for.")
    countryCode: str = Field(
        min_length=2,
        max_length=2,
        description="ISO 3166-1 alpha-2 country code.",
    )
    populationSize: int | None = Field(
        default=None,
        description="Optional caller-supplied population override for the city.",
    )
    excludedActionIds: list[str] = Field(
        default_factory=list,
        description="Confirmed action IDs to exclude from ranking.",
    )
    weightsOverride: dict[str, float] | None = Field(
        default=None,
        description="Optional override for impact/alignment/feasibility weights.",
    )
    cityStrategicPreferenceSectors: list[str] = Field(
        default_factory=list,
        description="Selected sector tags the city wants to prioritize.",
    )
    cityStrategicPreferenceTimeframes: list[
        Literal["short", "medium", "long", "no_preference"]
    ] = Field(
        default_factory=lambda: ["no_preference"],
        description="Preferred implementation timeframes for ranked actions.",
    )
    cityStrategicPreferenceCoBenefitKeys: list[str] = Field(
        default_factory=list,
        description="Selected co-benefit keys the city wants to prioritize.",
    )
    cityEmissionsData: FrontendCityEmissionsData = Field(
        description="Caller-supplied city emissions payload used by impact scoring."
    )

    @field_validator("cityStrategicPreferenceSectors")
    @classmethod
    def _validate_city_preference_sectors(cls, values: list[str]) -> list[str]:
        """Validate that city preferred sectors use the supported taxonomy only."""
        return _validate_allowed_string_list(
            values=values,
            field_name="cityStrategicPreferenceSectors",
            allowed_values=ALLOWED_SECTOR_TAGS,
        )

    @field_validator("cityStrategicPreferenceCoBenefitKeys")
    @classmethod
    def _validate_city_preference_co_benefit_keys(
        cls, values: list[str]
    ) -> list[str]:
        """Validate that selected co-benefits use the supported taxonomy only."""
        return _validate_allowed_string_list(
            values=values,
            field_name="cityStrategicPreferenceCoBenefitKeys",
            allowed_values=set(ALLOWED_CO_BENEFIT_KEYS),
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
            # Keep caller-provided values as-is so unexpected spellings,
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
    """RequestData section of the caller prioritizer request payload."""

    model_config = ConfigDict(extra="forbid")

    requestedLanguages: list[str] = Field(
        default_factory=lambda: ["en"],
        description="Languages to include in the explanation output. English is always canonical.",
    )
    topN: int | None = Field(
        default=None,
        ge=1,
        description="Optional number of top-ranked actions to return per city.",
    )
    createExplanations: bool = Field(
        default=False,
        description="Whether to generate qualitative explanations after ranking.",
    )
    cityDataList: list[FrontendCityInput] = Field(
        min_length=1,
        description="One or more city inputs to prioritize within the same request.",
    )

    @field_validator("requestedLanguages", mode="before")
    @classmethod
    def _normalize_requested_languages(cls, value: object) -> object:
        """Normalize missing/empty requested languages to a single English default."""
        if value is None:
            return ["en"]
        if not isinstance(value, list):
            return value

        normalized_languages = [
            str(item).strip().lower() for item in value if str(item).strip()
        ]
        if not normalized_languages:
            return ["en"]
        return list(dict.fromkeys(normalized_languages))


class PrioritizerApiRequest(BaseModel):
    """Caller -> hiap-meed request envelope for single or multi-city prioritization."""

    model_config = ConfigDict(extra="forbid")

    meta: FrontendRequestMeta = Field(description="Caller request metadata envelope.")
    requestData: PrioritizerRequestData = Field(
        description="Prioritization request payload."
    )


# ============================================================================
# EXPLANATION TRANSLATION REQUEST/RESPONSE MODELS (caller -> hiap-meed)
# ----------------------------------------------------------------------------
# Composition:
# - ExplanationTranslationApiRequest
#   - meta: FrontendRequestMeta
#     - apiContext: FrontendApiContext
#   - requestData: ExplanationTranslationRequestData
#     - rankedActions: list[ExplanationTranslationActionInput]
# - ExplanationTranslationApiResponse
#   - translations: list[ExplanationTranslationResult]
# ============================================================================ 


class ExplanationTranslationActionInput(BaseModel):
    """One canonical explanation row provided for stateless translation."""

    model_config = ConfigDict(extra="forbid")

    actionId: str = Field(
        min_length=1,
        description="Action ID whose canonical explanation should be translated.",
    )
    canonicalExplanation: str = Field(
        min_length=1,
        description="Canonical English explanation text to translate from.",
    )


class ExplanationTranslationRequestData(BaseModel):
    """RequestData section for explanation translation requests."""

    model_config = ConfigDict(extra="forbid")

    sourceLanguage: str = Field(
        default="en",
        description="Source language label for canonical explanation text. Must be `en`.",
    )
    targetLanguages: list[str] = Field(
        min_length=1,
        description="Non-English language codes to translate the canonical explanations into.",
    )
    rankedActions: list[ExplanationTranslationActionInput] = Field(
        min_length=1,
        description="Canonical explanation rows to translate.",
    )

    @field_validator("sourceLanguage")
    @classmethod
    def _validate_source_language(cls, value: str) -> str:
        """Require canonical explanation inputs to be explicitly labeled English."""
        normalized = value.strip().lower()
        if normalized != "en":
            raise ValueError("sourceLanguage must be `en`")
        return normalized

    @field_validator("targetLanguages", mode="before")
    @classmethod
    def _normalize_target_languages(cls, value: object) -> object:
        """Normalize target languages and reject empty translation requests."""
        if not isinstance(value, list):
            return value
        normalized_languages = [
            str(item).strip().lower() for item in value if str(item).strip()
        ]
        return list(dict.fromkeys(normalized_languages))

    @field_validator("targetLanguages")
    @classmethod
    def _validate_target_languages(cls, value: list[str]) -> list[str]:
        """Ensure translation targets are non-empty and do not include English."""
        if not value:
            raise ValueError("targetLanguages must contain at least one language")
        if "en" in value:
            raise ValueError("targetLanguages must not include `en`")
        return value

    @model_validator(mode="after")
    def _validate_unique_ranked_action_ids(self) -> ExplanationTranslationRequestData:
        """Reject duplicate action IDs so translation rows cannot be collapsed silently."""
        seen_action_ids: set[str] = set()
        duplicate_action_ids: set[str] = set()
        for row in self.rankedActions:
            action_id = row.actionId
            if action_id in seen_action_ids:
                duplicate_action_ids.add(action_id)
                continue
            seen_action_ids.add(action_id)
        if duplicate_action_ids:
            raise ValueError(
                "rankedActions must not contain duplicate actionId values; "
                f"got duplicates {sorted(duplicate_action_ids)}"
            )
        return self


class ExplanationTranslationApiRequest(BaseModel):
    """Caller -> hiap-meed request envelope for stateless explanation translation."""

    model_config = ConfigDict(extra="forbid")

    meta: FrontendRequestMeta = Field(description="Caller request metadata envelope.")
    requestData: ExplanationTranslationRequestData = Field(
        description="Explanation translation request payload."
    )


# ============================================================================
# EXCLUSION PREVIEW REQUEST/RESPONSE MODELS (caller -> hiap-meed)
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

    model_config = ConfigDict(extra="forbid")

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

    model_config = ConfigDict(extra="forbid")

    cityDataList: list[ExclusionPreviewCityInput] = Field(min_length=1)


class ExclusionPreviewApiRequest(BaseModel):
    """Caller -> hiap-meed request envelope for exclusion preview."""

    model_config = ConfigDict(extra="forbid")

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
    """Summary of proposed exclusions grouped for caller review."""

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
#   - meta: CityApiMeta
#     - api_context: UpstreamApiContext
#   - city: CityApiItem
# - CitiesApiResponse
#   - meta: CityApiMeta
#   - cities: list[CityApiItem]
# - ActionPathwaysApiResponse
#   - meta: ActionPathwaysApiMeta
#     - api_context: ActionPathwaysApiContext
#   - actions: list[ActionPathwayApiItem]
#     - emissions: ActionPathwayImpactEntry
#     - co_benefits: dict[str, ActionPathwayCoBenefitEntry]
# - ActionPolicyScoresApiResponse
#   - meta: ActionPolicyScoresApiMeta
#   - scores: list[ActionPolicyScoreApiItem]
#     - policy_evidence: list[ActionPolicyEvidence]
# - ActionMitigationFeasibilityScoresApiResponse
#   - meta: ActionMitigationFeasibilityScoresApiMeta
#   - scores: list[ActionMitigationFeasibilityScoreApiItem]
# - ActionLegalAssessmentApiItem
# ============================================================================


class UpstreamApiContext(BaseModel):
    """Common API context metadata returned by upstream APIs."""

    model_config = ConfigDict(extra="ignore")

    endpoint: str
    locode: str | None = None
    version_label: str | None = None


class UpstreamMeta(BaseModel):
    """Common metadata envelope returned by upstream APIs."""

    model_config = ConfigDict(extra="ignore")

    generated_at_utc: str
    api_context: UpstreamApiContext
    backend_consumer: str | None = None
    upstream_provider: str | None = None
    total_records: int | None = None


class UpstreamDatasource(BaseModel):
    """One datasource entry attached to upstream city metadata."""

    model_config = ConfigDict(extra="ignore")

    datasource_name: str
    publisher_name: str | None = None
    publisher_url: str | None = None
    dataset_name: str | None = None
    dataset_url: str | None = None
    version_label: str | None = None
    released_at: str | None = None
    source_url: str | None = None
    is_latest: bool | None = None


class CityApiMeta(UpstreamMeta):
    """Metadata envelope returned by the upstream city attributes API."""

    api_context: UpstreamApiContext
    datasources: list[UpstreamDatasource] = Field(default_factory=list)


class CityIndicator(BaseModel):
    """Single city indicator object used in city API payload."""

    model_config = ConfigDict(extra="ignore")

    attribute_value: float | str | None = None
    attribute_units: str | None = None
    attribute_category: str | None = None
    datasource: str | None = None
    version_label: str | None = None


class CityApiItem(BaseModel):
    """City item shape returned by upstream `GET /api/v0/city_attributes/{locode}`."""

    model_config = ConfigDict(extra="ignore")

    city_name: str
    locode: str
    country_code: str | None = None
    region_name: str
    region_code: str
    population_size: int | None = Field(default=None, validation_alias="populationSize")
    population_density: float | None = Field(
        default=None, validation_alias="populationDensity"
    )
    area_km2: float | None = None
    population: CityIndicator | None = None
    disability_prevalence: CityIndicator | None = None
    unemployment_rate: CityIndicator | None = None
    renter_share: CityIndicator | None = None
    employment_agriculture_forestry: CityIndicator | None = None
    employment_construction: CityIndicator | None = None
    employment_electricity_gas: CityIndicator | None = None
    employment_in_transport_and_logistics: CityIndicator | None = None
    employment_manufacturing: CityIndicator | None = None
    employment_mining: CityIndicator | None = None
    employment_water_waste: CityIndicator | None = None
    electricity_access_rate: CityIndicator | None = None
    fixed_internet_household_share: CityIndicator | None = None
    indigenous_identification_rate: CityIndicator | None = None
    literacy_rate: CityIndicator | None = None
    mean_years_schooling: CityIndicator | None = None
    median_household_income: CityIndicator | None = None
    public_transport_share: CityIndicator | None = None
    poverty_rate: CityIndicator | None = None
    home_ownership: CityIndicator | None = None


class ActionPathwayImpactEntry(BaseModel):
    """Single emissions impact entry for one action pathways row."""

    model_config = ConfigDict(extra="ignore")

    sector_number: str = Field(validation_alias="sectorNumber")
    subsector_number: list[int] = Field(
        min_length=1,
        validation_alias="subsectorNumber",
    )
    gpc_reference_number: list[str] = Field(validation_alias="gpcReferenceNumber")
    impact_relationship: str | None = Field(
        default=None,
        validation_alias="impactRelationship",
    )
    impact_text: str | None = Field(
        default=None,
        validation_alias="impactText",
    )
    impact_numeric: int | None = Field(
        default=None,
        validation_alias="impactNumeric",
    )
    methodology: str | None = None

    @field_validator("subsector_number")
    @classmethod
    def _validate_subsector_number_list(cls, value: list[int]) -> list[int]:
        """Ensure subsector_number uses a deduplicated positive integer list."""
        deduplicated_values = list(dict.fromkeys(value))
        invalid_values = [item for item in deduplicated_values if item <= 0]
        if invalid_values:
            raise ValueError(
                "subsector_number must contain only positive integers, "
                f"got invalid values {invalid_values}"
        )
        return deduplicated_values


class ActionPathwayCoBenefitEntry(BaseModel):
    """Single co-benefit entry for one action pathways row."""

    model_config = ConfigDict(extra="ignore")

    impact_relationship: str | None = Field(
        default=None,
        validation_alias="impactRelationship",
    )
    impact_text: str | None = Field(
        default=None,
        validation_alias="impactText",
    )
    impact_numeric: int | None = Field(
        default=None,
        validation_alias="impactNumeric",
    )
    methodology: str | None = None


class ActionPathwayApiItem(BaseModel):
    """Action row shape returned by upstream `GET /api/v1/action-pathways`."""

    model_config = ConfigDict(extra="ignore")

    action_id: str = Field(validation_alias="actionId")
    action_type: str = Field(default="mitigation", validation_alias="actionType")
    action_name: str = Field(validation_alias="actionName")
    description: str | None = None
    intervention_summary: str | None = Field(
        default=None,
        validation_alias="interventionSummary",
    )
    outcome_summary: str | None = Field(default=None, validation_alias="outcomeSummary")
    intervention_type: str | None = Field(
        default=None,
        validation_alias="interventionType",
    )
    action_role: str | None = Field(default=None, validation_alias="actionRole")
    cost_investment_needed: str | None = Field(
        default=None,
        validation_alias="costInvestmentNeeded",
    )
    timeline_for_implementation: str | None = Field(
        default=None,
        validation_alias="timelineForImplementation",
    )
    co_benefits: dict[str, ActionPathwayCoBenefitEntry] = Field(
        default_factory=dict,
        validation_alias="coBenefits",
    )
    emissions: ActionPathwayImpactEntry | None = None
    publisher_id: str | None = Field(default=None, validation_alias="publisherId")
    generation_method: str | None = Field(
        default=None,
        validation_alias="generationMethod",
    )
    name_i18n: dict[str, str] = Field(default_factory=dict, validation_alias="nameI18n")
    description_i18n: dict[str, str] = Field(
        default_factory=dict,
        validation_alias="descriptionI18n",
    )
    intervention_summary_i18n: dict[str, str] = Field(
        default_factory=dict,
        validation_alias="interventionSummaryI18n",
    )
    outcome_summary_i18n: dict[str, str] = Field(
        default_factory=dict,
        validation_alias="outcomeSummaryI18n",
    )

    @model_validator(mode="after")
    def _validate_emissions_impact_text_band_present(self) -> ActionPathwayApiItem:
        """Validate emissions impact includes a non-empty, known text band."""
        emissions_entry = self.emissions
        if emissions_entry is None:
            return self

        impact_text = emissions_entry.impact_text
        if impact_text is None or not impact_text.strip():
            raise ValueError(f"Action `{self.action_id}` is missing emissions.impact_text")
        # Validate that the text band can be resolved by configured impact mapping.
        resolve_impact_text_multiplier(impact_text)
        return self

    @model_validator(mode="after")
    def _validate_co_benefit_impact_numeric_range(self) -> ActionPathwayApiItem:
        """Validate co-benefit numeric impact values stay within `[-2, 2]`."""
        for co_benefit_key, co_benefit_entry in self.co_benefits.items():
            impact_numeric = co_benefit_entry.impact_numeric
            if impact_numeric is None:
                continue
            if impact_numeric < -2 or impact_numeric > 2:
                raise ValueError(
                    "Action "
                    f"`{self.action_id}` has coBenefits.{co_benefit_key}.impact_numeric="
                    f"{impact_numeric} outside allowed range [-2, 2]"
                )
        return self


class CityApiResponse(BaseModel):
    """Response model for `GET /api/v0/city_attributes/{locode}`."""

    model_config = ConfigDict(extra="ignore")

    meta: CityApiMeta
    city: CityApiItem


class CitiesApiResponse(BaseModel):
    """Response model for city list endpoints."""

    model_config = ConfigDict(extra="ignore")

    meta: CityApiMeta
    cities: list[CityApiItem] = Field(default_factory=list)


class ActionPathwaysApiContext(BaseModel):
    """API context metadata returned by the action pathways endpoint."""

    model_config = ConfigDict(extra="ignore")

    endpoint: str


class ActionPathwaysApiMeta(BaseModel):
    """Metadata envelope returned by the action pathways endpoint."""

    model_config = ConfigDict(extra="ignore")

    generated_at_utc: str | None = Field(default=None, validation_alias="generatedAtUtc")
    backend_consumer: str | None = Field(default=None, validation_alias="backendConsumer")
    upstream_provider: str | None = Field(default=None, validation_alias="upstreamProvider")
    api_context: ActionPathwaysApiContext | None = Field(
        default=None,
        validation_alias="apiContext",
    )
    total_records: int | None = Field(default=None, validation_alias="totalRecords")


class ActionPathwaysApiResponse(BaseModel):
    """Response model for `GET /api/v1/action-pathways`."""

    model_config = ConfigDict(extra="ignore")

    meta: ActionPathwaysApiMeta
    actions: list[ActionPathwayApiItem] = Field(default_factory=list)


class ActionPolicyScoresApiContext(BaseModel):
    """API context metadata returned by the action policy scores endpoint."""

    model_config = ConfigDict(extra="ignore")

    endpoint: str
    locode: str
    city_name: str | None = None
    release_id: str | None = None
    top_evidence_limit: int | None = None
    src_action_id: str | None = None


class ActionPolicyScoresApiMeta(UpstreamMeta):
    """Metadata envelope returned by the action policy scores endpoint."""

    api_context: ActionPolicyScoresApiContext
    total_evidence_items: int | None = None
    scoring_rubric_version: str | None = None
    spatial_document_coverage: dict[str, object] | None = None


class ActionPolicyEvidence(BaseModel):
    """One ranked evidence row returned by the action policy scores endpoint."""

    model_config = ConfigDict(extra="ignore")

    evidence_rank: int
    signal_type: str | None = None
    signal_relation: str | None = None
    signal_strength: str | None = None
    document_name: str | None = None
    document_type: str | None = None
    doc_relevance: str | None = None
    explicitness: str | None = None
    page: int | None = None
    evidence_strength: float | None = None
    evidence_text: str | None = None


class ActionPolicyScoreApiItem(BaseModel):
    """Single action score row returned by the action policy scores endpoint."""

    model_config = ConfigDict(extra="ignore")

    src_action_id: str
    policy_support_score: float | None = Field(default=None, ge=0.0, le=1.0)
    policy_support_category: str | None = None
    best_relevance: str | None = None
    n_findings: int | None = None
    n_docs: int | None = None
    sum_strength: float | None = None
    policy_evidence: list[ActionPolicyEvidence] = Field(default_factory=list)


class ActionPolicyScoresApiResponse(BaseModel):
    """Response model for city-scoped action policy scores endpoint."""

    model_config = ConfigDict(extra="ignore")

    meta: ActionPolicyScoresApiMeta
    scores: list[ActionPolicyScoreApiItem] = Field(default_factory=list)


class ActionMitigationFeasibilityScoresApiMeta(BaseModel):
    """Metadata envelope returned by the mitigation feasibility scores endpoint."""

    model_config = ConfigDict(extra="ignore")

    generated_at_utc: str | None = None
    endpoint: str | None = None
    locode: str | None = None
    country_code: str | None = None
    release_id: str | None = None
    src_action_id: str | None = None
    total_records: int | None = None


class ActionMitigationFeasibilityScoreApiItem(BaseModel):
    """Single score row returned by the mitigation feasibility scores endpoint."""

    model_config = ConfigDict(extra="ignore")

    locode: str
    src_action_id: str
    global_mitigation_option: str | None = None
    action_mapping_strength: str | None = None
    option_family: str | None = None
    action_score: float | None = Field(default=None, ge=0.0, le=1.0)
    n_feasibility_dimensions: int | None = None
    dimension_scores: dict[str, float] = Field(default_factory=dict)
    breakdown: dict[str, object] = Field(default_factory=dict)
    rank_within_city: int | None = None


class ActionMitigationFeasibilityScoresApiResponse(BaseModel):
    """Response model for city-scoped mitigation feasibility scores endpoint."""

    model_config = ConfigDict(extra="ignore")

    meta: ActionMitigationFeasibilityScoresApiMeta
    scores: list[ActionMitigationFeasibilityScoreApiItem] = Field(default_factory=list)


class ActionFinancialFeasibilityScoresApiMeta(BaseModel):
    """Metadata envelope returned by the financial feasibility scores endpoint."""

    model_config = ConfigDict(extra="ignore")

    generated_at_utc: str | None = None
    endpoint: str | None = None
    locode: str | None = None
    country_code: str | None = None
    caveat: str | None = None
    filters: dict[str, object] = Field(default_factory=dict)
    total_records: int | None = None


class ActionFinancialFeasibilityScoreApiItem(BaseModel):
    """Single score row returned by the financial feasibility scores endpoint."""

    model_config = ConfigDict(extra="ignore")

    action_id: str
    action_name: str | None = None
    sector: str | None = None
    financial_feasibility: float | None = Field(default=None, ge=0.0, le=1.0)
    route: str | None = None
    reason: str | None = None
    inputs: dict[str, Any] = Field(default_factory=dict)
    links: dict[str, Any] = Field(default_factory=dict)


class ActionFinancialFeasibilityScoresApiResponse(BaseModel):
    """Response model for city-scoped financial feasibility scores endpoint."""

    model_config = ConfigDict(extra="ignore")

    meta: ActionFinancialFeasibilityScoresApiMeta
    data: list[ActionFinancialFeasibilityScoreApiItem] = Field(default_factory=list)


class ActionLegalAssessmentApiItem(BaseModel):
    """Flat legal assessment row returned by `GET /api/v1/action-legal-assessments`."""

    model_config = ConfigDict(extra="ignore")

    legal_analysis_id: str = Field(validation_alias="legalAnalysisId")
    src_action_id: str = Field(validation_alias="srcActionId")
    country_code: str = Field(validation_alias="countryCode")
    gpc_sector: str | None = Field(default=None, validation_alias="gpcSector")
    verdict_category: str | None = Field(default=None, validation_alias="verdictCategory")
    verdict_score: float | None = Field(
        default=None,
        ge=0.0,
        le=1.0,
        validation_alias="verdictScore",
    )
    ownership_category: str | None = Field(default=None, validation_alias="ownershipCategory")
    ownership_score: float | None = Field(
        default=None,
        ge=0.0,
        le=1.0,
        validation_alias="ownershipScore",
    )
    ownership_weight: float | None = Field(default=None, validation_alias="ownershipWeight")
    ownership_description: str | None = Field(
        default=None,
        validation_alias="ownershipDescription",
    )
    restrictions_category: str | None = Field(
        default=None,
        validation_alias="restrictionsCategory",
    )
    restrictions_score: float | None = Field(
        default=None,
        ge=0.0,
        le=1.0,
        validation_alias="restrictionsScore",
    )
    restrictions_weight: float | None = Field(
        default=None,
        validation_alias="restrictionsWeight",
    )
    restrictions_description: str | None = Field(
        default=None,
        validation_alias="restrictionsDescription",
    )
    legal_justification: str | None = Field(
        default=None,
        validation_alias="legalJustification",
    )
    analysis_date: str | None = Field(default=None, validation_alias="analysisDate")
    generation_method: str | None = Field(default=None, validation_alias="generationMethod")
    legal_references: list[str] = Field(
        default_factory=list,
        validation_alias="legalReferences",
    )
    release_id: str | None = Field(default=None, validation_alias="releaseId")
    created_at: str | None = Field(default=None, validation_alias="createdAt")
    updated_at: str | None = Field(default=None, validation_alias="updatedAt")
    ownership_description_i18n: dict[str, str] = Field(
        default_factory=dict,
        validation_alias="ownershipDescriptionI18n",
    )
    restrictions_description_i18n: dict[str, str] = Field(
        default_factory=dict,
        validation_alias="restrictionsDescriptionI18n",
    )
    legal_justification_i18n: dict[str, str] = Field(
        default_factory=dict,
        validation_alias="legalJustificationI18n",
    )


class RankedActionImpactEvidenceSummary(BaseModel):
    """Compact impact evidence snapshot returned for one ranked action."""

    impact_block_score: float = Field(
        description="Overall Impact block score for this action."
    )
    matched_city_subsector_keys_count: int = Field(
        description="Number of city subsector keys matched by this action."
    )
    emissions_reduction_component_score: float = Field(
        description="Normalized emissions reduction component score."
    )
    timeline_component_score: float = Field(
        description="Normalized implementation timeline component score."
    )


class RankedActionAlignmentEvidenceSummary(BaseModel):
    """Compact alignment evidence snapshot returned for one ranked action."""

    alignment_score: float = Field(description="Overall Alignment block score.")
    policy_component_score: float = Field(
        description="Normalized policy support component score."
    )
    sector_component_score: float = Field(
        description="Normalized sector preference component score."
    )
    co_benefit_component_score: float = Field(
        description="Normalized co-benefit preference component score."
    )
    timeframe_component_score: float = Field(
        description="Normalized timeframe preference component score."
    )


class RankedActionFeasibilityLegalEvidence(BaseModel):
    """Compact legal feasibility evidence for one ranked action."""

    assessment_present: bool = Field(
        description="Whether a legal assessment row was available for this action."
    )
    assessment_missing: bool = Field(
        description="Whether the legal component used a missing-row fallback."
    )
    verdict_category: str | None = Field(
        default=None,
        description="Legal verdict category when a legal assessment row exists.",
    )
    component_score: float = Field(
        description="Normalized legal feasibility component score."
    )
    component_source: str | None = Field(
        default=None,
        description="Source used for the legal component score.",
    )


class RankedActionFeasibilityMitigationEvidence(BaseModel):
    """Compact mitigation feasibility evidence for one ranked action."""

    component_score: float = Field(
        description="Normalized mitigation feasibility component score."
    )
    component_source: str | None = Field(
        default=None,
        description="Source used for the mitigation feasibility component score.",
    )
    score_present: bool = Field(
        description="Whether a mitigation feasibility row was available."
    )
    score_missing: bool = Field(
        description="Whether the mitigation feasibility component used a missing-row fallback."
    )


class RankedActionFeasibilityFinancialEvidence(BaseModel):
    """Compact financial feasibility evidence for one ranked action."""

    component_score: float = Field(
        description="Normalized financial feasibility component score."
    )
    component_source: str | None = Field(
        default=None,
        description="Source used for the financial feasibility component score.",
    )
    score_present: bool = Field(
        description="Whether a financial feasibility row was available."
    )
    score_missing: bool = Field(
        description="Whether the financial feasibility component used a missing-row fallback."
    )
    route: str | None = Field(
        default=None,
        description="Qualitative financing route label when present.",
    )
    reason: str | None = Field(
        default=None,
        description="Human-readable reason for the financing route when present.",
    )
    sector: str | None = Field(
        default=None,
        description="Financial feasibility sector used by the upstream service.",
    )


class RankedActionFeasibilityEvidenceSummary(BaseModel):
    """Compact grouped feasibility evidence snapshot returned for one ranked action."""

    feasibility_score: float = Field(description="Overall Feasibility block score.")
    legal: RankedActionFeasibilityLegalEvidence = Field(
        description="Grouped legal feasibility evidence."
    )
    mitigation_feasibility: RankedActionFeasibilityMitigationEvidence = Field(
        description="Grouped mitigation feasibility evidence."
    )
    financial_feasibility: RankedActionFeasibilityFinancialEvidence = Field(
        description="Grouped financial feasibility evidence."
    )


class RankedActionEvidenceSummary(BaseModel):
    """Compact public evidence snapshot used to explain one ranked action."""

    impact: RankedActionImpactEvidenceSummary = Field(
        description="Compact Impact block evidence snapshot."
    )
    alignment: RankedActionAlignmentEvidenceSummary = Field(
        description="Compact Alignment block evidence snapshot."
    )
    feasibility: RankedActionFeasibilityEvidenceSummary = Field(
        description="Compact Feasibility block evidence snapshot."
    )


class PrioritizationCounts(BaseModel):
    """Stable action-count summary returned in prioritization metadata."""

    total_actions: int = Field(description="Total actions fetched before filtering.")
    valid_actions: int = Field(description="Actions remaining after hard filters.")
    discarded_excluded: int = Field(
        description="Actions discarded due to confirmed caller exclusions."
    )
    discarded_legal: int = Field(
        description="Actions discarded due to blocked legal feasibility."
    )
    ranked_actions: int = Field(description="Number of ranked actions returned.")


class PrioritizationWeights(BaseModel):
    """Resolved weighting configuration returned in prioritization metadata."""

    impact: float = Field(description="Resolved Impact pillar weight.")
    alignment: float = Field(description="Resolved Alignment pillar weight.")
    feasibility: float = Field(description="Resolved Feasibility pillar weight.")


class PrioritizationExplanationMetadata(BaseModel):
    """Explanation-generation summary returned in prioritization metadata."""

    requested: bool = Field(
        description="Whether the caller requested explanation generation."
    )
    generated: int = Field(
        description="Number of ranked actions with generated canonical explanations."
    )
    requested_languages: list[str] = Field(
        default_factory=list,
        description="Languages requested by the caller for explanations.",
    )
    canonical_language: str = Field(
        description="Canonical source language used for explanation generation."
    )
    generated_languages: list[str] = Field(
        default_factory=list,
        description="Languages actually present in the returned explanations payload.",
    )
    translation_warnings: list[str] = Field(
        default_factory=list,
        description="Human-readable warnings from explanation translation.",
    )


class HardFilterEvidenceSummary(BaseModel):
    """Per-action hard-filter evidence returned in prioritization metadata."""

    model_config = ConfigDict(extra="allow")

    discard_reason: str | None = Field(
        default=None,
        description="Hard-filter discard reason when the action was removed.",
    )
    legal_assessment_present: bool | None = Field(
        default=None,
        description="Whether the hard filter saw a legal assessment row for the action.",
    )
    legal_verdict_category: str | None = Field(
        default=None,
        description="Legal verdict category observed by the hard filter when present.",
    )


class PrioritizationMetadata(BaseModel):
    """Stable diagnostics and response metadata returned for one prioritized city."""

    model_config = ConfigDict(extra="allow")

    locode: str = Field(description="UN/LOCODE for the ranked city.")
    internal_request_id: str = Field(
        description="Backend-generated internal request identifier."
    )
    frontend_request_id: str | None = Field(
        default=None,
        description="Caller-generated request identifier echoed for correlation.",
    )
    counts: PrioritizationCounts = Field(
        description="Stable action counts across the prioritization pipeline."
    )
    weights: PrioritizationWeights = Field(
        description="Resolved prioritization weights used for scoring."
    )
    timings: dict[str, float] = Field(
        default_factory=dict,
        description="Elapsed seconds keyed by pipeline stage name.",
    )
    explanations: PrioritizationExplanationMetadata = Field(
        description="Explanation-generation and translation metadata."
    )
    hard_filter_evidence_by_action_id: dict[str, HardFilterEvidenceSummary] = Field(
        default_factory=dict,
        description="Per-action hard-filter evidence keyed by action ID.",
    )


class PrioritizationResponse(BaseModel):
    """Per-city prioritization output used by the API response."""

    ranked_action_ids: list[str] = Field(default_factory=list)
    ranked_actions: list[RankedActionResult] = Field(default_factory=list)
    metadata: PrioritizationMetadata = Field(
        description="Stable diagnostics and metadata for the ranked city."
    )
    warnings: list[str] = Field(default_factory=list)


class RankedActionResult(BaseModel):
    """Public ranked action payload returned to API consumers."""

    action_id: str = Field(description="Stable action identifier.")
    rank: int = Field(description="Competitive rank position within the returned top-N set.")
    final_score: float = Field(description="Final weighted prioritization score.")
    impact_score: float = Field(description="Impact block score.")
    alignment_score: float = Field(description="Alignment block score.")
    feasibility_score: float = Field(description="Feasibility block score.")
    evidence_summary: RankedActionEvidenceSummary = Field(
        description="Compact public evidence snapshot used to explain the ranking.",
    )
    explanations: dict[str, str] = Field(
        default_factory=dict,
        description="Explanation texts keyed by language code.",
    )


class ExplanationTranslationResult(BaseModel):
    """Translated explanation rows returned by the translation endpoint."""

    actionId: str = Field(description="Action ID for the translated explanation row.")
    explanations: dict[str, str] = Field(
        default_factory=dict,
        description="Translated explanation texts keyed by requested target language code.",
    )


class ExplanationTranslationApiResponse(BaseModel):
    """Top-level response for the stateless explanation translation endpoint."""

    translations: list[ExplanationTranslationResult] = Field(
        default_factory=list,
        description="Translated explanation rows, one per requested action.",
    )
    warnings: list[str] = Field(
        default_factory=list,
        description="Top-level human-readable warnings aggregated by the backend.",
    )


class PrioritizerApiCityResult(BaseModel):
    """One city result entry returned by the prioritization endpoint."""

    locode: str = Field(min_length=1, description="UN/LOCODE for the ranked city.")
    ranked_action_ids: list[str] = Field(
        default_factory=list,
        description="Ordered action IDs returned for this city.",
    )
    ranked_actions: list[RankedActionResult] = Field(
        default_factory=list,
        description="Detailed ranked actions with scores, evidence, and explanations.",
    )
    metadata: PrioritizationMetadata = Field(
        description="Diagnostics, timings, counts, and artifact-oriented metadata.",
    )
    warnings: list[str] = Field(
        default_factory=list,
        description="Top-level warnings for this city's explanation/translation flow.",
    )


class PrioritizerApiResponse(BaseModel):
    """Top-level response for the caller prioritization request envelope."""

    results: list[PrioritizerApiCityResult] = Field(
        default_factory=list,
        description="One prioritization result entry per requested city.",
    )


