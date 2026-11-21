# CC-962: GHGI Agentic Gap Table

Compares what Clima can do in the GHG Inventory journey today with the
ON-5797 Definition of Done ("Build Full GHGI Agentic Flow") and
`docs/AgenticModuleScope.md`. Read from `develop` at `6a9ab077f` (2026-10-26).
It still needs review with product and engineering.

Scenarios that test this surface: `CC-962-clima-ghgi-scenarios.md`.

## Current agentic surface

Clima has two GHGI surfaces. Each one registers different tools in
`climate-advisor/service/app/services/agent_service.py::create_agent`.

| Surface | Where | Prompt | Tools | Writes |
| --- | --- | --- | --- | --- |
| General Clima chat | "Ask Clima" chat on city and inventory pages | `prompts/core.md` + `prompts/chat.md` | `inventory_list_accessible`, `inventory_status_overview`, `inventory_emissions_context`, `get_all_datasources`, `climate_vector_search`, `native_input_discover`, `native_input_read` (HIAP / HIAP-MEED) | None. Every capability is a query (`writesCommittedProductData: false` in `app/src/backend/agentic/ghgi/inventory/registry.ts`) |
| Stationary Energy builder | GHGI → "Draft with agents" (`CA_SERVICE_INTEGRATION` + `STATIONARY_ENERGY_AGENTIC`) | `prompts/stationary_energy_review.md` | Before a run: `stationary_energy_start_draft` + inventory status/emissions. During a run: 16 `stationary_energy_*` review tools (accept, stage notation key, bulk confirmations, rollback, save) | Stationary Energy rows only, after explicit review and save through the CC internal commit route |

Other facts:

- **File upload:** the chat UI has no upload control (`app/src/components/ChatBot`).
  Import (CSV, XLSX, PDF) exists only in the UI flow
  ("Add new inventory" → "Import inventory").
- **Import jobs:** Clima has no tool that reads an import job, its mappings, its
  status or its row counts.
- **State split:** CA stores threads, messages and pre-commit Stationary Energy
  drafts. CC stores committed inventory values, permissions and version history.
- **Permissions:** tools call CC with the user's token. CC checks inventory access
  on every call. A user who cannot access an inventory gets the same answer as for
  one that does not exist.
- **Traceability:** MLflow logs one trace per turn, with redacted tool spans, when
  `MLFLOW_ENABLED=true` (`utils/conversation_observability.py`). LangSmith is
  optional. Stationary Energy drafts also persist a `trace_id`.
- **Prompt grounding:** `prompts/chat.md` lists what Clima can read, but never
  what it cannot do: no upload, no create, no edit, no import status. That
  matches the 2026-09-24 finding: Clima offered "upload the PDF here".

## Gap table

Status: **Done**, **Partial** or **Missing**, for general chat and for the
Stationary Energy (SE) builder.

### ON-5797 Definition of Done

| # | Requirement | General chat | SE builder | Gap |
| --- | --- | --- | --- | --- |
| D1 | All GPC BASIC+ sectors (SE, Transport, Waste, IPPU, AFOLU) reachable through the agentic flow | Missing (read-only summary of all sectors) | Partial (SE only) | Agentic entry for Transport, Waste, IPPU and AFOLU. SE context loader is sector-specific (scope doc says to generalize after the second sector) |
| D2 | Missing third-party data offers 4 paths: manual input, assisted input, data research request, user data upload | Missing | Partial (source-backed proposals and notation keys NE/NO; no manual value, research request or upload) | Manual and assisted input tools, research-request task, upload path |
| D3 | User CSV/Excel upload parsed and mapped to the right GPC reference, at least Transport fuel sales | Missing (no upload control, no file tool) | Missing | Chat upload and agentic entry to the ingestion spine (CC-953 / CC-960); Transport mapping |
| D4 | Agent triggers inventory calculation and returns results in chat | Partial (reads totals and sector shares; cannot trigger) | Partial (save writes SE rows; no separate calculate step) | Explicit recalculate step and post-save result summary in chat |
| D5 | Agent imports an external inventory (parity with the UI import) | Missing | Missing | Import workflow capability: start, status, mapping review, approve (scope doc "GHGI Import"), backed by the spine |
| D6 | End-to-end test: full inventory through the agentic flow with gaps, at least 2 fallback paths | Missing | Missing | Needs D1 and D2 first. Scenario set from CC-962 is the starting eval |
| D7 | Agentic inventory identical to UI inventory (schema, version control, audit trail) | n/a (no writes) | Partial (writes through the CC internal commit route) | Check that SE saves create version-history entries the same way the UI does (Stationary Energy backtest, CC-962 scope 3) |

### `AgenticModuleScope.md` GHGI capabilities

| # | Capability | General chat | SE builder | Gap |
| --- | --- | --- | --- | --- |
| S1 | GHGI onboarding: check prerequisites, prepare inventory, create after confirmation | Missing (can only list existing inventories) | n/a | `ghgi.inventory.create` command with a confirmation step |
| S2 | GHGI import: start, status, mapping review, approval, final report | Missing | n/a | Same as D5. Also no read of an existing import job, so "why fewer rows?" cannot be answered |
| S3 | Entry and data sources: find missing data, explain sources | Done (`inventory_status_overview`, `get_all_datasources`) | Done (source candidates per row) | `get_all_datasources` is marked "temporary legacy" in the tool policy |
| S4 | Entry and data sources: confirmed source-connect, manual edits, notation keys | Missing | Partial (source accept and notation keys with confirmation; no manual edit) | Manual value edit command, non-SE sectors |
| S5 | Results: summarize emissions and drivers | Done (`inventory_emissions_context`) | Done (status/emissions on the SE page) | None for reads |
| S6 | Results: publish, CDP, restore behind confirmation | Missing | Missing | Commands with the shared pending-action model |
| S7 | Capability registry (id, operation type, scope, confirmation, schemas) | Partial (GHGI inventory registry: 3 queries) | Done (SE registry) | One registry that also drives CA tool generation and step scoping |
| S8 | Shared pending-action and confirmation model | n/a | Partial (SE-specific confirmation tools) | Generic preflight / confirm / result model to reuse for import, edits and publish |
| S9 | Shared workflow runtime (start, status, result, retry, failure shape) | n/a | Partial (SE draft: start, status, list, resume, retry, review, save) | Generalize for import and other sectors |
| S10 | Observability: correlation id, workflow id, one trace per turn, audit artifact | Partial (MLflow turn traces with tool spans when enabled) | Partial (MLflow + `trace_id` on draft) | Confirm MLflow is on in staging. Scenario runs must record the trace id. No durable per-run audit artifact for general chat |
| S11 | Prompt states capability limits (no invented features) | Missing (`prompts/chat.md` has no "cannot do" list) | Done (SE prompt scoped to the run) | Add the limits list to `prompts/chat.md` and route users to the UI flow (bug from the 2026-09-24 finding) |

## Takeaways for ON-5797

1. General Clima is read-only for GHGI. Every creation, import, upload and edit
   request has to be routed to the UI today. The main risk now is grounding:
   offering features that do not exist. Fixing that is a prompt change (S11).
2. The only agentic write path is the SE builder. It already uses the target
   pattern: CA draft state, explicit review, commit through CC. Agentic import
   should reuse this pattern on top of the ingestion spine (CC-953) rather than
   add its own file parsing.
3. Import has no agent-readable state. Even read-only help on imports
   ("why fewer rows?") needs a `ghgi.import.status` query before any write
   capability exists.
