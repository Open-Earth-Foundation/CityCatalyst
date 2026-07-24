# MEED+ migration — mechanical inventory

Companion to [`MeedModuleMigration.md`](./MeedModuleMigration.md). This is the raw audit: every
external call site, every piece of client state, every bundled data file, and every screen — each
with its proposed CityCatalyst replacement.

Source repo:
[`Open-Earth-Foundation/meed-mitigation-prioritizer-frontend`](https://github.com/Open-Earth-Foundation/meed-mitigation-prioritizer-frontend),
branch `develop`. Paths below are relative to `app/artifacts/hiap/` unless noted.

Audited 2026-07-23. **Proposed targets are proposals, not decisions.**

---

## 1. External API call sites

**16 `fetch()` call sites across 7 files, hitting 6 distinct Global API endpoints, all directly
from the browser.** Every one of these is also fetched server-side by `hiap-meed`
([`hiap-meed/app/services/`](../hiap-meed/app/services)) — the duplication is the root cause of
screen-vs-report divergence.

| # | Call site | Upstream endpoint | Proposed CityCatalyst route |
|---|---|---|---|
| 1 | `src/lib/actionCatalog.ts:20` | `GET /api/v1/action-pathways` | `…/meed/actions` |
| 2 | `src/hooks/use-city-attributes.ts:3` | `GET /api/v0/city_attributes/{locode}` | `…/meed/city-attributes` |
| 3 | `src/pages/SocioeconomicContext.tsx:443` | `GET /api/v0/city_attributes/{locode}` | `…/meed/city-attributes` |
| 4 | `src/pages/Recommendations.tsx:1207` | `GET /api/v0/city_attributes/{locode}` | `…/meed/city-attributes` |
| 5 | `src/pages/Recommendations.tsx:1465` | `GET /api/v0/city_attributes/{locode}` | `…/meed/city-attributes` |
| 6 | `src/pages/PolicyAlignment.tsx:197` | `GET /api/v1/cities/{locode}/action-policy-scores?top_evidence_limit=5` | `…/meed/policy-scores` |
| 7 | `src/pages/Recommendations.tsx:1575` | `GET /api/v1/cities/{locode}/action-policy-scores?top_evidence_limit=5` | `…/meed/policy-scores` |
| 8 | `src/pages/FinancialFeasibility.tsx:777` | `GET /api/v1/cities/{locode}/climate-finance/feasibility?country_code=` | `…/meed/finance/feasibility` |
| 9 | `src/pages/Recommendations.tsx:1574` | `GET /api/v1/cities/{locode}/climate-finance/feasibility?country_code=` | `…/meed/finance/feasibility` |
| 10 | `src/pages/FinancialFeasibility.tsx:402` | `GET {row.links.projects}&limit=100` | `…/meed/finance/projects` |
| 11 | `src/pages/Recommendations.tsx:463` | `GET {row.links.projects}&limit=100` | `…/meed/finance/projects` |
| 12 | `src/pages/FinancialFeasibility.tsx:418` | `GET {row.links.opportunities}` | `…/meed/finance/opportunities` |
| 13 | `src/pages/Recommendations.tsx:479` | `GET {row.links.opportunities}` | `…/meed/finance/opportunities` |
| 14 | `src/lib/scoringPipeline.ts:182` † | `GET …/action-policy-scores` | *n/a — delete* |
| 15 | `src/lib/scoringPipeline.ts:196` † | `GET …/action-mitigation-feasibility-scores?country_code=` | `…/meed/mitigation-feasibility` if still needed |
| 16 | `src/lib/scoringPipeline.ts:213` † | `GET …/climate-finance/feasibility?country_code=` | *n/a — delete* |

† `scoringPipeline.ts` is the prototype's original **client-side** scoring implementation, now
dead: `pipelineRunner.ts` comments confirm the backend owns the full 3-way feasibility score and
returns all component evidence in `evidence_summary.feasibility`. The whole file (874 LOC) should
be deleted, not ported.

### Observations worth flagging

- **`city_attributes` is fetched four times** across three components (twice within
  `Recommendations.tsx` alone, at :1207 and :1465, into two different state variables). Symptom of
  drift, and an argument for a single RTK Query endpoint with caching.
- **`links.projects` / `links.opportunities` are relative URLs returned inside Global API
  responses**, concatenated onto a hardcoded host. Proxying these means either preserving the
  link-following behaviour server-side or flattening them into explicit routes. Worth an explicit
  decision.
- **`lib/actionCatalog.ts` exists specifically because of a data-source discrepancy** — the
  bundled `actions.json` carries stale country-specific text (Brazilian action names appearing on
  Chilean cities), so the live catalog is overlaid on top of it at runtime. Once the module reads
  the catalog through a CityCatalyst route, the bundled snapshot and the merge logic both go away.

### Non-Global-API external calls

| Call site | Upstream | Proposed |
|---|---|---|
| `app/artifacts/api-server/src/routes/geocode.ts` | Photon (`photon.komoot.io`), with Chile-specific municipality-vs-region ranking heuristics | Drop — use CityCatalyst `city/[city]/boundary` / `CityBoundaryService` |
| `src/components/MapEmbed.tsx:12` | `openstreetmap.org/export/embed.html` iframe | Keep, or align with CityCatalyst's existing map components |
| `src/components/Navbar.tsx:6` | Google Forms feedback link | Drop or replace with CityCatalyst feedback |

### `hiap-meed` calls (already correctly server-mediated)

Proxied through the Express shim at `app/artifacts/api-server/src/routes/hiapProxy.ts` — this is
the one part of the current architecture that already does the right thing, and it maps 1:1 onto
the proposed `MeedApiService`:

| Endpoint | Caller | Notes |
|---|---|---|
| `POST /v1/prioritize` | `lib/hiapApi.ts:167` | synchronous; 20 actions default (`topN`) |
| `POST /v1/prioritize/exclusions/preview` | `lib/hiapApi.ts:148` | called from the Regulations step |
| `POST /v1/reports/output-plan` | `lib/reportApi.ts:81` | **10–30 s LLM call** — needs the async job pattern |
| `POST /v1/explanations/translate` | `lib/hiapApi.ts:186` | client-side fallback when a language variant is missing |

All four wrap their payload in `{ meta, requestData }`, where `meta` is built by
`hiapApi.buildMeta()` with a client-generated UUID, `backendConsumer: "hiap-meed"`, and
`upstreamProvider: "city_catalyst_frontend"`. That envelope should be constructed server-side in
`MeedApiService`.

---

## 2. Client state (`localStorage`)

Six key families. `lib/pipelineRunner.ts` already carries a TODO to move the snapshot into the
CityCatalyst database and to add staleness detection.

| Key | Written by | Contents | Proposed persistence |
|---|---|---|---|
| `hiap:{locode}:strategic:form` | `StrategicPreferences.tsx:109`, `PreflightCheck.tsx:355` | `sectors[]`, `strategicPriorities[]` (co-benefit keys), `timeline[]`, `weights {impact, alignment, feasibility}` | `MeedPreferences` — per inventory + user |
| `hiap:{locode}:exclusions:confirmed` | `PreflightCheck.tsx:336` | `string[]` of confirmed excluded `actionId`s | `MeedExclusion` rows |
| `hiap:{locode}:results` | `pipelineRunner.ts:500` | Full `PipelineResult`: `schemaVersion`, `ranked[]`, `legalExcluded[]`, `legalFlagged[]`, `totalCityEmissions`, `cityEmissionsByGpc`, `topN`, `validActionsCount` | `MeedRanking` + `MeedRankedAction` |
| `hiap:{locode}:prioritization-snapshot` | `pipelineRunner.ts:516` | `{ request, response, storedAtUtc }` — the exact input to `/v1/reports/output-plan` | `MeedRanking.snapshot` (JSONB) |
| `hiap:{locode}:{step}` | `lib/stepProgress.ts:29` | `{ visited, progress?, sub?, confirmed? }` per wizard step | `MeedRanking.stepProgress` (JSONB) |
| `hiap:lang` | `lib/i18n.tsx:38` | `"en" \| "es"` | Drop — CityCatalyst `[lng]` route param |

**Schema-version handling already exists** (`PIPELINE_RESULT_SCHEMA_VERSION`): stored results
without a matching version are discarded and the ranking re-run
(`RegulationsLaws.tsx:321`, `Recommendations.tsx:1557`). That invalidation logic should carry over
to the DB-backed model, alongside the input-hash staleness check.

---

## 3. Bundled data

| File | Size | Content | Proposed source |
|---|---|---|---|
| `src/data/inventories/*.json` | 20 files | CityCatalyst inventory API responses for 20 Chilean cities, snapshotted. Read by `lib/cityInventory.ts` | `InventoryValue` via `MeedInventoryService` |
| `src/data/cities.ts` | 5,241 lines | Hardcoded city list — names, regions, population, metadata | `City` model / CityCatalyst city routes |
| `src/data/actions.json` | — | Action catalog snapshot; stale, country-specific text | `…/meed/actions` proxy to `/api/v1/action-pathways` |
| `src/data/actionsLegal.json`, `actionNames.json`, `policyPlans.json` | — | Legal requirements, action names, policy plans | Global API / `hiap-meed` (legal assessments already load from S3 in `hiap-meed`) |
| `src/data/prioritizerRequestMock.json` | — | Fallback emissions payload when a city has no bundled inventory (`pipelineRunner.ts:261`) | Delete — no inventory should mean a precondition state, not mock data |
| `app/artifacts/api-server/data/*.json` | 6 files | Express-shim copies of the above, plus `cityData.json` | Delete with the shim |

### The inventory transform is already written

`lib/cityInventory.ts:242` `getInventoryAsEmissionsData(locode)` converts a CityCatalyst inventory
into the exact `gpcData` shape `/v1/prioritize` expects. `MeedInventoryService` re-implements the
same transform against `InventoryValue` rows — which makes a **golden-file test** possible and
cheap: feed the DB-backed builder the imported version of one of the 20 bundled inventories and
assert byte-equality with the bundled path's output. That single test de-risks the whole bridge.

Known data quirks the transform already compensates for, which must survive the move:

- **IPPU sub-sector mislabelling** — every bundled inventory labels `IV.2` with `IV.1`'s name;
  `cityInventory.ts:86` overrides both from a canonical map.
- **Locode format** — `hiap-meed` requires `^[A-Za-z]{2}\s[A-Za-z]{3}$` (`CL ANT`), CityCatalyst
  stores `CLANT`; `HiapService` already has the formatter.
- **Non-standard locodes** — the registry uses `CL13112` (INE comuna code) for La Pintana, which
  does **not** match the regex. Directly relevant to open question **B**.
- **Registry-vs-payload locode mismatch** — `cityInventory.ts:187` notes the registry key may
  differ from the `city.locode` inside the JSON.

---

## 4. Screen mapping

14 page files, **8,632 LOC** total; 11 of them are wizard steps totalling **7,873 LOC**.

| Prototype page | LOC | Proposed target | Notes |
|---|---|---|---|
| `Landing.tsx` | 425 | **drop** | City selection; superseded by the `[cityId]` route param and the Modules screen |
| `CityProfile.tsx` | 379 | `MEED/[inventory]/page.tsx` | Module entry + overview |
| `EmissionsReview.tsx` | 330 | `MEED/[inventory]/emissions` | Reads the GHGI inventory instead of bundled JSON |
| `SocioeconomicContext.tsx` | 694 | `MEED/[inventory]/context` | Via `…/meed/city-attributes` |
| `RegulationsLaws.tsx` | 612 | `MEED/[inventory]/regulations` | Triggers the exclusions preview |
| `StrategicPreferences.tsx` | 526 | `MEED/[inventory]/preferences` | Persists to `MeedPreferences` |
| `PolicyAlignment.tsx` | 596 | `MEED/[inventory]/policy` | Via `…/meed/policy-scores` |
| `FinancialFeasibility.tsx` | 981 | `MEED/[inventory]/finance` | Via `…/meed/finance/*` |
| `PreflightCheck.tsx` | 900 | `MEED/[inventory]/preflight` | Weights + confirmed exclusions |
| `Processing.tsx` | 296 | `MEED/[inventory]/processing` | Polls job status |
| `Recommendations.tsx` | **2,134** | `MEED/[inventory]/results` | **Largest single item.** Already 8 components in one file (`ReductionBar`, `ScoreBar`, `EmptyState`, `DetailPanel` ~429 LOC, `TopPickCard`, `RankingTable`, `ContextBreakdownTab`, `Recommendations`) — split each into its own file when porting so the sub-components can be worked in parallel |
| `Methodology.tsx` | 510 | `app/[lng]/methodologies/` | Fold into the existing methodologies page |
| `About.tsx` | 226 | — | Funder/partner credits (CORFO, SSG, OEF); relocate or drop |
| `not-found.tsx` | 23 | **drop** | CityCatalyst provides it |

### Shared components

| Component | LOC | Proposed |
|---|---|---|
| `Navbar.tsx` | 321 | **drop** — CityCatalyst navigation |
| `Footer.tsx` | 92 | **drop** — CityCatalyst footer |
| `PasswordGate.tsx` | 120 | **drop** — replaced by NextAuth + `ProjectModules` gating |
| `StepBar.tsx` | 82 | Port onto CityCatalyst's `components/steps/` wizard pattern |
| `InfoTip.tsx` | 58 | Chakra `Tooltip` (`components/ui/tooltip`) |
| `MapEmbed.tsx` | 84 | Align with CityCatalyst map components |

### Library code

| File | LOC | Proposed |
|---|---|---|
| `scoringPipeline.ts` | 874 | **delete** — dead client-side scoring, superseded by `hiap-meed` |
| `reportGenerator.ts` | 592 | Port onto `PDFExportService` / `PrintableActionPlanPDF` — **`jspdf` and `jspdf-autotable` are already CityCatalyst dependencies**, so this is close to a move |
| `pipelineRunner.ts` | 526 | Split: input building → `MeedInventoryService` (server); response adaptation → shared types |
| `cityInventory.ts` | 289 | → `MeedInventoryService` (server) |
| `hiapApi.ts` | 201 | → `MeedApiService` (server); types become shared contracts |
| `actionCatalog.ts` | 137 | → `…/meed/actions` route + RTK Query endpoint |
| `reportApi.ts` | 116 | → `MeedService` report job + RTK Query; keep the i18n resolvers (`resolveI18nText`/`resolveI18nList`) |
| `i18n.tsx` + `translations/*` | 96 + 2,150 | → i18next `meed` namespace, kebab-case keys, **EN file only** |
| `policyAggregates.ts`, `actionDisplay.ts`, `stepProgress.ts`, `definitions.ts`, `pdfAssets.ts`, `utils.ts` | 317 | Port as-is or fold into the new structure |

### UI primitives

**55** shadcn/Radix components in `src/components/ui/`. These are **replaced**, not ported —
CityCatalyst has its own set in `app/src/components/ui/` on Chakra v3. The real work is rewriting
the ~8,600 LOC of pages written against the Radix/Tailwind API.

### Dependency overlap — what ports directly

Checked against CityCatalyst `app/package.json` on `develop`:

| Prototype dependency | In CityCatalyst? | Consequence |
|---|---|---|
| `framer-motion` | ✅ | Animation code ports directly |
| `react-icons` | ✅ | Icon usage ports directly |
| `react-hook-form` + `@hookform/resolvers` | ✅ | Form logic ports directly |
| `zod` | ✅ | Validation schemas port directly |
| `jspdf` (+ `jspdf-autotable` in CC) | ✅ | `reportGenerator.ts` is close to a move |
| `lucide-react` | ❌ (CC uses `react-icons`) | Icon-by-icon swap — mechanical |
| `tailwindcss` + `@tailwindcss/typography` | ❌ | Removed; styling moves to Chakra recipes/tokens |
| `@radix-ui/*` (23 packages) | ❌ | Replaced by CityCatalyst's Chakra primitives |
| `wouter` | ❌ | Replaced by the App Router |
| `@tanstack/react-query` | ❌ (CC uses RTK Query) | Data layer rewrite |
| `recharts` | ❌ | Unused dead dependency — delete |

**The app has no charts.** `recharts` is imported only by `src/components/ui/chart.tsx`, an unused
shadcn boilerplate file that no page or component references — delete it. What visual elements the
app does have are score/reduction bars built from plain styled `<div>`s (`ReductionBar`,
`ScoreBar` in `Recommendations.tsx`), which port directly to Chakra markup. There is no
visualization library to migrate.

---

## 5. Cross-cutting swaps

| Concern | Prototype | CityCatalyst |
|---|---|---|
| Build | Vite 7 | Next.js 15 (App Router) |
| Routing | `wouter` | App Router file-based, `[lng]/cities/[cityId]/MEED/[inventory]/…` |
| Server state | `@tanstack/react-query` | RTK Query (`services/api.ts`) — new tags `Meed`, `MeedRanking`, `MeedPreferences` |
| Client state | `localStorage` | Server persistence + Redux slices where needed |
| UI | shadcn/Radix + Tailwind 4 | Chakra v3 + semantic tokens |
| Styling | Tailwind utility classes | Chakra recipes / semantic tokens — never raw colors |
| i18n | Custom store keyed by English strings, en/es | i18next, kebab-case keys, EN-only source, CI translates de/es/fr/pt |
| Auth | Client-side password constant | NextAuth v4 + `apiHandler` + `ProjectModules` |
| PDF | jsPDF (`reportGenerator.ts`) | `PDFExportService` / `PrintableActionPlanPDF` |
| Logging | pino (Express shim) | `@/services/logger` (pino) |
| Tests | none | Jest `*.jest.ts` in `app/tests/`, Playwright `*.spec.ts` |
| Deploy | own Dockerfile + `k8s/` | CityCatalyst `cc-web` deployment |

---

## 6. Delete list (once the module is live)

The whole `meed-mitigation-prioritizer-frontend` repo, and within it specifically:

- `app/artifacts/api-server/` — the Express shim; `hiapProxy.ts` becomes `MeedApiService`, the
  rest has no CityCatalyst equivalent
- `src/lib/scoringPipeline.ts` (874 LOC, dead)
- `src/data/cities.ts` (5,241 lines), `src/data/inventories/*` (20 files),
  `src/data/actions.json`, `src/data/prioritizerRequestMock.json`
- `src/components/{Navbar,Footer,PasswordGate}.tsx`
- `src/components/ui/*` (55 files)
- `src/lib/i18n.tsx` + `src/lib/translations/*` (21 files) — content migrates, mechanism does not
