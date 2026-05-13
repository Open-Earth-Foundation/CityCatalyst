# prioritizer_request_mock.json:

This is a mock request for the prioritizer API.
It simulates a request from CityCatalyst frontend containing information provided by the city user via the frontend.

This payload shape is modeled by:
- `PrioritizerApiRequest` (envelope)
- `PrioritizerRequestData` (`requestData`)
- `FrontendCityInput` (`cityDataList[]`)

This includes:

- locode (city identifier for the prioritization request)
- population size (potentally updated value from the frontend - will override the value from the city context data API)
- excluded action IDs (confirmed by the user after the exclusion preview step)
- city strategic preference other (free text field to provide a strategic preference for the city)
- city strategic preference sector (list of sectors to prioritize)
- city strategic preference timeframes (list of preferred implementation horizons)
- city emissions data (emissions data for the city from CityCatalyst)

Single-city and multi-city requests use the same structure (`cityDataList`).
A single-city request is represented by exactly one item in `cityDataList`.

`meta.apiContext.endpoint` now reflects the current ranking API route:
- `POST /v1/prioritize`

# prioritizer_exclusion_preview_request_mock.json:

This is a mock request for API 1, the exclusion preview API.
It simulates the frontend sending raw exclusion preferences before the user confirms
the final `excludedActionIds` that are later sent to the ranking API.

This payload shape is modeled by:
- `ExclusionPreviewApiRequest` (envelope)
- `ExclusionPreviewRequestData` (`requestData`)
- `ExclusionPreviewCityInput` (`cityDataList[]`)

This includes:

- locode (city identifier for the exclusion preview request)
- excluded sector tags (strictly one of the supported sector taxonomy values)
- excluded co-benefit keys (strictly one of the supported co-benefit taxonomy values)
- excluded actions free text (optional free-text exclusion preference for guarded LLM matching)

`meta.apiContext.endpoint` reflects the preview route:
- `POST /v1/prioritize/exclusions/preview`

# prioritizer_bulk_request_mock.json:

This is the multi-city variant of the same frontend request contract. It uses
the same envelope and schema as `prioritizer_request_mock.json` but includes
more than one item in `cityDataList`.

Even for multiple cities, the current API route is still:
- `POST /v1/prioritize`

The old one-step flow, where raw exclusion free text was sent directly to the
ranking API, is no longer represented by the active mock request files. Raw
exclusion preferences now live in `prioritizer_exclusion_preview_request_mock.json`,
while ranking mocks use confirmed `excludedActionIds`.

# prioritizer_explanation_translation_request_mock.json:

This is a mock request for the explanation translation API.
It simulates the frontend sending canonical English explanations for
stateless translation into one or more requested target languages.

This payload shape is modeled by:
- `ExplanationTranslationApiRequest` (envelope)
- `ExplanationTranslationRequestData` (`requestData`)
- `ExplanationTranslationActionInput` (`rankedActions[]`)

This includes:

- source language (must currently be `en`)
- target languages (non-English translation targets)
- ranked actions with:
  - `actionId`
  - `canonicalExplanation`

`meta.apiContext.endpoint` reflects the translation route:
- `POST /v1/explanations/translate`

# city_api_mock.json:

This is a mock response from the city context data API.
It simulates a response from the city context data API containing information about the city.
The upstream provider is the global-api.

This payload shape is modeled by:
- `CityApiResponse` (envelope)
- `CityApiItem` (`city`)

It is being used to fetch basic city context data and also more specific city context data like unemployment rate, renter share, transport logistics employment, electricity access, industry construction employment, median household income, public transport share, poverty rate and home ownership.

The general logic is that this is the baseline and values might be updated by the city user via the frontend request.

This mock follows the active upstream city attributes schema:

- `GET /api/v0/city_attributes/{locode}`
- snake_case city fields such as `city_name`, `country_code`, `population_size`, `population_density`, and `area_km2`
- a `population` indicator object in addition to the top-level population fields
- all 9 socioeconomic indicator keys currently used by Feasibility
- strict city payload validation, so unexpected keys or wrong casing are rejected

