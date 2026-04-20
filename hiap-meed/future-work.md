# Future work (HIAP-MEED)

This file tracks agreed enhancements that are **not implemented yet** in the
current prioritization pipeline.

## Legal constraints and soft requirements (Feasibility stage)

Source: Notion “How Legal Signals, Policy Signals, and Socioeconomic Indicators Work in HIAP Ranking”  
`https://www.notion.so/openearth/How-Legal-Signals-Policy-Signals-and-Socioeconomic-Indicators-Work-in-HIAP-Ranking-319eb557728b80d4bf84edb7edd0449a?source=copy_link`

### 1) Non-blocking legal constraints → feasibility evidence

- **Intent**: requirements that do not gate eligibility (Notion “constraint”) should appear as **implementation notes**.
- **Status**: partially implemented.
  - Feasibility already captures `strength="informational"` requirements as evidence-only rows.
- **Remaining**: derive UI-friendly “implementation note” strings.
  - **Where**: `hiap-meed/app/modules/prioritizer/blocks/feasibility.py`
  - **Output**: feasibility evidence should include:
  - a structured list of constraint requirement rows (signal, operator, scope, evidence IDs)
  - a derived human-readable note list suitable for UI display (“permit may apply”, “public procurement required”, etc.)
- **Hard Filter should not emit these**, because constraints do not determine eligibility.

## Free-text exclusions → semantic matching (Hard Filter stage)

Source: Notion “Data Reviews” (exclusion intent)  
`https://www.notion.so/openearth/Data-Reviews-2eceb557728b808e9537da57340bf43a?source=copy_link`

- **Current**: `excludedActionsFreeText` is accepted but is a stub (no actions excluded).
- **Future**: implement `_resolve_excluded_action_ids_from_text(...)` in
  - `hiap-meed/app/modules/prioritizer/blocks/hard_filter.py`
- **Approach** (initial):
  - semantic matching / fuzzy matching over `Action.action_name` and `Action.description`
  - produce a resolved `excluded_action_ids` set + evidence on matched actions and rationale
- **Guardrails**:
  - never exclude unless confidence is high and the UI can show “why”
  - consider a “preview only” mode if/when the frontend needs human confirmation

## City "other preference" alignment scoring improvements (Alignment stage)

- **Current**: implemented.
  - `cityStrategicPreferenceOther` is mapped with OpenAI structured output into the
    allowed co-benefit taxonomy.
  - The current score uses only city-selected co-benefits, reads each selected
    action `impact_numeric` value, and normalizes the summed result into `0..1`.
  - The block already emits evidence such as resolved preferred co-benefits,
    unmappable fragments, matched preferred co-benefits, and mapping source/model.
- **Future**: improve the scoring logic, not just the mapping.
  - Decide whether some co-benefits should matter more than others.
  - Decide whether partial semantic matches should receive different weights.
- **Where**:
  - `hiap-meed/app/modules/prioritizer/services/co_benefit_mapping.py`
  - `hiap-meed/app/modules/prioritizer/blocks/alignment.py`

## Replace mock data clients with real upstream API calls

- **Current**: the pipeline defaults to mock (file-backed) data. The `Api*` data
  clients exist but intentionally raise `NotImplementedError` so misconfiguration
  fails fast.
- **Future**: implement synchronous HTTP clients for upstream data and switch
  to `HIAP_MEED_*_DATA_SOURCE=api` in deployment.
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

