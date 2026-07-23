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

  Two dependency findings make this cheaper than it first looks:

  - **The app has no charts.** `recharts` appears only in the unused shadcn boilerplate file
    `components/ui/chart.tsx` — dead code to delete. The only visual elements are score/reduction
    bars built from plain styled `<div>`s, which port directly to Chakra. There is no
    visualization library to migrate.
  - **Much of the stack is already shared.** CityCatalyst already depends on `framer-motion`,
    `react-icons`, `react-hook-form` + `@hookform/resolvers`, `zod`, and — notably — `jspdf` +
    `jspdf-autotable`. So animation, form and validation code ports directly, and
    `reportGenerator.ts` (592 LOC) is closer to a move than a re-platform.

  What genuinely carries over is the majority of the intellectual content: page logic, derived
  computations, information architecture, and every English string (which become the EN i18next
  values). What does not carry over is the markup layer — shadcn primitives are `className`-styled
  copy-ins while Chakra v3 uses recipes, semantic tokens and a different slot API, so
  `<Card>` → `<Card.Root>` / `<Card.Body>` is not a rename — plus all state management and all data
  fetching.

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

Target: **a working module by end of August / first week of September 2026** — roughly 5–6 weeks
from 2026-07-23.

Estimates below assume **contract-first parallel execution** (see §5.4) and **heavy agent
assistance on the mechanical work**, with human review and visual QA left uncompressed.

### 5.1 Backend track — ~13–16 days

| Item | Days | Agent leverage |
|---|---|---|
| `MeedApiService` — wrap the 4 `hiap-meed` endpoints (mirrors `HiapApiService`) | 1–2 | High — pattern-following |
| `MeedInventoryService` — GPC-level bridge, locode normalization, golden test vs the bundled snapshots | 3 | **Low — do not compress.** This is the safety net for the whole bridge |
| ~7 Global API proxy routes via `apiHandler` + swagger JSDoc + Jest | 2 | High — near-identical routes |
| Data model — 4–5 tables, `.cjs` migrations, `init-models`, RTK Query endpoints | 2–3 | High — patterns from `HighImpactActionRanking` |
| `MeedService` orchestration + async report job + cron wiring | 3 | Low — integration judgment |
| Module registration — migration, seed entry, `constants.ts`, `ProjectModules` grant | 1 | High |
| Env/k8s wiring, review, iteration | 2 | None — human review |

*Add ~1 sprint of Python work if we choose to extend `hiap-meed` to serve the enriched context
rather than re-deriving it in CityCatalyst — see open question **A**.*

### 5.2 Frontend track — ~22–26 days

| Item | Days | Agent leverage |
|---|---|---|
| Chakra/theme foundation, wizard shell, module route scaffolding | 3 | Medium |
| `Recommendations` (2,134 LOC — already 8 components in one file; split each into its own file when porting) | 5 | Medium — mechanical pass yes, choosing the split no |
| Radix→Chakra pass across the other 9 screens | 8–10 | **High** — independent screens, fan out |
| `Methodology` + `About` folded into the existing methodologies page | 1 | High |
| i18n rewrite → i18next EN keys | 1–2 | **Highest in the plan** — near-ideal agent task |
| PDF export (`jspdf` already a CityCatalyst dependency — a move, not a re-platform) | 1 | High |
| QA, visual review across 11 screens, Playwright happy path | 5 | **None.** Chakra conversion produces plausible-but-wrong layouts constantly |

### 5.3 Integration — ~5–7 days

End-to-end wiring against real CityCatalyst data, schema-mismatch debugging, and the
screen-vs-report consistency check. Does not compress; budget it explicitly.

### 5.4 Calendar

Contract-first is what unlocks the parallelism: the request/response types **already exist** in
the prototype's `lib/hiapApi.ts`. Extract them into a shared contract in week 1 and the frontend
builds against a mock while the backend builds the real thing — neither waits.

| Staffing | Calendar | Lands |
|---|---|---|
| 1 backend + 2 frontend | **~5 weeks** | ~27 Aug |
| 1 backend + 1 frontend | **~6.5 weeks** | ~8 Sep |

### 5.5 What does *not* fit the deadline: onboarding all ~345 comunas

| Item | Days | Agent leverage |
|---|---|---|
| Locode scheme decision | 5 | **None** — a decision, not a task |
| Global API coverage audit across the full locode list | 1–2 | High to run; **the result may invalidate the plan** |
| Bulk city + inventory creation and import | 4–6 | Medium — script yes, data cleanup no |
| Boundaries/population backfill, verification | 3–5 | Low |

