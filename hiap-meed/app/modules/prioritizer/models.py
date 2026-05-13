"""
Pydantic models for external API payloads and top-level endpoint contracts.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.modules.prioritizer.config import resolve_impact_text_multiplier
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

    endpoint: str = Field(description="Caller route or endpoint that originated the request.")
    locodes: list[str] = Field(
        default_factory=list,
        description="One or more UN/LOCODE values included in the request context.",
    )


class FrontendRequestMeta(BaseModel):
    """Metadata envelope for prioritizer requests sent by the current caller."""

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

    activityType: str | None = None
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
    """City emissions payload provided by the caller request."""

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
    """Caller -> hiap-meed request envelope for exclusion preview."""

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
#     - coBenefits: dict[str, ActionCoBenefitEntry]
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
    version_label: str | None = None


class UpstreamMeta(BaseModel):
    """Common metadata envelope returned by upstream APIs."""

    generated_at_utc: str
    api_context: UpstreamApiContext
    backend_consumer: str | None = None
    upstream_provider: str | None = None
    total_records: int | None = None


class UpstreamDatasource(BaseModel):
    """One datasource entry attached to upstream city metadata."""

    datasource_name: str
    publisher_name: str | None = None
    publisher_url: str | None = None
    dataset_name: str | None = None
    dataset_url: str | None = None
    version_label: str | None = None
    released_at: str | None = None
    source_url: str | None = None
    is_latest: bool | None = None


class CityApiMeta(BaseModel):
    """Exact metadata envelope returned by the upstream city attributes API."""

    generated_at_utc: str
    api_context: UpstreamApiContext
    datasources: list[UpstreamDatasource] = Field(default_factory=list)


class CityIndicator(BaseModel):
    """Single city indicator object used in city API payload."""

    attribute_value: float | str | None = None
    attribute_units: str | None = None
    attribute_category: str | None = None
    datasource: str | None = None
    version_label: str | None = None


class CityApiItem(BaseModel):
    """City item shape returned by upstream `GET /api/v0/city_attributes/{locode}`."""

    city_name: str
    locode: str
    country_code: str | None = None
    region_name: str
    region_code: str
    population_size: int | None = None
    population_density: float | None = None
    area_km2: float | None = None
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
    subsector_number: list[int] = Field(min_length=1)
    gpc_reference_number: list[str]
    impact_relationship: str | None = None
    impact_text: str | None = None
    impact_numeric: int | None = None
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


class ActionCoBenefitEntry(BaseModel):
    """Single co-benefit entry for one action."""

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
    activity_type_description: str | None = None
    description: str | None = None
    actionCategory: str | None = None
    actionSubcategory: str | None = None
    costInvestmentNeeded: str | None = None
    timelineForImplementation: str | None = None
    coBenefits: dict[str, ActionCoBenefitEntry] = Field(default_factory=dict)
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
    """Response model for `GET /api/v0/city_attributes/{locode}`."""

    meta: CityApiMeta
    city: CityApiItem


class CitiesApiResponse(BaseModel):
    """Response model for city list endpoints."""

    meta: CityApiMeta
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
    warnings: list[str] = Field(default_factory=list)


class RankedActionResult(BaseModel):
    """Public ranked action payload returned to API consumers."""

    action_id: str = Field(description="Stable action identifier.")
    rank: int = Field(description="Competitive rank position within the returned top-N set.")
    final_score: float = Field(description="Final weighted prioritization score.")
    impact_score: float = Field(description="Impact block score.")
    alignment_score: float = Field(description="Alignment block score.")
    feasibility_score: float = Field(description="Feasibility block score.")
    evidence_summary: dict[str, object] = Field(
        default_factory=dict,
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
    metadata: dict[str, object] = Field(
        default_factory=dict,
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


