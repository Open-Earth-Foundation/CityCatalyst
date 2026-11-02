# CC-962 – SEEG source provenance (dataset_year / geography_match)

- Checkout: `C:\Users\WBW\.t3\worktrees\CityCatalyst\t3-087e912a`
- Branch: `t3/087e912a`, base `9a74627ee590a137febe38ab3b7e15a04d2e8f11`, patch commit `5c04cc616466cdc1b0f550588cd00f4f252b5106` (local only, not pushed)
- Changed files:
  - `app/src/backend/agentic/ghgi/stationary-energy/context.ts`
  - `app/tests/stationary-energy-context-provenance.jest.ts` (new)
- Climate Advisor: no change needed – it passes `dataset_year`, `geography_match`, `confidence_notes` unchanged from load-context into the persisted draft, `STATIONARY_ENERGY_DRAFT_CONTEXT_JSON` and review evidence (`stationary_energy_draft_context.py:66-79`, `stationary_energy_chat_context.py:73-83`, `stationary_energy_review_resolver.py:127-129`).

## Root cause

`buildSourceCandidate` built the candidate metadata from the catalogue entry instead of the record that was fetched:
- `dataset_year = source.startYear` – the first year the catalogue covers (SEEG: 2015), not the year of the record.
- `geography_match = resolveGeographyMatch(source.geographicalLocation)` – the catalogue coverage (SEEG: `BR`), so the result was `country`.
- `quality_score` and `confidence_notes` compared `startYear` with `inventory.year`, so they gave no quality score and said "Country-level source."

`DataSourceService.retrieveGlobalAPISource` actually requests `.../SEEG/city/BR SAO/2022/I.1.1`, putting `inventory.year` in `:year` and the city locode in `:locode`. The Global API response has no year or location fields, so the request parameters are the only reliable provenance. CA and the UI used this wrong metadata as authoritative. That is why UC01 and UC02 both said "2015 / national".

## Fix (one shared boundary: `buildSourceCandidate` → `resolveRecordProvenance`)

Provenance rules:
| Case | dataset_year | geography_match |
|---|---|---|
| Record fetched, endpoint has `:year` | `inventory.year` (requested year) | see below |
| Record fetched, endpoint has no `:year` | `null` (unknown, not borrowed from the catalogue) | see below |
| Retrieval failed (`failed`) | `null` | request shape (below) |
| Removed by `filterSources` (not requested) | `null` | catalogue coverage (old behaviour) |

Request-shape geography: `global_api_downscaled_by_population` → `country`; `..._by_region_population` → `region`; `:locode`/`:actor_id` (when the city has a locode) → `city`; `:country` → `country`; otherwise catalogue coverage (e.g. `EARTH` → `global`).

`quality_score = "1"` and the note "matches the inventory year" only apply when the year of the fetched record equals the inventory year. Population-downscaled records get "(scaled to the city by population)". Emissions values, scaling and `source_data` are unchanged (I.1.1 `co2eq_100yr = 1117504701`, scaleFactor 1).

## Verification (local, mocked provider)

`app/tests/stationary-energy-context-provenance.jest.ts` runs the real `buildStationaryEnergyContext`, `filterSources`, `getSourceWithData` and `retrieveGlobalAPISource`. Only `fetch` (frozen SEEG I.1.1 body from the 1 Nov evidence), the catalogue lookup and the DB reads are mocked. It also checks the UI helpers `sourceMetaLabel` / `sourceLabel`.

| Run | Result |
|---|---|
| New test on original `context.ts` (HEAD 9a74627) | 4 failed / 4 – received `dataset_year 2015`, `geography_match country`, `quality_score null`, `"Country-level source."` |
| New test + `stationary-energy-context` + `stationary-energy-draft-display` after fix | 3 suites, 16/16 passed |
| `npx jest tests/stationary-energy` after fix | 11 suites passed, 54/54 tests. `stationary-energy-chat-resume.jest.tsx` fails to parse (top-level `await` in the test file). The failure is a Jest config issue and the test does not import the changed code. |
| `npx tsc --noEmit -p tsconfig.json` | 0 errors |
| `npx eslint` + `npx prettier --check` (changed files) | clean |

Commands (from `app/`, after `npm ci --ignore-scripts`):
```
npx jest tests/stationary-energy-context-provenance.jest.ts tests/stationary-energy-context.jest.ts tests/stationary-energy-draft-display.jest.ts --coverage=false
```

Not done: real provider reads, live CA/LLM, UI browser runs, CA pytest (CA code unchanged).

## Existing data

Old CA drafts store the candidates from when the draft was created, so they keep showing `2015 / country`. Nothing rewrites them. You need a fresh or explicitly regenerated Stationary Energy draft, which calls load-context again, to see `2022 / city`. Inventory values are not affected.

## Reproducing UC01 / UC02 on this patch

1. Run the app from this checkout with the CA it normally uses and `STATIONARY_ENERGY_AGENTIC` enabled. Use the São Paulo GPC inventory for 2022 and a Global API that serves `SEEG/city/BR SAO/2022/I.1.1`.
2. Start a **new** Stationary Energy draft. Optional check: `POST /api/v1/internal/ca/capabilities/ghgi/stationary-energy/load-context` should return the SEEG I.1.1/I.2.1 candidates with `dataset_year: 2022`, `geography_match: "city"`, `confidence_notes: "City-level source matches the inventory year."`.
3. UC01: ask for energy data sources, confirm, then ask which sources cover which categories and what to check. Expected: municipal / 2022, not 2015 / national.
4. UC02: ask about SEEG residential buildings Scope 1 / I.1.1 (source, year, amount, fit to the 2022 inventory). Expected: SEEG, municipal São Paulo 2022, 1,117,504,701 kgCO2e, I.1.1 unchanged.

## Limitations

- The record year comes from the request (`:year` = inventory year). The Global API does not return a year. If a provider ever answered with another year's data for that path, this code could not detect it. This is marked with a `shortcut:` comment in the code.
- Geography for failed retrievals reflects the requested granularity, not a fetched record.
- No changes to population tools, NO recommendations, rounding, units, source replacement or permissions (out of scope).