**Recommendation: decouple onboarding from the deadline, not the module.** Ship the module by end
of August against a *verified* city set — the pilot 20 plus whatever passes the coverage audit —
and run full onboarding as a rolling data operation afterwards. Because the module reads through
the inventory layer, **nothing about it changes when more cities arrive.** That is precisely the
property that makes decoupling safe.

### 5.6 Conditions

The calendar above holds only if:

1. **The three blocking decisions land in week 1**, not week 3: locode scheme (**B**), theme
   (**C**), and the shared API contract.
2. **Onboarding is descoped from the deadline** per §5.5.
3. **Review bandwidth is allocated.** Agent-assisted delivery moves the bottleneck from writing
   code to reviewing it. This is the condition most likely to be overlooked.

### 5.7 Week 0 — pre-kickoff checklist

| # | Item | Owner | Why now |
|---|---|---|---|
| 1 | **Run the Global API coverage audit** over the full Chilean locode list — probe `city_attributes`, `action-policy-scores`, `action-mitigation-feasibility-scores`, `climate-finance/feasibility` for each locode and report the gaps | Backend | **Highest priority.** ~1 day of work, and the only item that can invalidate the plan. Also defines the "verified city set" that §5.5 ships against |
| 2 | Decide the locode scheme for comunas without a UN/LOCODE (**B**) | Backend + product | Blocks onboarding, Global API lookups, and `hiap-meed`'s `^[A-Za-z]{2}\s[A-Za-z]{3}$` validation |
| 3 | Extract the shared API contract from the prototype's `lib/hiapApi.ts` into CityCatalyst types | Backend | Unlocks true frontend/backend parallelism — frontend builds against a mock |
| 4 | Decide MEED+ palette vs CityCatalyst semantic tokens (**C**) | Design | Affects every component; changing it mid-port is expensive |
| 5 | Decide proxy-vs-extend-`hiap-meed` (**A**) | Backend + full-stack lead | Determines whether ~1 sprint of Python enters scope |
| 6 | **Feature-freeze the prototype** and agree the kickoff date (**E**) | All | Anything added to the Vite app after kickoff is built twice |

**Excluded from all of the above:** MEED/HIAP product convergence, any methodology change
(#2690), and design work on the MEED+ brand vs CityCatalyst theme question.

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

### Frontend / design — can start immediately, agent-heavy

Everything here builds against the shared contract (week-0 item 3) and a mock, so it does **not**
wait on the backend.

| Work | Agent-suitability |
|---|---|
| Chakra/theme foundation, wizard shell, module route scaffolding | Medium — set the pattern by hand, then replicate |
| Radix→Chakra pass across the 9 mid-size screens | **High** — independent, repetitive, verified by typecheck/lint/build |
| i18n extraction → i18next EN keys | **Highest** — mechanical and fully checkable |
| PDF export move (`jspdf` already present) | High |
| Module card copy, tagline and description in 5 languages | High |
| `Recommendations` decomposition (2,134 LOC) | Medium — the split is a judgement call; the rewrite that follows is not |
| Visual QA across 11 screens, empty and precondition states | **None** — human eyes required |
| MEED+ palette vs CityCatalyst tokens (**C**) | None — a design decision |

### Backend / full-stack — the gating work

| Work | Agent-suitability |
|---|---|
| Global API coverage audit (week 0) | High to write and run; the *result* needs human judgement |
| Shared API contract extraction (week 0) | High — types already exist in `lib/hiapApi.ts` |
| Locode scheme (**B**) and proxy-vs-extend (**A**) decisions | **None** — architecture decisions |
| `MeedApiService`, proxy routes, models + migrations, module registration | **High** — all pattern-following against existing CityCatalyst precedents |
| `MeedInventoryService` + golden test | **Low** — the correctness-critical piece |
| `MeedService` orchestration + async report job + cron | Low — integration judgement |
| Env + k8s wiring, DB migration review, deploy | None |
| Onboarding pipeline for ~345 comunas | Medium — script yes, data cleanup no |
| Module provider contract ([interop doc](./MeedModuleMigration-Interop.md)) | Low — a design decision first |

### The dependency that matters

Only two backend items block the frontend, and both are week-0 work: **the shared API contract**
and **the coverage audit** (which defines the city set to build and test against). Everything else
on the backend can land in parallel with the screen work.

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
