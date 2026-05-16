# Prioritization Pipeline Description

This document explains, in plain language, how the current `hiap-meed` service works.

The goal is to help a technical non-coder understand:

- which input fields actually influence the result,
- how the two API calls relate to each other,
- how each scoring block works,
- which weights are applied,
- what each block outputs,
- and which parts are still placeholders for future work.

This document is based on the checked-in mock payloads in `data/mock/`, especially:

- `prioritizer_exclusion_preview_request_mock.json`
- `prioritizer_request_mock.json`

## 0. The Two-API Flow

`hiap-meed` now has two related API calls:

1. Exclusion preview: `POST /v1/prioritize/exclusions/preview`
2. Ranking: `POST /v1/prioritize`

They serve different purposes.

### API 1: exclusion preview

This call is used before ranking.

Its job is to take raw exclusion preferences such as:

- sectors to avoid,
- co-benefits to avoid,
- and optional free-text exclusion wording,

and turn them into a reviewable list of proposed excluded actions.

The user or current caller frontend is then expected to decide which proposed exclusions should actually be confirmed.

### API 2: ranking

This call does not reinterpret raw exclusion preferences.

Instead, it accepts only confirmed action IDs in:

- `requestData.cityDataList[].excludedActionIds[]`

and removes those confirmed actions before scoring starts.

Important business meaning:

- API 1 proposes exclusions
- API 2 applies confirmed exclusions

There is no automatic state-sharing between the two calls. They are separate requests.

## 1. Data Sources That Influence the Result

The current implementation combines one caller-provided request with several supporting data files.

This section lists the fields that truly affect:

- exclusion preview,
- ranking,
- filtering,
- scoring,
- explanation generation,
- or the size of the final LLM prompts.

### Exclusion preview request

File:

- `data/mock/prioritizer_exclusion_preview_request_mock.json`

Fields that affect the result:

- `requestData.cityDataList[].locode`
- `requestData.cityDataList[].excludedSectorTags[]`
- `requestData.cityDataList[].excludedCoBenefitKeys[]`
- `requestData.cityDataList[].excludedActionsFreeText`

What these are used for:

- `locode` identifies which city request row is being processed.
- `excludedSectorTags[]` proposes exclusions based on action sector.
- `excludedCoBenefitKeys[]` proposes exclusions when an action has a negative effect on a selected co-benefit.
- `excludedActionsFreeText` is optional free text used for guarded LLM matching.

Validation rules:

- `excludedSectorTags[]` must use only:
  - `stationary_energy`
  - `transportation`
  - `waste`
  - `ippu`
  - `afolu`
- `excludedCoBenefitKeys[]` must use only:
  - `air_quality`
  - `cost_of_living`
  - `habitat`
  - `housing`
  - `mobility`
  - `stakeholder_engagement`
  - `water_quality`

### Caller request

File:

- `data/mock/prioritizer_request_mock.json`

Fields that affect the result:

- `requestData.topN`
- `requestData.cityDataList[].weightsOverride.impact`
- `requestData.cityDataList[].weightsOverride.alignment`
- `requestData.cityDataList[].weightsOverride.feasibility`
- `requestData.cityDataList[].excludedActionIds[]`
- `requestData.cityDataList[].cityStrategicPreferenceSectors[]`
- `requestData.cityDataList[].cityStrategicPreferenceTimeframes[]`
- `requestData.cityDataList[].cityStrategicPreferenceCoBenefitKeys[]`
- `requestData.cityDataList[].cityEmissionsData.gpcData.<reference>.activities[].totalEmissions`

What these are used for:

- `topN` controls how many ranked actions are returned.
- `weightsOverride` changes how much Impact, Alignment, and Feasibility matter in the final score.
- `weightsOverride` may be partial. Any missing keys are filled from the defaults before validation, and the resolved final `impact/alignment/feasibility` set must sum to `1.0`.
- `excludedActionIds[]` removes user-confirmed exclusions before scoring.
- `cityStrategicPreferenceSectors[]` influences the Alignment block.
- `cityStrategicPreferenceSectors[]` must use only:
  - `stationary_energy`
  - `transportation`
  - `waste`
  - `ippu`
  - `afolu`
