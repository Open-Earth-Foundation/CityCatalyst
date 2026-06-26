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

Raw exclusion preferences live in `prioritizer_exclusion_preview_request_mock.json`,
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

It is being used to fetch basic city context data. The payload can also include broader city indicator fields retained for compatibility with the upstream city attributes contract.

The general logic is that this is the baseline and values might be updated by the city user via the frontend request.

This mock follows the active upstream city attributes schema:

- `GET /api/v0/city_attributes/{locode}`
- city fields such as `city_name`, `country_code`, `populationSize`, `populationDensity`, and `area_km2`
- a `population` indicator object in addition to the top-level population fields
- optional city indicator objects retained for compatibility with the upstream city attributes contract
- the current city response DTOs still accept the camelCase population aliases and ignore unexpected extra keys

# action_pathways_api_mock.json:

This is a mock response from the actions data API.
It simulates a response from the actions data API containing information about the actions.
The upstream provider is the global-api.

It is being used to fetch the list of actions and their associated emissions, co-benefits, and TEF metadata.

This payload shape is modeled by:
- `ActionPathwaysApiResponse` (envelope)
- `ActionPathwayApiItem` (`actions[]`)

Action API note:

- This mock matches `GET /api/v1/action-pathways` with no query parameters.
- It includes the action fields used by the current prioritization flow and action-pathways client.
- The prioritization pipeline keeps mitigation actions only; current mock rows are mitigation actions.

# action_mitigation_feasibility_scores_api_mock.json:

Mock for GET /api/v1/cities/{locode}/action-mitigation-feasibility-scores.
Mitigation feasibility scores are city-scoped and provide the feasibility input
used in Feasibility scoring.

It includes:

- envelope metadata (`meta.generated_at_utc`, `meta.locode`, `meta.country_code`, `meta.release_id`)
- `scores[]` rows keyed by `src_action_id`
- `action_score` used as the mitigation feasibility component
- optional dimension detail (`dimension_scores`, `breakdown`) retained for artifacts and explainability evidence

Missing action rows are expected for unmapped actions and score neutrally as `0.5`.

# action_financial_feasibility_scores_api_mock.json:

Mock for GET /api/v1/cities/{locode}/climate-finance/feasibility.
Financial feasibility scores are city-scoped and provide the climate-finance
input used in Feasibility scoring.

It includes:

- envelope metadata (`meta.generated_at_utc`, `meta.endpoint`, `meta.locode`, `meta.country_code`, `meta.total_records`)
- `data[]` rows keyed by `action_id`
- `financial_feasibility` used as the financial feasibility component
- compact route and reason evidence retained for artifacts and explanation input
- link fields for optional follow-up detail/opportunity/project APIs that hiap-meed does not fetch in the first implementation

Missing action rows or missing `financial_feasibility` values are expected to score neutrally as `0.5`.

# action_policy_scores_api_mock.json:

Mock for GET /api/v1/cities/{locode}/action-policy-scores.
Action policy scores are city-scoped and use the live action policy scores schema.

It includes:

- scores: array of { src_action_id, policy_support_score, policy_evidence: [...] }
- each evidence row: evidence_rank, signal_type, signal_relation, signal_strength, document_name, document_type, doc_relevance, explicitness, page, evidence_strength, evidence_text
- policy_support_score: 0..1 score per action supplied by the upstream API
- meta.api_context, meta.total_records, meta.total_evidence_items, meta.spatial_document_coverage

This payload shape is modeled by:
- `ActionPolicyScoresApiResponse` (envelope)
- `ActionPolicyScoreApiItem` (`scores[]`)
- `ActionPolicyEvidence` (nested evidence rows)

# policy_framework_api_mock.json:

This is a mock response from a policy framework API.
It simulates policy context extracted from plans, targets, and budgets, and links this context to actions.
The upstream provider is the global-api.

It includes:

- policy context rows
- action to policy mapping records

# legal_api_mock.json:

This is a mock response from a legal framework API.
It simulates legal signals that define authority, enablement, restrictions, thresholds, and process requirements.
The upstream provider is the global-api.

It includes:

- legal signals scoped to national, regional, and municipal actors
- action to legal requirement mapping records with operator and strength

# actions_legal_api_mock.json:

Mock for `GET /api/v1/action-legal-assessments?countryCode=...`.
Returns the same flat list shape as the live legal assessments API.

It includes:

- one row per assessed action
- `srcActionId` for action mapping
- `countryCode` for country filtering
- `verdictCategory` for hard filtering
- `verdictScore` for the Feasibility legal component
- supporting evidence/debug fields such as `ownership*`, `restrictions*`, `legalJustification*`, and timestamps

# Legal mock coverage notes:

The flat legal mock now mirrors the live legal assessments API rather than the older requirement-based mock.

For ranking validation, the important cases are:

- rows with `verdictCategory = "blocked"` to exercise the hard filter
- rows with non-blocked categories and non-null `verdictScore`
- rows with `verdictScore = null` to exercise the neutral `0.5` fallback
- actions with no row at all for the selected country to exercise missing-coverage fallback

# projects_api_mock.json:

This is a mock response from a funded projects API.
It simulates funded projects and supporting evidence used to assess action feasibility, impact, and replicability.
The upstream provider is the global-api.

It includes:

- funded project core records
- project metrics and evidence
- optional supporting project tables (co-benefits, barriers, phases)
- action to funded project evidence links