# actions_api_mock.json:

This is a mock response from the actions data API.
It simulates a response from the actions data API containing information about the actions.
The upstream provider is the global-api.

It is being used to fetch the list of actions and their associated emissions, co-benefits, and socioeconomic indicator-fit data.

This payload shape is modeled by:
- `ActionsApiResponse` (envelope)
- `Action` (`actions[]`)

Future action API note:

- This mock still matches the current action contract used by this branch.
- It may include optional fields such as `biome`.
- When the future `GET /api/v1/action-pathways` payload replaces this mock, the strict action DTOs and this mock file should be updated together, including removing `biome` and aligning to the new payload field names.

# actions_policy_signals_api_mock.json:

Mock for GET /v1/cities/{locode}/policy-signals.
Policy signals filtered by city's location_scope/location_name (National Chile + Regional + Communal).

It includes:

- policy_signals: array of { action_id, policy_signals: [...], policy_support_score }
- each signal: location_scope, location_name, signal_type, signal_relation, signal_strength, evidence_ids, evidence_count
- policy_support_score: 0–1 score per action (relation × strength × scope multiplier, normalized)
- meta.locode, meta.comuna_name, meta.region_name

This payload shape is modeled by:
- `ActionsPolicySignalsApiResponse` (envelope)
- `PolicySignalByAction` (`policy_signals[]`)
- `PolicySignal` (nested signal rows)

# policy_framework_api_mock.json:

This is a mock response from a policy framework API.
It simulates policy signals extracted from plans, targets, and budgets, and links these signals to actions.
The upstream provider is the global-api.

It includes:

- policy signals (national, regional, municipal scopes)
- action to policy signal mapping records

# legal_api_mock.json:

This is a mock response from a legal framework API.
It simulates legal signals that define authority, enablement, restrictions, thresholds, and process requirements.
The upstream provider is the global-api.

It includes:

- legal signals scoped to national, regional, and municipal actors
- action to legal requirement mapping records with operator and strength

# actions_legal_api_mock.json:

Mock for GET /v1/actions/legal (or /v1/legal-requirements).
Returns action_id → legal alignment + evidence per action.

It includes:

- legal_requirements: array of { action_id, requirements: [...] }
- each requirement: signal_code, signal_name, required_value, legal_signal_value, strength, alignment_status, location_scope, location_name, evidence_ids, evidence_count
- meta.locode: null for now; can filter by city when city-scoped legal data exists

This payload shape is modeled by:
- `ActionsLegalApiResponse` (envelope)
- `LegalRequirementsByAction` (`legal_requirements[]`)
- `LegalRequirement` (nested requirement rows)

# actions_legal_api_mock_test_cases.json:

Test mock for ranking validation. Covers all alignment statuses (aligns, not_aligned, no_evidence) and strength types (mandatory, required, recommended, optional, informational).

| action_id | scenario | description |
|-----------|----------|-------------|
| c40_0010 | all_aligns | All requirements met (mandatory + required) |
| c40_0012 | mix_aligns_not_aligned | One aligns, one not_aligned |
| c40_0013 | mix_aligns_no_evidence | One aligns, one no_evidence |
| c40_0023 | mix_all_three | Aligns + not_aligned (recommended) + no_evidence |
| c40_0034 | all_not_aligned | Waste authority shared, not exclusive |
| c40_0040 | all_no_evidence | No legal signal found |
| c40_0037 | aligns_with_one_not_aligned | Subsidy cap exceeded (required) |
| ipcc_0074 | aligns_with_one_no_evidence | Planning aligns, PLANS_ALIGNMENT no_evidence (optional) |
| c40_0025 | mixed_strengths | mandatory + recommended + optional, all align |
| c40_0029 | all_strength_types | All 5 strength types with mixed alignment |

# projects_api_mock.json:

This is a mock response from a funded projects API.
It simulates funded projects and supporting evidence used to assess action feasibility, impact, and replicability.
The upstream provider is the global-api.

It includes:

- funded project core records
- project metrics and evidence
- optional supporting project tables (co-benefits, barriers, phases)
- action to funded project evidence links