- `cityStrategicPreferenceTimeframes[]` influences the Alignment block by comparing the city's preferred implementation horizon against each action's `timelineForImplementation`.
- `cityStrategicPreferenceCoBenefitKeys[]` influences the Alignment block directly through the supported co-benefit taxonomy.
- `cityStrategicPreferenceCoBenefitKeys[]` must use only:
  - `air_quality`
  - `cost_of_living`
  - `habitat`
  - `housing`
  - `mobility`
  - `stakeholder_engagement`
  - `water_quality`
- `cityStrategicPreferenceTimeframes[]` must use only:
  - `short`
  - `medium`
  - `long`
  - `no_preference`
- `no_preference` is allowed as a neutral choice but may not be combined with other timeframe values.
- `requestData.requestedLanguages` controls the explanation languages requested for post-ranking output.
- The backend always generates canonical English explanations first, then translates from English into each requested non-English target language.
- `totalEmissions` values are the main city emissions numbers used in the Impact block.
- `activityType` rows are preserved for future activity-data-level matching and diagnostics, but they do not currently change ranking output.

### City context data

File:

- `data/mock/city_api_mock.json`

Shape note:

- This mock now follows the upstream `GET /api/v0/city_attributes/{locode}` schema.
- The city payload uses fields such as `city_name`, `country_code`, `populationSize`, `populationDensity`, and `area_km2`.
- The city payload also includes a `population` indicator object alongside the top-level population fields.
- The current city response DTOs are intentionally lenient: they still accept the current camelCase population aliases and ignore unexpected extra keys.

Fields that affect the result:

- `city.unemployment_rate.attribute_category`
- `city.renter_share.attribute_category`
- `city.employment_in_transport_and_logistics.attribute_category`
- `city.electricity_access_rate.attribute_category`
- `city.industry_construction_employment.attribute_category`
- `city.median_household_income.attribute_category`
- `city.public_transport_share.attribute_category`
- `city.poverty_rate.attribute_category`
- `city.home_ownership.attribute_category`

What these are used for:

- These category labels feed the Feasibility block.
- They tell the system whether a city condition is very low, low, medium, high, or very high for a given socio-economic indicator.

### Action catalog

File:

- `data/mock/actions_api_mock.json`

Future contract note:

- This file still represents the current action mock/upstream shape used by this branch.
- It may include fields such as `biome` that are not expected in the future `GET /api/v1/action-pathways` payload.
- When that new action API is integrated, the action response DTOs and the mock action file should be updated together in one dedicated contract migration.

Fields that affect the result:

- `actions[].actionId`
- `actions[].actionName`
- `actions[].description`
- `actions[].actionCategory`
- `actions[].actionSubcategory`
- `actions[].coBenefits`
- `actions[].activity_type_description`
- `actions[].timelineForImplementation`
- `actions[].emissions.sector_number`
- `actions[].emissions.subsector_number[]`
- `actions[].emissions.gpc_reference_number[]`
- `actions[].emissions.impact_text`
- `actions[].socioeconomicIndicators[].indicator_key`
- `actions[].socioeconomicIndicators[].direction`
- `actions[].socioeconomicIndicators[].weight`

What these are used for:

- `actionId` identifies and sorts actions.
- `actionName`, `description`, `actionCategory`, and `actionSubcategory` are used in exclusion preview free-text matching.
- For the free-text preview prompt, the service sends all actions but only with:
  - action ID
  - action name
  - action description
  - action category
  - action subcategory
- Action descriptions are shortened to about `200` characters for that prompt.
- `coBenefits` are used by exclusion preview and by the Alignment block's other-preference scoring.
- `coBenefits[*]` only need co-benefit impact metadata (`impact_numeric`, plus optional relationship/text/methodology); they do not use sector, subsector, or GPC reference fields.
- `activity_type_description` is stored now for a future guarded activity-data-level mapping step in Impact.
- `timelineForImplementation` affects the Impact score and also the Alignment timeframe-preference component.
- `emissions.sector_number` affects exclusion preview and the Alignment score.
- `emissions.subsector_number[]` defines the active true subsector join used by Impact.
- `emissions.gpc_reference_number[]` remains reference data and is also used to keep the mock catalog consistent.
- `emissions.impact_text` gives the action's expected strength of emissions reduction.
- `socioeconomicIndicators[]` define how the action should be judged against city conditions in the Feasibility block.

### Legal assessments data

File:

- `data/mock/actions_legal_api_mock.json`

Fields that affect the result:

- `[].srcActionId`
- `[].countryCode`
- `[].verdictCategory`
- `[].verdictScore`

