# Stationary Energy agentic flow — `carlos/stationary-energy-demo`

Branch off `ON-5782-CC-AF-adjustments`. Reworks the Stationary Energy agentic
draft flow: fast deterministic drafting for trivial rows, the agent (LLM) for
genuine multi-source conflicts, correct notation-key handling, and a clearer UI.

## Highlights

### Generation (Climate Advisor backend)
- **Staggered generation** in a background task with its own DB session; `/start`
  returns immediately (`generating`) and proposals stream in per batch.
- **Deterministic fast-path** (`build_deterministic_proposals`):
  - 0 sources -> **gap**; 1 source -> **ready** (copies the source data row verbatim);
  - **notation key** (`NO`/`NE`/`IE`/`C`/`NA`, from the global API `source_data.notation_key`)
    -> a "not occurring / not estimated / ..." proposal, distinct from a blind gap;
  - sources that match a row but carry no emissions value are filtered out.
- **Hybrid agent:** rows where **>=2 real-emissions sources compete** are routed to
  the agent to reason about and explain the trade-offs, with a **per-batch
  deterministic fallback** if the LLM is unavailable.
- **Demo synthetic conflict** (`SE_DEMO_SYNTHETIC_CONFLICT=true`): clones one
  emissions source into a competitor so a row becomes a real conflict the agent
  resolves (the seeded cities otherwise have no genuine conflicts). Injected in
  `_load_context_response` so the staleness check stays consistent.

### Front-end
- **Live polling** while generating (stops at `ready` — fixes a bug where it kept
  polling during review and reset the user's selection).
- **Emissions shown** in the row list and decision cards (they were nested under
  `row.gases[].emissions_value` and previously never displayed).
- **Split-pane UX:** decision cards moved out of the Clima chat (which they
  flooded) into a right-side **"Source review"** focus pane; the row list is
  clickable, highlights the selected row, and scrolls it into view; a
  **"Staged decisions (N)"** running list accumulates as the user picks.
- **Notation labels** ("Not occurring (NO)", etc.).
- **Header / button polish:** title is just "Stationary Energy" (separated from
  the draft state); **+ New draft** button with icon; "Ask about this row"
  stacked under the helper text.

### Demo helper
- `app/scripts/seed-brazil.ts` — seeds a Brazil Demo project + cities/inventories
  (idempotent, localhost-guarded). Run: `npx tsx scripts/seed-brazil.ts`.

## Local config (NOT committed — `.env` is gitignored)
- `climate-advisor/.env`: a valid `OPENROUTER_API_KEY`, `CA_FEATURE_FLAGS=STATIONARY_ENERGY_AGENTIC`,
  and `SE_DEMO_SYNTHETIC_CONFLICT=true` for the demo conflict.
- `app/.env`: `STATIONARY_ENERGY_AGENTIC` + `CA_SERVICE_INTEGRATION` feature flags,
  matching `CC_SERVICE_API_KEY`/`CC_API_KEY`, `CA_BASE_URL=http://localhost:8080`.
- CA runs the pristine `llm_config.yaml` (gpt-5.4 via OpenRouter).

## Operational notes
- **Always start a new draft** to see new behavior — the browser resumes the last
  draft id from localStorage, and existing drafts are frozen snapshots.
- **Rebuild CA after backend changes** with
  `docker compose up -d --build --force-recreate climate-advisor`.
- Set `SE_DEMO_SYNTHETIC_CONFLICT=false` + rebuild CA to run on real
  (conflict-free) data.

## Notable behavior of the seeded data
The seeded Brazil cities (Curitiba / São Paulo / Rio) have no genuine multi-source
emissions conflicts — the global API returns at most one emissions source per
subcategory (plus notation-key sources). So without the demo flag all rows
resolve deterministically; the agent conflict path engages only with the demo
flag or on data that actually has competing sources. The conversational Clima
chat remains LLM-powered throughout.
