# Implementation plan: Impact block (`hiap-meed/app/modules/prioritizer/blocks/impact.py`)

## Goal

Implement **city-specific, explainable Impact scoring** for mitigation actions in `hiap-meed`, aligned with the end-to-end architecture.

Impact should answer:

- **“How much emissions reduction potential does this action have in this specific city?”**

and produce a **normalized score per action** (target range: 0.0–1.0) plus evidence that explains _why_.

## References (must stay aligned)

- Notion: **HIAP Mitigation Action Prioritization System (End-to-End)**: `https://www.notion.so/304eb557728b80248938f3a32e613f94`
- `hiap-meed/docs/detailed-block-architecture.md` (Impact section + “Activity relevance × reduction band × timeline”)
- Partial “similar logic” reference (do **not** port code): `hiap/app/prioritizer/utils/ml_comparator.py`
- Screenshot mapping (provided): Action impact targeting ↔ city emissions (sector/subsector/GPC scope)

## Current state (repo)

- `hiap-meed/app/modules/prioritizer/blocks/impact.py` is **implemented**:
  - reads `Action.mitigation_impact["emissions"]` (`gpc_reference_number` list + `impact_text`)
  - reads city emissions totals per GPC key derived from the frontend request
  - computes raw scores from reduction share + timeline and max-normalizes per run
- `Action.mitigation_impact` stores the action mitigation impacts as a dict (direct from API mock).
- Mock action payload contains:
  - `timelineForImplementation`: `"<5 years" | "5-10 years" | ">10 years"`
  - `mitigationImpact.emissions`: includes:
    - `sector_number` (e.g., `"I"`)
    - `subsector_number` (e.g., `1`)
    - `gpc_reference_number` **as a list** (e.g., `["I.1.1", "I.1.2"]`)
    - `impact_text` (e.g., `"very low"`) as the canonical reduction band
    - `impact_numeric` (e.g., `1`) may be present but is not the mapping source

Important implementation note:

- `_read_gpc_reference_numbers()` in `impact.py` assumes the mock payload contract where
  `gpc_reference_number` is a **list** (e.g. `["I.1.1", "I.1.2"]`).
  This is a small but necessary first step for Impact explainability.

## Target behavior

The Impact block will compute one score per action that represents the action's
estimated emissions reduction share for the specific city, plus a small timeline
adjustment.

Concretely, for each action:

1. Read the action emissions entry from `Action.mitigation_impact["emissions"]`.
2. Read city emissions by `gpc_ref` from the frontend request payload
   (`cityEmissionsData.gpcData`) and sum `activities[].totalEmissions` per key.
3. Match action GPC refs with city GPC refs.
4. Convert `impact_text` to a reduction multiplier using the configured mapping.
5. Compute `total_reduction_amount` from matched `gpc_ref` values:
   - `sum(city_emissions_for_gpc_ref × reduction_multiplier)`
6. Normalize by total city emissions to get:
   - `reduction_share_of_city_emissions` (0..1)
7. Combine with timeline score using configured internal Impact weights:
   - `impact_raw = (WEIGHT_REDUCTION_SHARE × reduction_share_of_city_emissions) + (WEIGHT_TIMELINE × timeline_score)`
8. Max-normalize across actions in the run to produce final block scores in 0..1.

Actions that do not match any city GPC refs contribute 0 via the reduction share path.
Unknown `impact_text` values fail validation so scoring behavior stays deterministic.

Compute Impact using:

- **Activity relevance** from city emissions (new input, see “Data plumbing”)
- **Reduction multiplier** from the action’s `mitigationImpact.emissions.impact_text` band mapping
- **Timeline** as a small additive component (lower timeline = better)

Then normalize to 0.0–1.0 and emit evidence.

## Scoring design

### 1) Inputs

- **Action inputs** (per action, from existing internal `Action` model):
  - `Action.implementation_timeline` (from API `timelineForImplementation`)
  - emissions targeting row (from `Action.mitigation_impact["emissions"]`)
    - `gpc_reference_number` list
    - `impact_text` reduction band

- **City inputs** (new; required for city-specific relevance):
  - GPC-keyed activity emissions from the frontend request payload:
    - Source: `PrioritizerApiRequest.requestData.cityDataList[].cityEmissionsData.gpcData`
    - Use each GPC key’s `activities[].totalEmissions` values
    - If a GPC key has multiple activities, **sum** `totalEmissions` for that key

### 2) Mappings

#### A) Reduction multiplier mapping (action “emissions” band)

Use `impact_text` (canonical) with a configurable mapping table. Initial mapping:

- `very low` → 0.2
- `low` → 0.4
- `medium` → 0.6
- `high` → 0.8
- `very high` → 1.0

Implementation note:

- Keep this mapping in one config constant so new intermediate bands (e.g. `medium low`, `medium high`) can be added without changing scoring logic.
- Unknown `impact_text` values should fail fast with a clear validation error.

Rationale:

- This matches your request (“map very_low…very_high to 0.2–1.0”) and is compatible with the mock payload which already contains a 1–5 numeric value.

#### B) Timeline score mapping (lower = better)

Map `Action.implementation_timeline`:

- `"<5 years"` → 1.0
- `"5-10 years"` → 0.5
- `">10 years"` → 0.0
- missing/unknown → 0.0 (and flag in evidence)

### 3) Activity relevance (city-specific)

Compute a relevance fraction in 0.0–1.0:

1. Build `city_emissions_by_gpc_ref: dict[str, float]` from the frontend request payload:

- Iterate `PrioritizerApiRequest.requestData.cityDataList[].cityEmissionsData.gpcData`
- For each GPC key, sum all `activities[].totalEmissions` values (ignore `None`)
- Result: one total emissions number per `gpc_ref` key

2. Compute:

- `action_gpc_refs = action.mitigation_impact["emissions"]["gpc_reference_number"]`
- `matching_gpc_refs = [gpc_ref for gpc_ref in action_gpc_refs if gpc_ref in city_emissions_by_gpc_ref]`
- `total_reduction_amount = sum(city_emissions_by_gpc_ref[gpc_ref] * reduction_multiplier for gpc_ref in matching_gpc_refs)`
- `total_city_emissions = sum(city_emissions_by_gpc_ref.values())`
- `reduction_share_of_city_emissions = total_reduction_amount / total_city_emissions` (guard `total_city_emissions == 0`)

This means:

- A `gpc_ref` contributes only if it exists in both city emissions and the action mapping.
- If an action targets a `gpc_ref` with zero/no city emissions, that key contributes `0`.
- Example: city `I.1.1 = 1000`, action targets `I.1.1`, reduction multiplier `0.6` → reduction amount `600`, normalized relevance `600 / 1000 = 0.6`.

Evidence should capture:

- which `gpc_ref` values were matched
- targeted emissions and share
- all contributing refs

### 4) Combining components (with explicit internal weights)

You asked for explicit **within-block weights** and normalization clarity.

We use an _additive_ combination (easy to interpret) while staying conceptually aligned with the Impact concept:

- `impact_raw = (WEIGHT_REDUCTION_SHARE × reduction_share_of_city_emissions) + (WEIGHT_TIMELINE × timeline_score)`

Proposed internal weights (constants in `app/modules/prioritizer/config.py`):

- `WEIGHT_REDUCTION_SHARE = 0.80`
- `WEIGHT_TIMELINE = 0.20`
- (guarantees \(WEIGHT_REDUCTION_SHARE + WEIGHT_TIMELINE = 1.0\))

Rationale:

- keeps Impact mostly driven by estimated reduction share, while still rewarding quicker wins
- makes each component’s contribution explainable and stable

### 5) Normalization (Impact block output)

Impact block should output **0.0–1.0** scores so that pillar weights in `config.DEFAULT_WEIGHTS` remain interpretable.

Normalization strategy:

- `impact_score = impact_raw / max(impact_raw over all actions)` if max > 0 else 0.0 for all actions

This preserves ordering while keeping block output in [0, 1].

Normalization policy decision:

- Use **max-normalization**, not sum-normalization.
- This means block scores do **not** sum to 1 across actions.
- Rationale: ranking stays stable when candidate set size changes, and `1.0` always means “best action in this block for this run”.

## Evidence contract (Impact)

For each action ID, include (suggested keys):

- `action_gpc_refs`: list[str] (deduped)
- `matched_city_gpc_refs_count`: int
- `reduction_share_of_city_emissions`: float (0..1)
- `reduction_multiplier`: float (0.2..1.0)
- `timeline_score`: float (0..1) + `timeline_bucket`: str | None
- `impact_raw`: float
- `impact_normalized`: float
- `gpc_contributors`: list of objects for all contributing `gpc_ref` values, e.g.:
  - `{"gpc_ref": "II.1.1", "city_emissions": 123.4, "share_of_city": 0.22}`

## Data plumbing plan (MEED-aligned, Notion-first)

Impact cannot be city-specific without city emissions inputs. In MEED, **city emissions are always provided via the frontend request payload** (`cityEmissionsData.gpcData`) and are not fetched from any other source.

### 1) Derive city emissions by GPC ref key at request time

- Build `city_emissions_by_gpc_ref` from `FrontendCityEmissionsData.gpcData` (see “Activity relevance”)
- Pass that map into `impact.run(...)`

### 2) Update orchestrator wiring

In `hiap-meed/app/modules/prioritizer/orchestrator.py`:

- Accept city emissions input derived from the request and pass it into the Impact block.

### 3) Update Impact block signature

In `hiap-meed/app/modules/prioritizer/blocks/impact.py`:

- Change `run(actions)` → `run(actions, city_emissions_by_gpc_ref)`

## Test plan

Add focused unit tests for Impact:

- **GPC ref extraction**
  - handles `gpc_reference_number` as list (current mock shape)
- **Reduction mapping**
  - `impact_text` band mapping to multiplier (including failure on unknown bands)
- **Timeline mapping**
  - `<5` > `5-10` > `>10`
- **Activity relevance**
  - action targeting the highest-emitting city activities should rank higher, holding other factors constant
- **Normalization**
  - max normalized score equals 1.0 (unless all scores are zero)

## Known repo gaps / prerequisites (to fix as part of Impact work)

These are blockers or sharp edges that should be addressed in the same PR(s) as Impact:

- **City mock payload shape**
  - Addressed: `MockCityDataApiClient` now supports both `data/mock/city_api_mock.json` (`{"city": ...}`) and
    legacy list-shaped payloads (`{"cities": [...]}`), so tests and local runs can use either.

## Rollout steps (suggested)

1. Wire request emissions (`cityEmissionsData.gpcData`) → Impact and emit evidence.
2. Implement Impact scoring + normalization + tests.
3. Update `hiap-meed/docs/detailed-block-architecture.md` status table:
   - Impact | Activity relevance × reduction band × timeline → **Implemented**