What these are used for:

- `countryCode` selects the legal rows for the request.
- `verdictCategory` drives the Hard Filter.
- `verdictScore` drives the legal half of the Feasibility block.

### Policy signals data

File:

- `data/mock/actions_policy_signals_api_mock.json`

Fields that affect the result:

- `policy_signals[].action_id`
- `policy_signals[].policy_support_score`

What these are used for:

- `policy_support_score` is used directly in the Alignment block.

Important note:

- `hiap-meed` does not currently calculate `policy_support_score` itself.
- It uses the already prepared value from the policy signals data as an input.

## 2. End-to-End Service Summary

For one city, the service now works in this order:

1. Optionally call the exclusion preview endpoint to resolve raw exclusion preferences.
2. Review the proposed exclusions.
3. Call the ranking endpoint with confirmed `excludedActionIds[]`.
4. Read the requested number of results (`topN`) and the final scoring weights.
5. Build city emissions totals from the caller request.
6. Load city context, actions, legal assessments, and policy signals.
7. Apply the Hard Filter to remove confirmed exclusions and legally blocked actions.
8. Score the remaining actions for Impact.
9. Score the remaining actions for Alignment.
10. Score the remaining actions for Feasibility.
11. Combine those three scores into one final score.
12. Sort the actions, keep the top results, and assign ranks.
13. Optionally generate qualitative explanations for the ranked results.

## 3. Setup Before Scoring Starts

### 3.1 Number of results to return

Input field:

- `requestData.topN`

Rule:

- If `requestData.topN` is provided and greater than zero, the pipeline uses that value.
- Otherwise the default is `20`.

Output:

- One final `topN` value for the run.

### 3.2 Final weights used across the three main scoring blocks

Input fields:

- `requestData.cityDataList[].weightsOverride.impact`
- `requestData.cityDataList[].weightsOverride.alignment`
- `requestData.cityDataList[].weightsOverride.feasibility`

Default weights if there is no override:

- Impact = `0.55`
- Alignment = `0.22`
- Feasibility = `0.23`

Validation rules:

- The three weights must exist.
- No weight may be negative.
- The three weights must add up to exactly `1.0`.

Output:

- One resolved set of final weights.

Example from `prioritizer_request_mock.json`:

- Impact = `0.5`
- Alignment = `0.3`
- Feasibility = `0.2`

### 3.3 City emissions totals prepared for the Impact block

Input field:

- `requestData.cityDataList[].cityEmissionsData.gpcData.<reference>.activities[].totalEmissions`

What the pipeline does:

- For each outer GPC key in the request, the pipeline first normalizes that key to a `sector.subsector` key.
- It then adds together all `totalEmissions` values found under that normalized subsector key.

Plain-language formula:

```text
 City emissions for one normalized subsector key
= sum of all activity-level totalEmissions values inside request rows that normalize to that subsector key
```

Output:

- A table that says, for each normalized `sector.subsector` key, how much total city emissions it represents.

Example:

- If multiple request rows normalize to the same `sector.subsector` key, the pipeline adds their activity-level `totalEmissions` values together and stores one total for that normalized subsector key.

## 4. Hard Filter

The Hard Filter removes actions before scoring begins.

This block does not give a numeric score. Its role is simply to decide which actions are still allowed to continue.

### 4.1 Inputs

From the caller request:

- `requestData.cityDataList[].excludedActionIds[]`

From the action catalog:

- `actions[].actionId`

From the legal assessments file:

- `[].srcActionId`
- `[].verdictCategory`
- `[].verdictScore`

Supporting legal fields that are returned as evidence, but do not drive the actual yes/no decision:

- `[].ownershipCategory`
- `[].ownershipScore`
- `[].restrictionsCategory`
- `[].restrictionsScore`
- `[].ownershipDescriptionI18n`
- `[].restrictionsDescriptionI18n`
- `[].legalJustificationI18n`
- `[].legalReferences`
- `[].analysisDate`
- `[].generationMethod`

### 4.2 Logic

#### Part A: confirmed user exclusions

Current behavior:

- The ranking request field `excludedActionIds[]` is accepted.
- Each listed action ID is removed before scoring.
- These IDs are expected to come from the separate exclusion preview and user review flow.

Current output:

```text
Excluded actions = confirmed excludedActionIds
```

Preview behavior before ranking:

- `POST /v1/prioritize/exclusions/preview` accepts `excludedSectorTags`, `excludedCoBenefitKeys`, and `excludedActionsFreeText`.
- `excludedSectorTags` must use only:
  - `stationary_energy`
  - `transportation`
  - `waste`
  - `ippu`
  - `afolu`
- `excludedCoBenefitKeys` must use only:
  - `air_quality`
  - `cost_of_living`
  - `habitat`
  - `housing`
  - `mobility`
  - `stakeholder_engagement`
  - `water_quality`
- Sector preferences are resolved deterministically from action sector metadata.
- Co-benefit preferences are resolved deterministically by finding selected co-benefits with negative `impact_numeric`.
- Free-text preferences use a guarded LLM resolver only when enabled by `HIAP_MEED_FREE_TEXT_EXCLUSIONS_ENABLED=true` and `HIAP_MEED_FREE_TEXT_EXCLUSIONS_MODEL`.
- The free-text request is shortened to at most `400` characters before prompt building.
- The free-text prompt uses the full action catalog, but only action ID, action name, action category, action subcategory, and a shortened description are sent for each action.
- The preview response returns proposed actions, grouped summary counts, and warnings so the user can confirm the final `excludedActionIds[]`.

#### Part B: legal verdict screening

Decision rule:

- If `verdictCategory = blocked`, the action is removed.
- If `verdictCategory` is missing, the action stays in the pipeline.
- Any non-`blocked` category also stays in the pipeline.

Plain-language rule:

```text
Remove the action only when the legal verdict category is blocked.
```

Important details:

- Hard filtering depends only on `verdictCategory`.
- `verdictScore` does not decide removal.
- Missing category is treated as "do not block."

### 4.3 Weights used

- No weights are used in this block.

### 4.4 Outputs

Main outputs:

- `valid_actions`
- `discarded_excluded`
- `discarded_legal`
- `evidence`

Important evidence fields:

- `discard_reason`
- `legal_assessment_present`
- `legal_verdict_category`
- `legal_verdict_score`
- `legal_ownership_category`
- `legal_restrictions_category`

Business interpretation:

- `valid_actions` move into scoring.
- Any action removed here never receives an Impact, Alignment, Feasibility, or Final score.

## 5. Impact Block

The Impact block estimates how much emissions-reduction benefit an action could deliver for the city.

It does this by linking each action to the city's emissions categories and then combining:

- how much of the city's emissions the action seems to target,
- and how quickly the action can be implemented.

Score semantics used in this document:

- All block scores and named components are expressed in `0..1`.
- `1.0` means the strongest support available within that component's own logic.
- `0.0` means the weakest support available within that component's own logic.
- `0.5` is the neutral midpoint only for components that start from a signed scale and are then normalized into `0..1`.
  - Current examples: the Alignment other-preference co-benefit component and the Feasibility socio-economic component.
- Not every component uses `0.5` as neutral.
  - Example: a missing policy support score remains `0.0` because that component measures support, not beneficial-versus-harmful effect.

### 5.1 Inputs

From the caller request:

- `requestData.cityDataList[].cityEmissionsData.gpcData.<reference>.activities[].totalEmissions`

From the action catalog:

- `actions[].actionId`
- `actions[].timelineForImplementation`
- `actions[].emissions.sector_number`
- `actions[].emissions.subsector_number[]`
- `actions[].emissions.gpc_reference_number[]`
- `actions[].emissions.impact_text`
- `actions[].activity_type_description`

### 5.2 Logic

#### Part A: identify which true subsector keys the action targets

The pipeline reads:

- `actions[].emissions.sector_number`
- `actions[].emissions.subsector_number[]`

These define the active `sector.subsector` keys that the action claims to influence.

Examples:

- `sector_number="I"` and `subsector_number=[1]` -> `I.1`
- `sector_number="V"` and `subsector_number=[1, 2]` -> `V.1`, `V.2`

`gpc_reference_number[]` remains in the payload as reference data, but it is no longer the active Impact join key.

#### Part B: translate impact strength from words into numbers

The pipeline converts `actions[].emissions.impact_text` into a numeric multiplier:

- `very low` -> `0.2`
- `low` -> `0.4`
- `medium` -> `0.6`
- `high` -> `0.8`
- `very high` -> `1.0`

Meaning:

- The stronger the impact label, the more of the matched city emissions are counted as reducible.

