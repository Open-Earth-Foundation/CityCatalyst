# Future work (HIAP-MEED)

This file tracks agreed enhancements that are not implemented yet in the
current prioritization pipeline.

## Legal constraints and soft requirements (Feasibility stage)

Source: Notion "How Legal Signals, Policy Signals, and Socioeconomic Indicators Work in HIAP Ranking"
`https://www.notion.so/openearth/How-Legal-Signals-Policy-Signals-and-Socioeconomic-Indicators-Work-in-HIAP-Ranking-319eb557728b80d4bf84edb7edd0449a?source=copy_link`

### 1) Non-blocking legal constraints -> feasibility evidence

- **Intent**: requirements that do not gate eligibility should appear as implementation notes.
- **Status**: partially implemented.
  - Feasibility already captures `strength="informational"` requirements as evidence-only rows.
- **Remaining**: derive UI-friendly implementation-note strings.
  - **Where**: `hiap-meed/app/modules/prioritizer/blocks/feasibility.py`
  - **Output**: feasibility evidence should include:
  - a structured list of constraint requirement rows (signal, operator, scope, evidence IDs)
  - a derived human-readable note list suitable for UI display ("permit may apply", "public procurement required", etc.)
- **Hard Filter should not emit these**, because constraints do not determine eligibility.

## Free-text exclusions -> stronger preview matching

Source: Notion "Data Reviews" (exclusion intent)
`https://www.notion.so/openearth/Data-Reviews-2eceb557728b808e9537da57340bf43a?source=copy_link`

- **Current**: exclusion preview resolves deterministic sector and negative co-benefit filters, and can optionally use a guarded LLM resolver for clear free-text matches.
- **Future**:
  - add curated activity tags to the action catalog for common objections such as fossil fuels, incineration, or highway expansion
  - add richer preview warnings for partially matched phrases
  - store source metadata for confirmed exclusions when the frontend sends it back to ranking
- **Guardrail**:
  - ranking should continue consuming confirmed `excludedActionIds` only

## Preview orchestration and artifact ownership

- **Current**:
  - prioritization artifact writing lives in `hiap-meed/app/modules/prioritizer/orchestrator.py`
  - exclusion preview artifact writing lives directly in `hiap-meed/app/modules/prioritizer/api.py`
  - both APIs now write artifacts, but the ownership layer is different because prioritization has a dedicated orchestrator and preview does not
- **Future**:
  - add a small preview orchestrator if the preview flow grows further
  - move preview artifact writing and run-level diagnostics out of `api.py` into that orchestrator
  - keep the API route thin so both APIs follow the same structure: route -> orchestrator -> services
- **Why this may help**:
  - keeps request-level logging and artifact behavior consistent across both APIs
  - gives the preview flow a clearer home for future fetch/validation/LLM stages
  - avoids crowding `api.py` with orchestration concerns over time

## City "other preference" alignment scoring improvements (Alignment stage)

- **Current**: implemented.
  - `cityStrategicPreferenceOther` is mapped with OpenAI structured output into the allowed co-benefit taxonomy.
  - The current score uses only city-selected co-benefits, reads each selected action `impact_numeric` value, and normalizes the summed result into `0..1`.
  - The block already emits evidence such as resolved preferred co-benefits, unmappable fragments, matched preferred co-benefits, and mapping source/model.
- **Future**: improve the scoring logic, not just the mapping.
  - Decide whether some co-benefits should matter more than others.
  - Decide whether partial semantic matches should receive different weights.
- **Where**:
  - `hiap-meed/app/modules/prioritizer/services/co_benefit_mapping.py`
  - `hiap-meed/app/modules/prioritizer/blocks/alignment.py`

## Post-ranking explanations (new v1 stage)

- **Current (v1)**: optional LLM explanations are generated after ranking from implemented in-memory evidence (impact/alignment/feasibility/hard-filter).
- **Current limitations**:
  - explanations cannot yet reason over future-work features that are still stubs, including richer implementation-note generation from non-blocking legal constraints.
  - explanations do not yet receive dedicated co-benefit mapping artifacts such as resolved preferred co-benefits or unmappable fragments for `cityStrategicPreferenceOther`; they rely on downstream alignment evidence plus the raw request context instead.
- **Expectation**: explanations should explicitly avoid inventing reasoning for these unimplemented signals until their scoring/evidence pipelines exist.

## Replace mock data clients with real upstream API calls

- **Current**: the pipeline defaults to mock (file-backed) data. The `Api*` data clients exist but intentionally raise `NotImplementedError` so misconfiguration fails fast.
- **Future**: implement synchronous HTTP clients for upstream data and switch to `HIAP_MEED_*_DATA_SOURCE=api` in deployment.
- **Where**:
  - `hiap-meed/app/services/data_clients.py`
    - `ApiCityDataApiClient.get_city(locode)`
    - `ApiActionDataApiClient.list_actions()`
    - `ApiLegalDataApiClient.get_action_legal_requirements(locode)`
    - `ApiPolicySignalsDataApiClient.get_action_policy_signals(locode)`
- **Notes**:
  - keep responses validated through Pydantic models in `app/modules/prioritizer/models.py`
  - define base URLs / auth via environment variables (avoid hardcoding)
  - keep error behavior explicit (timeouts, non-200s, malformed payloads)
