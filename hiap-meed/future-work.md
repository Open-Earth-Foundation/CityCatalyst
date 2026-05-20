# Only add information to this file that was clearly stated. Do not invent or assume future implementation work.

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

## Post-ranking explanations (new v1 stage)

- **Current (v1)**: optional LLM explanations are generated after ranking from implemented in-memory evidence (impact/alignment/feasibility/hard-filter), canonically in English, with optional stateless translation into requested non-English languages.
- **Current limitations**:
  - explanations do not yet receive richer alignment-specific UI summaries beyond the current resolved preferred co-benefits and matched preferred co-benefits carried in standard evidence.
- **Expectation**: explanations should explicitly avoid inventing reasoning for these unimplemented signals until their scoring/evidence pipelines exist.
- **Future work**: consider adding an in-memory, process-local translation cache keyed by canonical explanation text, source language, target language, translation model, and prompt version to reduce repeated translation token usage without introducing persistent state.

## Replace remaining mock data clients with real upstream API calls

- **Current**: the pipeline defaults to mock (file-backed) data. The `Api*` data clients exist but intentionally raise `NotImplementedError` so misconfiguration fails fast.
- **Future**: implement synchronous HTTP clients for upstream data and switch to `HIAP_MEED_*_DATA_SOURCE=api` in deployment.
- **Where**:
  - `hiap-meed/app/services/data_clients.py`
    - `ApiCityDataApiClient.get_city(locode)`
    - `ApiActionDataApiClient.list_actions()`
    - action policy scores now use `ApiActionPolicyScoresDataApiClient.get_action_policy_scores(locode)`
- **Notes**:
  - keep responses validated through Pydantic models in `app/modules/prioritizer/models.py`
  - define base URLs / auth via environment variables (avoid hardcoding)
  - keep error behavior explicit (timeouts, non-200s, malformed payloads)
