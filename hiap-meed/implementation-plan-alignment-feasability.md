# Implementation plan: Impact + Alignment + Feasibility scoring model

## Goal

Adopt one consistent scoring approach for **all scoring blocks** (`impact`, `alignment`, `feasibility`):

- each block computes component scores in `[0,1]`
- each block uses explicit internal weights that sum to `1`
- each block returns a **canonical weighted-sum score in `[0,1]`**
- block evidence logs both component values and weighted contributions

No max-normalization is required for canonical block scores under this approach.

## Reference behavior

- Notion: **How Legal Signals, Policy Signals, and Socioeconomic Indicators Work in HIAP Ranking**  
  `https://www.notion.so/319eb557728b80d4bf84edb7edd0449a`
  - policy signals improve alignment (no blocking)
  - legal signals are gates + feasibility support signals

## Why this change

Current/previous max-normalization style makes small constants (for example `0.05`) hard to interpret across runs.  
With weighted sums, a weight like `0.05` has a clear meaning: up to 5 percentage points contribution in that block.

## Unified scoring contract (applies to all blocks)

For any block \(B\):

- each block defines named `*_COMPONENT` values in `[0,1]`
- each block defines named `*_WEIGHT` constants where each weight must satisfy `0.0 <= weight <= 1.0` and all block-internal weights sum to `1`
- block score is the weighted sum of named components, for example:
  - `BLOCK_SCORE = (BLOCK_WEIGHT_A * BLOCK_COMPONENT_A) + (BLOCK_WEIGHT_B * BLOCK_COMPONENT_B) + ...`

Guarantee:

- `score_B in [0,1]` for every action, without extra normalization.

Evidence requirement:

- log `component_values`
- log `component_weights`
- log `component_contributions` (`BLOCK_WEIGHT_X * BLOCK_COMPONENT_X`)
- log final canonical block score

---

## Explicit data ownership by block

### Impact block inputs

- Frontend request city emissions: `prioritizer_request_mock.json`
  - `requestData.cityDataList[].cityEmissionsData.gpcData[*].activities[*].totalEmissions`
- Action emissions metadata:
  - **current file in repo**: `actions_api_mock_v2.json` (uses top-level `emissions.*` and has no `mitigationImpact`)
  - canonical field path: `emissions.gpc_reference_number`, `emissions.impact_text`, `emissions.sector_number`
  - `timelineForImplementation`

Impact does **not** use policy signals or legal requirements.

### Alignment block inputs

- Frontend strategic preferences: `prioritizer_request_mock.json`
  - `cityStrategicPreferenceSectors`
  - `cityStrategicPreferenceOther` (LLM-stub for now)
- Policy signals: `actions_policy_signals_api_mock.json`
  - `policy_support_score`
  - `policy_signals[]` evidence fields
- Action metadata for sector mapping:
  - **current file in repo**: `actions_api_mock_v2.json` uses top-level `emissions.sector_number`

Alignment does **not** use legal requirements.

### Feasibility block inputs

- Legal requirements: `actions_legal_api_mock.json`
  - `strength`
  - `alignment_status`
  - requirement evidence fields
- City socioeconomic indicators: `city_api_mock.json`
  - city indicator objects such as `unemployment_rate`, `renter_share`,
    `transport_logistics_employment`, `electricity_access`,
    `industry_construction_employment`, `median_household_income`,
    `public_transport_share`, `poverty_rate`, `home_ownership`
  - each indicator contributes `attribute_category` (bucket)
- Action socioeconomic fit rules: `actions_api_mock_v2.json`
  - `socioeconomicIndicators[]` items with:
    - `indicator_key`
    - `direction` (`supportive` or `constraining`)
    - `weight`
    - `rationale`
  - `indicator_key` must match canonical city indicator names (see below). If they dont match, log a warning message.

Feasibility must explicitly account for hard-filter sequencing:

- actions with `mandatory|required` and `not_aligned` are already removed by hard-filter
- feasibility must not re-apply hard gating or add a second penalty for those same hard failures
- hard requirements can still be logged as context evidence, but canonical feasibility score should be driven by non-hard components
- all actions that reach Feasibility are scored with the same uniform component formula (no special-case branch based on past hard-filter outcomes)

Feasibility does **not** use policy signals, city strategic preferences, or city emissions.

---

## Action schema migration updates

`actions_api_mock_v2.json` keeps the same action set as the previous mock while refactoring field layout.
Implementation should use the following target conventions:

- `coBenefits` is the canonical location for non-emissions impact/co-benefit signals.
- `socioeconomicIndicators` (lowercase `e`) is canonical; remove legacy `socioEconomicIndicators`.
- `actions_api_mock_v2.json` already uses top-level `emissions` and does not include `mitigationImpact`.

Data consistency requirement:

- `socioeconomicIndicators[].indicator_key` values must match the canonical city indicator keys from `city_api_mock.json`
  (for example: `transport_logistics_employment`, `electricity_access`, `public_transport_share`).
  If action indicator keys do not match, those indicators will be treated as missing and contribute neutrally (0).
  Log a warning message.

Required field-read updates when implementing blocks:

- Impact reads emissions from `emissions.*` (top-level).
- Alignment sector matching reads `emissions.sector_number`.
- Alignment "other preference" matching can use `coBenefits` + action text fields.
- Feasibility socioeconomic rules read `socioeconomicIndicators[].indicator_key|direction|weight|rationale`.

Implementation note:

- Do **not** implement dual-path parsing (no backward compatibility).
- The mock file already reflects the new contract, so implementation work is only to update code/models to match it.

---

## Impact block migration plan

### Target formula

- `IMPACT_REDUCTION_COMPONENT = reduction_share_of_city_emissions` (already in `[0,1]`)
- `IMPACT_TIMELINE_COMPONENT = resolve_timeline_score(...)` (already in `[0,1]`)
- `IMPACT_SCORE = (IMPACT_WEIGHT_REDUCTION_SHARE * IMPACT_REDUCTION_COMPONENT) + (IMPACT_WEIGHT_TIMELINE * IMPACT_TIMELINE_COMPONENT)`

with:

- `IMPACT_WEIGHT_REDUCTION_SHARE + IMPACT_WEIGHT_TIMELINE = 1`
- reuse existing constants:
  - `IMPACT_WEIGHT_REDUCTION_SHARE`
  - `IMPACT_WEIGHT_TIMELINE`

### Required implementation changes

- remove use of max-normalization in `impact.run(...)`
- set `score_by_action_id[action_id] = impact_score` directly
- rename `impact_raw` to `impact_score_canonical` and remove impact_normalized
- ensure evidence includes explicit contributions:
  - `reduction_component_value`
  - `timeline_component_value`
  - `reduction_component_contribution`
  - `timeline_component_contribution`

### Expected behavior change

- top Impact score in a run is no longer always `1.0` as per the previous implementation with max-normalization
- Impact score remains bounded in `[0,1]`
- score interpretation becomes stable across runs
- weights are now explicit and can be interpreted as percentage points contribution to the block score

---

## Alignment block implementation plan (new block logic)

### Block contract

Planned signature:

- `alignment.run(actions, *, policy_signals_by_action_id, city_preference_sectors, city_preference_other_text) -> BlockScoreResult`

Output:

- `score_by_action_id`: canonical weighted-sum scores in `[0,1]`
- `evidence_by_action_id`: per-action explainability

### Components

1. **Policy component** `ALIGNMENT_POLICY_COMPONENT in [0,1]`
   - source: `policy_support_score` (default `0.0` if missing)

2. **Sector-preference component** `ALIGNMENT_SECTOR_COMPONENT in {0,1}`
   - `1.0` when action sector tags overlap requested city preference sectors, else `0.0`
   - action sector tags are derived from `emissions.sector_number` only
   - sector-number to text mapping:
     - `I -> stationary_energy`
     - `II -> transportation`
     - `III -> waste`
     - `IV -> ippu`
     - `V -> afolu`

3. **Other-preference component** `ALIGNMENT_OTHER_COMPONENT in [0,1]`
   - from LLM matching of `cityStrategicPreferenceOther`
   - candidate action fields for matching include `coBenefits`, `description`, and `timelineForImplementation`
   - for now: stub returns `0.0` for all actions

### Canonical score

- `ALIGNMENT_SCORE = (ALIGNMENT_WEIGHT_POLICY * ALIGNMENT_POLICY_COMPONENT) + (ALIGNMENT_WEIGHT_SECTOR * ALIGNMENT_SECTOR_COMPONENT) + (ALIGNMENT_WEIGHT_OTHER * ALIGNMENT_OTHER_COMPONENT)`
- require: `ALIGNMENT_WEIGHT_POLICY + ALIGNMENT_WEIGHT_SECTOR + ALIGNMENT_WEIGHT_OTHER = 1`

### Config migration

Replace boost-style constant with weight-style constants:

- remove `ALIGNMENT_STRATEGIC_SECTOR_BOOST` entirely
- introduce:
  - `ALIGNMENT_WEIGHT_POLICY`
  - `ALIGNMENT_WEIGHT_SECTOR`
  - `ALIGNMENT_WEIGHT_OTHER`
- validate sum-to-1 in config validation helper for block internals

No backward-compatibility path is required for this migration. Remove replaced
constants and old scoring branches instead of keeping dual behavior.

### Evidence minimum

- `policy_component_value`, `sector_component_value`, `other_component_value`
- `policy_weight`, `sector_weight`, `other_weight`
- `policy_contribution`, `sector_contribution`, `other_contribution`
- `alignment_score`
- sector matching diagnostics + policy signal summaries

---

## Feasibility block implementation plan (new block logic)

### Block contract

Planned signature:

- `feasibility.run(actions, *, city, legal_requirements_by_action_id) -> BlockScoreResult`

Output:

- `score_by_action_id`: canonical weighted-sum scores in `[0,1]`
- `evidence_by_action_id`: per-action explainability

### Components

1. **Soft-legal support component** `FEASIBILITY_SOFT_LEGAL_COMPONENT in [0,1]`
   - soft requirements: strengths in `{recommended, optional}`
   - `FEASIBILITY_SOFT_LEGAL_COMPONENT = aligned_soft / total_soft` (0 when no soft requirements)

2. **Socioeconomic fit component** `FEASIBILITY_SOCIO_COMPONENT in [0,1]`
   - computed from action rule rows in `socioeconomicIndicators[]` from `actions_api_mock_v2.json` and city buckets from `city_api_mock.json`
   - the action rule schema is:
     - `indicator_key`
     - `direction`
     - `weight`
     - `rationale`
   - strict ingest validation at API-model level (Pydantic):
     - each `weight` must satisfy `0.0 <= weight <= 1.0` (raise `ValueError` otherwise)
     - each `direction` must be one of `{supportive, constraining}` (raise `ValueError` otherwise)
     - sum of per-action indicator weights is allowed to be greater than `1` (no validation error)
   - bucket-to-score mapping (Notion section "2. Socio-Economic Fit"):
     - `very_low -> -2`\
     - `low -> -1`
   - `medium -> 0`
   - `high -> +1`
   - `very_high -> +2`
   - normalize bucket labels before mapping:
     - lowercase
     - replace spaces and hyphens with underscores
   - no alias remapping required when city/action data use canonical bucket labels
   - direction handling:
     - `supportive`: use bucket score as-is
     - `constraining`: multiply bucket score by `-1`

- explicit variable definitions used in formula:
  - `INDICATOR_WEIGHT` means `actions_api_mock_v2.json -> socioeconomicIndicators[].weight`
  - `ADJUSTED_INDICATOR_SCORE` means:
    - first map `city_api_mock.json -> <indicator>.attribute_category` to numeric bucket score
    - then apply `actions_api_mock_v2.json -> socioeconomicIndicators[].direction`
    - final value is the direction-adjusted per-indicator numeric score
- missing city indicator data rule:
  - use raw indicator score `0` (neutral) before weighting
- socioeconomic weighted average score:
- compute each indicator contribution first (per action, per indicator):
  - `INDICATOR_CONTRIBUTION = INDICATOR_WEIGHT * ADJUSTED_INDICATOR_SCORE`
- `TOTAL_INDICATOR_WEIGHT = sum(INDICATOR_WEIGHT)`
- `SOCIO_WEIGHTED_SUM = sum(INDICATOR_CONTRIBUTION)`
- `SOCIO_AVG = SOCIO_WEIGHTED_SUM / TOTAL_INDICATOR_WEIGHT` when `TOTAL_INDICATOR_WEIGHT > 0`, else `0`
- `SOCIO_AVG` is the final aggregate for this action's socioeconomic indicator set
- `SOCIO_AVG` is guaranteed in `[-2, +2]` because it is a weighted average of values in `[-2, +2]`
- socioeconomic normalized score:
  - `FEASIBILITY_SOCIO_COMPONENT = (SOCIO_AVG + 2) / 4`
  - no clamp is needed when strict validation is enforced and weighted-average formulation is used

3. **Constraint evidence component** (evidence-only, no score contribution in v1)
   - source field path:
     - `actions_legal_api_mock.json -> legal_requirements[].requirements[].strength == "informational"`
   - informational constraints (`strength = informational`) are captured in Feasibility evidence per action
   - informational constraints are shown in explainability output (for example: permit/procedure notes)
   - informational constraints do **not** change `FEASIBILITY_SOFT_LEGAL_COMPONENT`
   - informational constraints do **not** change `FEASIBILITY_SOCIO_COMPONENT`
   - informational constraints do **not** change final `FEASIBILITY_SCORE` in v1
   - no additional scored constraint component is introduced in this phase