If the impact label is unknown:

- the request fails instead of returning a ranking.

#### Part C: estimate how much city emissions the action could reduce

For each action, the pipeline:

- finds which of the action's subsector keys also have strictly positive emissions in the city's emissions data,
- takes the city total for each matching subsector,
- multiplies those totals by the action's impact multiplier,
- and adds the results together.

Important product rule:

- Negative `V.*` AFOLU inventory values remain valid request data because they are real city removals.
- But Impact does not treat those negative values as reducible emissions.
- So negative or zero-emissions subsectors do not count as Impact matches and do not contribute to the reduction amount.

Plain-language formula:

```text
Estimated reduction amount for one action
= sum of:
    city emissions in each matched subsector
    multiplied by
    the action's impact multiplier
```

#### Part D: convert that reduction amount into a share of all city emissions

Plain-language formula:

```text
Reduction share of city emissions
= estimated reduction amount
  divided by
  total reducible positive city emissions across all subsectors
```

Important product rule:

- The denominator uses strictly positive city emissions only.
- Existing negative AFOLU removals are kept in the request data for validation and traceability, but they are excluded from reducible-emissions scoring.

If the city has zero reducible emissions in the request:

- the reduction share is set to `0`.

#### Part E: score the implementation timeline

Timeline mapping:

- `<5 years` -> `1.0`
- `5-10 years` -> `0.5`
- `>10 years` -> `0.0`
- missing or unknown timeline -> `0.5`

Meaning:

- Faster implementation gets a better score.

#### Part F: calculate the final Impact score

Plain-language formula:

```text
Impact score
= 0.80 * reduction share of city emissions
 + 0.20 * timeline score
```

Important detail:

- If an action does not match any city emissions categories, its reduction part becomes `0`.
- It can still earn points from the timeline part.

### 5.3 Weights used

Internal Impact weights:

- Reduction share of city emissions = `0.80`
- Timeline = `0.20`

### 5.4 Outputs

Main output:

- `impact_score`

Key evidence fields:

- `action_subsector_keys`
- `impact_text`
- `reduction_multiplier`
- `timeline_bucket`
- `timeline_score`
- `matched_city_subsector_keys_count`
- `matched_city_subsector_keys`
- `total_city_emissions`
- `total_reduction_amount`
- `emissions_reduction_component_score`
- `impact_block_score`
- `subsector_contributors`

## 6. Alignment Block

The Alignment block measures how well each action fits the city's strategic priorities.

In the current implementation, this score is driven by:

- policy support,
- sector preference,
- other strategic preferences expressed in free text,
- and preferred implementation timeframe.

### 6.1 Inputs

From the caller request:

- `requestData.cityDataList[].cityStrategicPreferenceSectors[]`
- `requestData.cityDataList[].cityStrategicPreferenceTimeframes[]`
- `requestData.cityDataList[].cityStrategicPreferenceCoBenefitKeys[]`

From the action catalog:

- `actions[].actionId`
- `actions[].emissions.sector_number`
- `actions[].timelineForImplementation`
- `actions[].coBenefits`

From the policy signals file:

- `policy_signals[].action_id`
- `policy_signals[].policy_support_score`

### 6.2 Logic

The Alignment block has four parts.

#### Part A: policy support

For each action, the pipeline reads:

- `policy_support_score`

If it is missing:

- the score used is `0.0`

Plain-language formula:

```text
Policy component
= policy_support_score
or 0.0 if no score is available
```

Important detail:

- `hiap-meed` does not calculate this score itself.
- It uses the already prepared value from the policy signals data directly.

#### Part B: match to the city's preferred sectors

The action's sector is identified using action metadata.

Primary sector mapping from emissions sector code:

- `I` -> `stationary_energy`
- `II` -> `transportation`
- `III` -> `waste`
- `IV` -> `ippu`
- `V` -> `afolu`

If the emissions sector code is missing, the service can also use exact canonical sector labels already present in action category or action subcategory. It does not use loose aliases such as "mobility" or "energy".

Then the pipeline checks whether the resolved sector appears in:

- `requestData.cityDataList[].cityStrategicPreferenceSectors[]`

Input contract:

- `cityStrategicPreferenceSectors[]` is validated at the API boundary against:
  - `stationary_energy`
  - `transportation`
  - `waste`
  - `ippu`
  - `afolu`

Scoring rule:

- match = `1.0`
- no match = `0.0`

Plain-language formula:

```text
Sector component
= 1.0 if the action belongs to a city-preferred sector
= 0.0 otherwise
```

#### Part C: match to the city's selected co-benefit priorities

Current behavior:

- The pipeline reads `cityStrategicPreferenceCoBenefitKeys[]`.
- These values are validated at the API boundary against the allowed co-benefit taxonomy.
- Allowed co-benefit keys are:
  - `air_quality`
  - `cost_of_living`
  - `habitat`
  - `housing`
  - `mobility`
  - `stakeholder_engagement`
  - `water_quality`
- The Alignment block uses those selected keys directly.

Plain-language formula:

```text
Other-preference component
= normalize(
    sum(action.coBenefits[selected_key].impact_numeric or 0 for selected_key in resolved_preferred_co_benefits),
    min=len(resolved_preferred_co_benefits) * -2,
    max=len(resolved_preferred_co_benefits) * 2
  )
where:
- the denominator is defined only by the city's resolved preferred co-benefits
- missing co-benefit keys on the action count as 0 for those preferred keys
- co-benefits present on the action but not selected by the city do not affect this component
- no selected co-benefits returns 0.5 (neutral)
```

Fallback behavior note:

- When no co-benefit keys are selected, the block remains neutral at `0.5`.

#### Part D: match to the city's preferred timeframe

The service compares:

- the city's requested timeframe preferences
- and each action's `timelineForImplementation`

Action timelines are translated as:

- `<5 years` -> `short`
- `5-10 years` -> `medium`
- `>10 years` -> `long`

Scoring rule:

- exact match = `1.0`
- adjacent match = `0.5`
- far mismatch = `0.0`
- missing or unknown action timeline = `0.5`
- `no_preference` = `0.5`

If the city selected more than one timeframe, the service keeps the best match for that action.

#### Final Alignment formula

Plain-language formula:

```text
Alignment score
= 0.75 * policy component
 + 0.15 * sector component
 + 0.05 * other-preference component
 + 0.05 * timeframe component
```

### 6.3 Weights used

Internal Alignment weights:

- Policy support = `0.75`
- Sector match = `0.15`
- Other co-benefit preference = `0.05`
- Timeframe preference = `0.05`

### 6.4 Outputs

Main output:

- `alignment_score`

Key evidence fields:

- `policy_component_value`
- `sector_component_value`
- `other_component_value`
- `timeframe_component_value`
- `policy_contribution`
- `sector_contribution`
- `other_contribution`
- `timeframe_contribution`
- `alignment_score`
- `action_sector_number`
- `mapped_sector_tag`
- `mapped_sector_tags`
- `city_preference_sectors`
- `city_preference_timeframes`
- `action_timeline_bucket`
- `action_timeframe_label`
- `action_timeline_known`
- `sector_match`
- `policy_signals_count`
- `policy_support_score_present`
- `policy_signal_summaries`

## 7. Feasibility Block

The Feasibility block measures how practical the action looks for the city.

It combines:

- the direct legal verdict score,
- and fit with the city's socio-economic profile.

### 7.1 Inputs

From the legal assessments file:

- `[].srcActionId`
- `[].verdictCategory`
- `[].verdictScore`

Fields returned mainly as evidence:

- `[].ownershipCategory`
- `[].ownershipScore`
- `[].restrictionsCategory`
- `[].restrictionsScore`
- `[].legalReferences`
- `[].analysisDate`
- `[].generationMethod`

From the action catalog:

- `actions[].actionId`
- `actions[].socioeconomicIndicators[].indicator_key`
- `actions[].socioeconomicIndicators[].direction`
- `actions[].socioeconomicIndicators[].weight`
- `actions[].socioeconomicIndicators[].rationale`

From the city context file:

- `city.unemployment_rate.attribute_category`
- `city.renter_share.attribute_category`
- `city.employment_in_transport_and_logistics.attribute_category`
- `city.electricity_access_rate.attribute_category`
- `city.industry_construction_employment.attribute_category`
- `city.median_household_income.attribute_category`
- `city.public_transport_share.attribute_category`
- `city.poverty_rate.attribute_category`
- `city.home_ownership.attribute_category`

### 7.2 Logic

The Feasibility block has two equal parts.

#### Part A: legal verdict score

Scoring rule:

- Use `verdictScore` directly as the legal component.
- If `verdictScore` is missing, use neutral `0.5`.

Plain-language formula:

```text
Legal component
= verdictScore
```

Fallback rule:

```text
If verdictScore is missing, legal component = 0.5
```

Important details:

- `verdictCategory` is not used for the numeric feasibility score.
- If the legal row is missing entirely, the component also falls back to `0.5`.

#### Part B: socio-economic fit

First, each city category is translated into a number:

- `very_low` -> `-2`
- `low` -> `-1`
- `medium` -> `0`
- `high` -> `1`
- `very_high` -> `2`

Then each action rule is processed using:

- `indicator_key`
- `direction`
- `weight`

Meaning of `direction`:

- `supportive` means higher city values help the action
- `constraining` means higher city values make the action harder

Step-by-step:

1. Look up the city's category for the indicator.
2. Convert that category into a numeric score.
3. If the rule is `supportive`, keep the score as it is.
4. If the rule is `constraining`, reverse the sign.
5. Multiply the result by the rule's weight.
6. Add all weighted rule results together.
7. Divide by the total rule weight.

Plain-language formulas:

```text
Adjusted indicator score
= bucket score              when direction = supportive
= negative bucket score     when direction = constraining
```

```text
Weighted contribution
= rule weight * adjusted indicator score
```

```text
Socio-economic average
= sum of all weighted contributions
  divided by
  sum of all indicator weights
```

That average sits on a scale from `-2` to `2`, so the pipeline rescales it to `0` to `1`:

```text
Socio-economic component
= (socio-economic average + 2) / 4
```

Important details:

- If the city is missing a needed indicator, that rule contributes `0`.
- The weight of that missing rule is still included in the denominator.
- If an action has no socio-economic rules at all, the pipeline sets:
  - socio-economic average = `0`
  - socio-economic component = `0.5`
- So "no socio-economic information" becomes a neutral middle score, not a failure.

#### Final Feasibility formula

Plain-language formula:

```text
Feasibility score
= 0.50 * legal component
 + 0.50 * socio-economic component
```

### 7.3 Weights used

Internal Feasibility weights:

- Legal verdict score = `0.50`
- Socio-economic fit = `0.50`

### 7.4 Outputs

Main output:

- `feasibility_score`

Key evidence fields:

- `legal_assessment_present`
- `legal_assessment_missing`
- `legal_verdict_category`
- `legal_component_score`
- `legal_component_source`
- `legal_verdict_score_missing`
- `socioeconomic_indicators_component_value`
- `socioeconomic_indicators_weighted_sum`
- `total_socioeconomic_indicator_weight`
- `socioeconomic_indicators_avg`
- `socioeconomic_indicator_rows`
- `missing_city_socioeconomic_indicator_keys`
- `feasibility_score`

## 8. Final Scoring Block

The Final Scoring block turns the three block scores into one overall score and then creates the final ranked list.

### 8.1 Inputs

From earlier scoring blocks:

- `impact_score`
- `alignment_score`
- `feasibility_score`

From the request or the defaults:

- `requestData.cityDataList[].weightsOverride.impact`
- `requestData.cityDataList[].weightsOverride.alignment`
- `requestData.cityDataList[].weightsOverride.feasibility`
- partial overrides are allowed; missing keys are filled from defaults before validating the resolved final weights

From the request size:

- `requestData.topN`

From the action catalog:

- `actions[].actionId`

### 8.2 Logic

#### Part A: calculate the final score

Plain-language formula:

```text
Final score
= (Impact weight * Impact score)
 + (Alignment weight * Alignment score)
 + (Feasibility weight * Feasibility score)
```

The three final weights must add up to `1.0`.

#### Part B: sort the actions

Actions are sorted in this order:

1. Higher final score comes first.
2. If final scores are tied, compare the block scores in the order of the highest final weights.
3. If there is still a tie, sort alphabetically by `action_id`.

Business interpretation:

- If Impact has the largest final weight, then Impact becomes the first tie-breaker.
- If Feasibility has the largest final weight, then Feasibility becomes the first tie-breaker.

#### Part C: keep only the top results

After sorting:

- keep only the first `topN` actions

#### Part D: assign ranks

The ranking system is competitive ranking:

- equal scores share the same rank
- the next rank number is skipped accordingly

Example:

- `1, 2, 2, 4`

### 8.3 Weights used

Final combination weights:

- Default = Impact `0.55`, Alignment `0.22`, Feasibility `0.23`
- Or the request-specific override values

### 8.4 Outputs

Main outputs:

- `ranked_action_ids`
- `ranked_actions`
- `metadata`

For each ranked action, the output includes:

- `action_id`
- `rank`
- `final_score`
- `impact_score`
- `alignment_score`
- `feasibility_score`
- `evidence_summary`
- `explanations`

Important current behavior:

- `explanations` is `{}` unless `requestData.createExplanations=true` and the explanation call succeeds
- Explanations are generated only after ranking is finished; they do not change scores or ranks
- The explanation stage uses the ranked actions plus curated evidence from the Impact, Alignment, and Feasibility blocks
- The explanation stage returns explanation texts keyed by language code per action.
- The canonical explanation language is `en`.
- Requested non-English explanation languages are produced by translating the canonical English explanation after ranking.
- Response metadata records `generated_languages` as the languages actually present in the returned explanation payload.
- Explanations receive `cityStrategicPreferenceCoBenefitKeys[]` directly from the request context
- The backend logs a warning if the explanation prompt becomes unusually large
- If explanation generation fails or times out, ranking still returns normally with `explanations={}`
- When explanation artifacts are enabled, the run folder stores:
  - `llm/explanations_prompt.txt`
  - `llm/explanations_io.json`

Key metadata includes:

- `weights`
- `timings`
- `counts.total_actions`
- `counts.valid_actions`
- `counts.discarded_excluded`
- `counts.discarded_legal`
- `counts.ranked_actions`
- `hard_filter_evidence_by_action_id`

## 9. How the Final Ranked List Is Created

The final ranked list is produced in this sequence:

1. Start with the full action catalog.
2. Remove confirmed exclusions and actions blocked by the Hard Filter.
3. Score every remaining action for Impact.
4. Score every remaining action for Alignment.
5. Score every remaining action for Feasibility.
6. Combine the three scores into one final score.
7. Sort the actions.
8. Keep only the top requested number of actions.
9. Assign rank numbers.

So the final list depends on two layers of weighting:

Internal weights inside each scoring block:

- Impact = `0.80 / 0.20`
- Alignment = `0.75 / 0.15 / 0.05 / 0.05`
- Feasibility = `0.50 / 0.50`

Final weights across the three blocks:

- Default = `0.55 / 0.22 / 0.23`
- Or the request-specific `weightsOverride`

## 10. Current Placeholders and Planned Extensions

### Implemented: exclusion preview

Current behavior:

- raw exclusion preferences are resolved by the preview endpoint before ranking
- ranking accepts only confirmed `excludedActionIds[]`
- free-text preview matching is optional and guarded by environment config

### Implemented and deterministic: `cityStrategicPreferenceCoBenefitKeys`

Current behavior:

- accepted in the request
- validated against the allowed co-benefit taxonomy
- contributes to the Alignment block through normalized selected co-benefit impact values

### Placeholder 3: ranked action `explanations`

Current behavior:

- `{}` unless `requestData.createExplanations=true` and explanation generation succeeds
- when generated, the field is an object keyed by language code
- canonical English explanations are generated first and requested non-English languages are returned through the current translation flow
- `/v1/explanations/translate` is already available as the stateless translation endpoint for canonical explanation text

Planned improvements:

- continue improving the generated explanation quality and prompt grounding

## 11. Practical Reading of the Current System

In business terms, the current implementation works like this:

- Actions that have `verdictCategory = blocked` are removed before ranking.
- Actions score higher on Impact when they target large city emissions sources and can be implemented sooner.
- Actions score higher on Alignment when they already have stronger policy support and belong to sectors the city has said it prefers.
- Actions score higher on Feasibility when the legal verdict score is stronger and the city's socio-economic profile looks supportive.
- The final list is then created by applying the chosen top-level weights to those three scores.

So the final ranking is not one black-box judgment. It is a step-by-step combination of:

- rule-based filtering,
- structured block-level scoring,
- and one final weighted ranking calculation.
Implementation note:

- The request now preserves `activities[].activityType` rows and action `activity_type_description`.
- `ACTIVITY_DATA_LEVEL_MAPPING=false` keeps true subsector-only matching.
- `ACTIVITY_DATA_LEVEL_MAPPING=true` calls a stub that logs `not implemented` and returns the same subsector-level matches for now.
