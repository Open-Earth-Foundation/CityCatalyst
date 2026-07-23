# MEED+ / HIAP v3 → CityCatalyst module

**Status:** proposal for review — nothing here is approved or scheduled.
**Companion docs:** [`MeedModuleMigration-Inventory.md`](./MeedModuleMigration-Inventory.md) (mechanical audit) · [`MeedModuleMigration-Interop.md`](./MeedModuleMigration-Interop.md) (module interoperability)

---

## 1. What this is

The MEED+ prioritizer lives today at
[`Open-Earth-Foundation/meed-mitigation-prioritizer-frontend`](https://github.com/Open-Earth-Foundation/meed-mitigation-prioritizer-frontend)
— a standalone Vite / React 19 / Tailwind 4 / Radix (shadcn) SPA with a thin Express shim in
front of it. It ranks climate mitigation actions for Chilean cities and produces per-action
output plans.

It already talks to two CityCatalyst-owned backends:

- **`hiap-meed`** — the MEED scoring service, which **already lives in this monorepo** at
  [`hiap-meed/`](../hiap-meed), with its own CI (`.github/workflows/hiap-meed-*.yml`), k8s
  manifests, and a deployed `hiap-meed-service-dev`.
- **Global API** (`ccglobal.openearth.dev`) — action pathways, city attributes, policy scores,
  mitigation/financial feasibility, climate-finance projects and opportunities.

The goal is to make MEED+ a first-class CityCatalyst module: a card in the Journey Navigator's
Modules screen, gated by CityCatalyst auth and `ProjectModules` access, built to CityCatalyst
conventions (Next App Router, Chakra v3, RTK Query, i18next, Sequelize), and reading emissions
from the **Inventories (GHGI) module** rather than from bundled JSON.

### Decisions already taken

| | |
|---|---|
| Module identity | Its own standalone module card — not folded into the existing "Actions & Plans" (HIAP) card |
| Migration approach | **Direct native rewrite.** No POC-URL card, no iframe embed, no intermediate step |
| Data | Onboard **all** Chilean municipalities as real CityCatalyst cities with inventories — not just the 20 pilot cities — and have the module read them through the inventory layer |
| Docs | Here, in `docs/`, alongside `AgenticModuleScope.md` and `ConceptNoteBuilderArchitecture.md` |

---

## 2. Why it can't ship as-is: three structural problems

### 2.1 The frontend calls the Global API directly from the browser

**16 `fetch()` call sites across 7 files, hitting 6 distinct endpoints** bypass any backend and
reach `ccglobal.openearth.dev` straight from the
client. Meanwhile `hiap-meed` fetches the *same* endpoints server-side, through its own service
layer ([`hiap-meed/app/services/`](../hiap-meed/app/services)): `action_pathways_api.py`,
`action_policy_scores_api.py`, `action_mitigation_feasibility_scores_api.py`,
`action_financial_feasibility_scores_api.py`, `city_attributes_api.py`,
`climate_finance_opportunities_api.py`, `climate_finance_projects_api.py`.

Two independent readers, each applying its own filtering, sector mapping and naming, is the
**direct cause of the observed discrepancies between what a user sees on screen and what appears
in the generated report.** Full call-site list in the [inventory doc](./MeedModuleMigration-Inventory.md#1-external-api-call-sites).

### 2.2 No real auth, no real persistence

Access control is a client-side password constant (`components/PasswordGate.tsx`) — a privacy
curtain, explicitly not security.

All application state lives in `localStorage` under `hiap:<locode>:*` — six key families covering
strategic preferences and scoring weights, confirmed exclusions, ranked results, the
prioritization snapshot that feeds report generation, per-step wizard progress, and language
choice. The prototype's own `lib/pipelineRunner.ts` already carries the TODO:

> once the frontend moves into CityCatalyst, persist the snapshot in the CityCatalyst database
> instead of localStorage so it survives cache clears. Also: add staleness detection.

### 2.3 Data is bundled, not sourced

- 20 Chilean city inventories compiled into the JS bundle (`src/data/inventories/*.json`, read by
  `lib/cityInventory.ts`)
- a 5,241-line hardcoded `src/data/cities.ts`
- a stale `data/actions.json` action snapshot, whose country-specific text (Brazilian actions
  surfacing on Chilean cities) is the reason `lib/actionCatalog.ts` was added to overlay the live
  catalog on top of it

The silver lining: **those bundled inventory JSONs are literally CityCatalyst inventory API
responses**, snapshotted. Their shape is `data.inventoryValues[].{gpcReferenceNumber, co2eq,
subSector.subsectorName}` — so the DB-backed replacement can be validated against them exactly.

---

## 3. What already exists in CityCatalyst

The single most important finding of this audit: **most of the platform work is already done.**

| Need | Already in this repo |
|---|---|
| MEED scoring backend | [`hiap-meed/`](../hiap-meed) — `POST /v1/prioritize`, `/v1/prioritize/exclusions/preview`, `/v1/reports/output-plan`, `/v1/explanations/translate` |
| Module registry + access gating | `Module` / `ProjectModules` models, `ModuleService`, `ModuleAccessService`, `useModuleAccess`, `useModuleAccessLayout` |
| Modules screen | `components/HomePageJN/HomePage.tsx` groups a project's modules by `stage` into accordions and renders `ModuleCard.tsx` |
| Module page shell precedent | `app/[lng]/cities/[cityId]/HIAP/{layout,HIAPClientLayout,page}.tsx` |
| Auth | NextAuth v4 + `apiHandler` (`util/api.ts`), resolving session / Bearer JWT / PAT / OAuth / service-to-service |
| Inventory → prioritizer bridge (partial) | `HiapService.getCityContextAndEmissionsDataImpl` |
| Emissions aggregation | `ResultsService.getTotalEmissionsBySector` / `getTotalEmissionsBySectorAndSubsector` |
| Bulk city + inventory creation | `POST /api/v1/admin/bulk`, `BulkInventoryCreationTabContent.tsx`, the eCRF/CSV import pipeline |
| Ranking persistence precedent | `HighImpactActionRanking` / `HighImpactActionRanked` / `ActionPlan` |
| Long-running job pattern | `HighImpactActionRankingStatus`, `api/v1/inventory/[inventory]/hiap/status`, `api/v1/cron/check-hiap-jobs` |
| Module dashboards | `ModuleDashboardService`, `city/[city]/modules/<m>/dashboard`, `components/ModuleWidgets/` |

### The one significant gap

`HiapService.getCityContextAndEmissionsDataImpl` passes the prioritizer **five sector totals**
(stationary energy, transportation, waste, IPPU, AFOLU). MEED's `/v1/prioritize` needs
**GPC-reference-level `gpcData`** — a map keyed by `gpcReferenceNumber`, each with an activities
array. That richer builder is the most important new piece of backend work, and it is also the
first concrete instance of one module reading another's data — see the
[interoperability doc](./MeedModuleMigration-Interop.md).

---

## 4. Analysis of the full-stack lead's initial read

The full-stack lead reviewed the prototype independently. Confirming and correcting that read:

### Confirmed, and now quantified

- **"Radix + Tailwind instead of Chakra, so we'd have to rebuild a lot of the frontend."**
  Correct, and it is the largest single line item: **55** shadcn/Radix primitives in
  `src/components/ui/`, plus **8,632 LOC across 14 page files** (7,873 of it the 11 wizard steps)
  written against them.

- **"Vite instead of Next — probably less work than the UI."**
  Agreed on routing: `wouter` → App Router is genuinely small. One nuance worth budgeting: the
  larger change is the **state model**, not the routing. The wizard is entirely localStorage-driven
  client state; moving to RTK Query plus server-side persistence touches every page. Budget it
  alongside the UI work rather than alongside routing.

- **"Data and input inventories are hard-coded / JSON — needs integrating with our API."**
  Confirmed and fully enumerated in the [inventory doc](./MeedModuleMigration-Inventory.md#3-bundled-data).

- **"Start earlier rather than later; don't work on both apps simultaneously — it could double
  the effort."** Strongly agree, and it has a concrete consequence worth naming: **the Vite app
  should be feature-frozen at kickoff.** Anything added to it after that point gets built twice.

### Two corrections that change the estimate

**1. "The biggest task would be architecting and building the backend" — the backend already
exists.**

`hiap-meed` is in this monorepo today, deployed, CI'd, with k8s manifests. What is missing is not
a prioritization backend; it is a CityCatalyst **service + persistence + proxy layer** over one
that already runs: one HTTP client (`MeedApiService`, directly modelled on `HiapApiService`), one
inventory bridge, ~7 proxy routes, ~4–5 tables, and one async job for report generation. That is
a well-bounded piece of work, not an architecture greenfield.

**2. "Hard to get a full view of how many endpoints, tables etc. there would need to be (I guess
that's part of the architecture step)" — that view now exists.**

This audit enumerated every external call site (16), every `localStorage` key family (6), every
Global API endpoint in use, and every bundled data file. The endpoint and table lists in these
documents *are* the output of that architecture step. They should collapse most of the estimate's
variance.

### Four things not yet in the picture

1. **i18n is a rewrite, not a file move.** ~2,150 lines across 21 translation modules, keyed by
   *English source strings*, en/es only. CityCatalyst uses i18next with kebab-case keys in an
   English-only file (CI auto-translates de/es/fr/pt). Every string is touched.
2. **Report generation is a 10–30 s LLM call** (`/v1/reports/output-plan`). It cannot live in a
   request handler; it needs the existing async-job + cron pattern.
3. **Chilean municipality onboarding is a separate track**, arguably larger than the module
   itself, and gated on a locode-scheme decision (see §7).
4. **"Keep the backend separate from the existing HIAP backend, or share functionality?"** —
   mostly separate. The two services have genuinely different contracts: `hiap` is async and
   task-polled (`/prioritizer/v1/start_prioritization` → poll → fetch), `hiap-meed` is
   synchronous (`POST /v1/prioritize` → result). Sharing an HTTP client buys nothing. Where
   sharing *does* pay: the inventory→payload bridge, the persistence models, and the
   async-job/cron machinery. The real convergence question is the **methodology** one already
   open in [#2690](https://github.com/Open-Earth-Foundation/CityCatalyst/pull/2690) — a product
   decision, not a plumbing one.

**Net:** 2–3 sprints for the backend is a reasonable number, but for a smaller scope than was
assumed and with much lower variance. **The critical path is the frontend, not the backend.**

---

## 5. Effort estimate

Engineer-days, one engineer per track. 1 sprint = 2 weeks.

### Backend track — ~20–27 days (2–3 sprints)

| Item | Days |
|---|---|
| `MeedApiService` — wrap the 4 `hiap-meed` endpoints (mirror `HiapApiService`) | 2–3 |
| `MeedInventoryService` — GPC-level inventory→payload bridge, locode normalization, golden test against the bundled snapshots | 3–4 |
| ~7 Global API proxy routes via `apiHandler`, with swagger JSDoc + Jest | 4–5 |
| Data model — 4–5 tables, `.cjs` migrations, `init-models`, RTK Query endpoints | 4–5 |
| `MeedService` orchestration + async report job + cron wiring | 4–5 |
| Module registration — migration, seed entry, `constants.ts`, `ProjectModules` grant | 1–2 |
| Env/k8s wiring, review, iteration | 2–3 |

*Add ~1 sprint of Python work if we choose to extend `hiap-meed` to serve the enriched context
rather than re-deriving it in CityCatalyst — see open question **A**.*

### Frontend track — ~35–40 days (3.5–4 sprints)

| Item | Days |
|---|---|
| Chakra/theme foundation, wizard shell, module route scaffolding | 5 |
| `Recommendations` (2,134 LOC — decompose, don't transliterate) | 7–8 |
| `FinancialFeasibility` (981) + `PreflightCheck` (900) | 5 |
| `SocioeconomicContext` (694) + `RegulationsLaws` (612) + `PolicyAlignment` (596) | 5 |
| `StrategicPreferences` (526) + `CityProfile` (379) + `EmissionsReview` (330) + `Processing` (296) | 5 |
| `Methodology` + `About` folded into the existing methodologies page | 2 |
| i18n rewrite → i18next EN keys | 5 |
| PDF export re-platform (jsPDF → `PDFExportService` / `PrintableActionPlanPDF`) | 2–3 |
| QA, Playwright happy path, polish | 5 |

The screens are largely independent, so this compresses well with parallelism and agent
assistance. The figure above is sequential, single-engineer.

### Onboarding track — ~15–20 days (1.5–2 sprints), runs in parallel

| Item | Days |
|---|---|
| Locode scheme decision + Global API coverage audit (**blocking**) | 5 |
| Bulk city + inventory creation and import for ~345 comunas | 7–10 |
| Boundaries/population backfill, verification | 3–5 |

### Calendar

With one backend and one frontend engineer working in parallel, and onboarding running alongside:
**~8–10 weeks (4–5 sprints)** to a working native module. Frontend is the critical path.

**Excluded:** MEED/HIAP product convergence, any methodology change (#2690), and design work on
the MEED+ brand vs CityCatalyst theme question.

---

## 6. Proposed workstreams

Presented as independent workstreams, not a fixed sequence. A–B–C are the module itself; D and E
are the surrounding platform work.

### A. Register the module

- Migration + entry in `app/seed-data/modules/modules.json`: new UUID, `stage: "plan"`,
  `type: "OEF"`, `status: "beta"`, `url: "/MEED"`, `name`/`description`/`tagline` in
  en/es/pt/de/fr, `logo` on S3 alongside the other module logos.
- `Modules.MEED = { id }` in `app/src/util/constants.ts`.
- Grant on the Chile/CORFO project(s) via `ProjectModules` — pattern:
  `20250908134655-add-ccra-to-project-modules.cjs`.
- Optionally gate behind a `MEED_MODULE` feature flag, filtered in `HomePage.tsx` the way
  `Modules.CCRA.id` is today.

### B. One API boundary — no direct browser calls

**`MeedApiService`** (`app/src/backend/meed/`) — client for the four `hiap-meed` endpoints, mirroring
`HiapApiService` but synchronous. New env var `HIAP_MEED_API_URL` (default
`http://hiap-meed-service`) in `env.example` and `k8s/cc-web-deploy.yml`; the k8s Service already
exists.

**`MeedInventoryService`** — `buildCityInput(inventoryId, prefs) → FrontendCityInput`, replacing
the prototype's `lib/cityInventory.ts` + `pipelineRunner.buildCityInput`. Query `InventoryValue`
joined with `SubSector`, emit `gpcData[gpcReferenceNumber] = { notationKey, activities }` — the
same transform as the prototype's `getInventoryAsEmissionsData()`, but from the database.
Population via `PopulationService`. Locode normalization (`CLANT` → `CL ANT`) as `HiapService`
already does.

**Proxy routes** under `app/src/app/api/v1/city/[city]/modules/meed/…`, all through `apiHandler`
with `GLOBAL_API_URL` — one route per current browser-side call, mapped in the
[inventory doc](./MeedModuleMigration-Inventory.md#1-external-api-call-sites).

**Persistence** — models + `.cjs` migrations (UUID PKs, `created`/`lastUpdated`, registered in
`init-models.ts`), following the `HighImpactActionRanking` shape: `MeedPreferences`,
`MeedExclusion`, `MeedRanking` (+ `snapshot` and `stepProgress` JSONB), `MeedRankedAction`.
Add the staleness detection the prototype TODO asks for — store an input hash on the ranking and
warn when inventory, preferences or exclusions changed since it was produced.

**`MeedService`** — orchestration (build input → call → persist), exclusions preview, and report
generation on the async job + cron pattern.

### C. Native frontend

Route tree `app/[lng]/cities/[cityId]/MEED/`, mirroring the HIAP module: `layout.tsx` →
`MEEDClientLayout.tsx` (`useModuleAccessLayout` with `Modules.MEED.id`) → `page.tsx` (resolve the
latest inventory, redirect to `[inventory]`, send users with no inventory to `GHGI/onboarding`).

Screen-by-screen mapping, cross-cutting swaps, and the delete list are in the
[inventory doc](./MeedModuleMigration-Inventory.md#4-screen-mapping).

### D. Chilean municipality onboarding

1. **Locode / city identity.** Chile has ~345 comunas; UN/LOCODE covers a fraction. Decide the
   scheme — UN/LOCODE where it exists, plus a deterministic fallback (the prototype registry
   already contains a `CL13112`-style INE comuna code for La Pintana). **This blocks everything
   downstream:** `hiap-meed` validates `^[A-Za-z]{2}\s[A-Za-z]{3}$`, and Global API records are
   locode-keyed.
2. **Project/org structure** — one Chile project, or per-region projects. Drives module grants
   and user access.
3. **Bulk creation** via `POST /api/v1/admin/bulk` (cities + inventory shells for
   `cityLocodes × years`), then inventory values through the existing eCRF/CSV import pipeline —
   or a one-off seeder, since the source data is already in CityCatalyst inventory-JSON shape.
4. **Global API coverage audit** before enabling the module — it degrades badly when policy,
   finance or feasibility rows are missing for a locode. `k8s/cc-global-api-coverage.yml` exists
   for exactly this kind of check.
5. **Boundaries and population** via `CityBoundaryService` / `PopulationService`.

### E. Module interoperability

See [`MeedModuleMigration-Interop.md`](./MeedModuleMigration-Interop.md).

---

## 7. Open questions

| | Question | Why it matters |
|---|---|---|
| **A** | Proxy the Global API from CityCatalyst, or extend `hiap-meed` to serve the enriched context it already assembles (`services/report_context_enrichment.py`) so CityCatalyst proxies *one* upstream? | Highest-leverage decision in the plan. Determines whether screen/report consistency is guaranteed **by construction** or merely by convention. |
| **B** | Locode scheme for Chilean comunas without a UN/LOCODE | Blocks onboarding, Global API lookups, and `hiap-meed`'s validation regex |
| **C** | MEED+ brand palette (navy `#001EA7`, green `#16A34A`, amber `#F59E0B`) vs CityCatalyst theme — adopt CC semantic tokens, or a module-scoped Chakra recipe? | Needed before screen work starts; affects every component |
| **D** | Do MEED and the existing HIAP module converge later? | Two prioritizers behind two cards with overlapping purpose. Relates to [#2690](https://github.com/Open-Earth-Foundation/CityCatalyst/pull/2690) |
| **E** | Kickoff date, and the prototype feature-freeze that goes with it | Every feature added to the Vite app after kickoff is built twice |

---

## 8. Ownership split

**Frontend / design** — workstream C in full: screen ports, Chakra theming, MEED+ brand mapping,
i18next rewrite, wizard UX, module card copy and logo, `Recommendations` decomposition, empty and
precondition states.

**Backend / full-stack** — workstreams A, B, D, E: services, proxy routes, models and migrations,
async report jobs, env and k8s wiring, onboarding pipeline, the module provider contract.

---

## 9. Risks

1. **Locode scheme for ~345 comunas** — blocks onboarding, Global API lookups, and `hiap-meed`
   validation. Resolve first.
2. **Global API coverage beyond the pilot 20** — no graceful degradation story today for missing
   policy / finance / feasibility rows.
3. **UI port scale** — 8,632 LOC of pages plus 55 primitives. `Recommendations.tsx` alone is
   2,134 lines and must be decomposed, not transliterated.
4. **i18n rewrite** — mechanical but large, and easy to regress silently.
5. **Two prioritizers, two cards** — needs a product answer, not just an engineering one.
6. **Report latency** — 10–30 s LLM calls must not run inside a request handler.
7. **Parallel development** — if the Vite app keeps gaining features after kickoff, each one is
   built twice. Freeze at kickoff.