### Canonical score

- `FEASIBILITY_SCORE = (FEASIBILITY_WEIGHT_LEGAL * FEASIBILITY_SOFT_LEGAL_COMPONENT) + (FEASIBILITY_WEIGHT_SOCIO * FEASIBILITY_SOCIO_COMPONENT)`
- require: `FEASIBILITY_WEIGHT_LEGAL + FEASIBILITY_WEIGHT_SOCIO = 1`

### Strength handling policy

- `mandatory|required`: handled by hard filter (not rescored here)
- `recommended|optional`: drive soft-legal component
- `informational`: evidence only (no direct score contribution in v1)

### Socioeconomic indicator-key policy

City indicator names in `city_api_mock.json` are the canonical source of truth.
Action rule keys (`indicator_key`) must match those canonical city
indicator names directly (no key-mapping layer in implementation).

Concrete examples (city payload keys that actions must use as `indicator_key`):

- `unemployment_rate`
- `renter_share`
- `transport_logistics_employment`
- `electricity_access`
- `industry_construction_employment`
- `median_household_income`
- `public_transport_share`
- `poverty_rate`
- `home_ownership`

If an action key does not exist in the city indicators, treat it as missing data
(neutral raw indicator score `0`) and log it in evidence.

### Evidence minimum

- counts by strength + status
- soft component value and contribution
- socioeconomic component value and contribution
- per-indicator socioeconomic evidence rows including:
  - action indicator key
  - city bucket label
  - mapped numeric bucket score
  - direction
  - adjusted score
  - indicator weight
  - weighted contribution
- `feasibility_score`
- concise requirement summaries for explainability

---

## Data plumbing changes (pipeline)

1. Pass city strategic preferences through API -> orchestrator:
   - `city_preference_sectors`
   - `city_preference_other_text`
2. Add policy signals data client:
   - `PolicySignalsDataApiClient.get_action_policy_signals(locode)`
   - mock client using `actions_policy_signals_api_mock.json`
3. Reuse existing legal requirements fetch for feasibility:
   - pass `legal_requirements_by_action_id` directly to feasibility block
4. Keep artifact events as-is (`impact.completed`, `alignment.completed`, `feasibility.completed`) but store canonical score semantics in evidence payloads.

---

## Rollout order

1. Update plan/docs to canonical weighted-sum semantics (this document + architecture docs).
2. Implement Impact migration first (smallest delta, already has weighted components) and remove max-normalization path entirely.
3. Implement Alignment with weight-based components (policy/sector/other stub) and remove old boost-style scoring constants.
4. Implement Feasibility with weight-based components (soft legal + socioeconomic fit) and no legacy branch.
5. Update tests to validate:
   - scores are in `[0,1]`
   - component contributions sum to block score
   - no assumption that top score must be `1.0`

---

## Agent execution slices (recommended order)

Use these slices as strict sequential implementation units. Complete one slice fully
(code + tests + docs) before starting the next.

### Slice 1 — Action schema cutover in models + data client mapping

- **Goal:** align internal parsing with `actions_api_mock_v2.json` conventions.
- **Scope:**
  - `app/modules/prioritizer/models.py`
  - `app/services/data_clients.py`
  - `app/modules/prioritizer/internal_models.py`
- **Changes:**
  - adopt `socioeconomicIndicators[]` with `indicator_key|direction|weight|rationale`
  - remove legacy `socioEconomicIndicators` handling
  - update action contract to use top-level `emissions` (as in `actions_api_mock_v2.json`)
  - update internal `Action` model to store canonical `emissions` and `coBenefits` fields (instead of overloading `mitigation_impact`)
- **Done when:**
  - action payload validates with new field names
  - no legacy parser branches remain

### Slice 2 — Config foundation for canonical block scoring

- **Goal:** define all block-internal weight constants and validation rules.
- **Scope:** `app/modules/prioritizer/config.py`
- **Changes:**
  - keep/add explicit `IMPACT_*`, `ALIGNMENT_*`, `FEASIBILITY_*` weight constants
  - enforce `0.0 <= weight <= 1.0` for each block internal weight
  - enforce sum-to-1 checks for each block's internal weights
  - remove `ALIGNMENT_STRATEGIC_SECTOR_BOOST`
- **Done when:**
  - config exposes only weight-based controls
  - validation fails fast on invalid weight sums

### Slice 3 — Impact block canonical-score migration

- **Goal:** move Impact from max-normalized output to canonical weighted-sum output.
- **Scope:** `app/modules/prioritizer/blocks/impact.py`
- **Changes:**
  - compute final score directly from `IMPACT_REDUCTION_COMPONENT` + `IMPACT_TIMELINE_COMPONENT`
  - remove max-normalization path
  - rename/align evidence fields to canonical-score wording
- **Done when:**
  - all impact scores are in `[0,1]` without run-relative scaling
  - evidence shows component contributions

### Slice 4 — Policy-signal plumbing for Alignment

- **Goal:** make policy signal data available to Alignment block.
- **Scope:**
  - `app/services/data_clients.py`
  - `app/modules/prioritizer/orchestrator.py`
  - dependency wiring in API layer as needed
- **Changes:**
  - add policy-signal data client (mock + provider)
  - orchestrator fetches policy signals and passes to Alignment
  - add fetch artifacts (`fetch_policy_signals.completed`)
- **Done when:**
  - alignment receives policy signals through orchestrator
  - artifacts include policy-fetch trace

### Slice 5 — Alignment block full implementation

- **Goal:** implement weighted Alignment scoring with new schema fields.
- **Scope:** `app/modules/prioritizer/blocks/alignment.py`
- **Changes:**
  - `ALIGNMENT_POLICY_COMPONENT` from `policy_support_score`
  - `ALIGNMENT_SECTOR_COMPONENT` from `emissions.sector_number` mapping
  - keep `ALIGNMENT_OTHER_COMPONENT` as LLM stub (`0.0` for now)
  - compute canonical weighted score; log contributions
- **Done when:**
  - alignment scores are canonical `[0,1]`
  - sector mapping uses configured Roman-numeral map only

### Slice 6 — Feasibility legal component implementation

- **Goal:** implement legal soft-signal scoring on post-hard-filter actions.
- **Scope:**
  - `app/modules/prioritizer/blocks/feasibility.py`
  - `app/modules/prioritizer/orchestrator.py`
- **Changes:**
  - `FEASIBILITY_SOFT_LEGAL_COMPONENT = aligned_soft / total_soft`
  - enforce "no double gating": do not rescore hard failures
  - keep informational (`strength=informational`) as evidence-only
- **Done when:**
  - all surviving actions use one uniform feasibility formula
  - hard failures are not re-penalized

### Slice 7 — Feasibility socioeconomic component implementation

- **Goal:** add socioeconomic fit scoring from city indicators + action rules.
- **Scope:**
  - `app/modules/prioritizer/blocks/feasibility.py`
  - model validation in `app/modules/prioritizer/models.py`
  - `app/modules/prioritizer/orchestrator.py` (to ensure city + legal maps are passed through the new signature)
- **Changes:**
  - strict validation:
    - `0.0 <= weight <= 1.0`
    - `direction in {supportive, constraining}`
    - sum of indicator weights may be `> 1`
  - compute per-indicator contributions, then weighted average (`SOCIO_AVG`)
  - map to `[0,1]` via `(SOCIO_AVG + 2) / 4`
  - no clamp needed with this formulation + validation
- **Done when:**
  - socioeconomic component is deterministic and bounded
  - per-indicator evidence rows are present

### Slice 8 — Tests + docs + final consistency pass

- **Goal:** lock behavior with tests and synchronize documentation.
- **Scope:**
  - `tests/unit/test_prioritizer_blocks.py` (and related tests)
  - docs including this plan and architecture docs
- **Changes:**
  - remove old max-normalization expectations
  - add assertions for component contributions summing to canonical block scores
  - add coverage for v2 schema fields and socioeconomic validation failures
- **Done when:**
  - tests pass end-to-end for Impact/Alignment/Feasibility
  - docs reflect canonical weighted-sum behavior only

---

## Test plan updates

- **Impact**
  - assert `0 <= score <= 1`
  - assert `score == reduction_contribution + timeline_contribution`
  - remove expectation `max(score)==1.0`
- **Alignment**
  - policy component applied from `policy_support_score`
  - sector component is binary and weighted
  - other component stub returns `0.0`
  - contributions sum to canonical alignment score
- **Feasibility**
  - soft legal component computed from aligned fraction
  - hard requirements do not enter feasibility scoring (already gated upstream)
  - socioeconomic component follows bucket mapping + direction + weighted-average + `(SOCIO_AVG + 2) / 4`
  - missing city socioeconomic indicators are neutral (raw `0` before normalization)
  - contributions sum to canonical feasibility score
