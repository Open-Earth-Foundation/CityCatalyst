# CCRA Module — Technical Reference (Proposal)

**Status:** proposal for review — nothing here is approved or scheduled; pending C40/GCoM discovery sessions (18 Aug–15 Sep 2026).
**Owner:** Tati · **Last updated:** 2026-09-02
**Companion docs:** [`MeedModuleMigration.md`](./MeedModuleMigration.md) (native-module scaffolding precedent this proposal follows) · [`AgenticModuleScope.md`](./AgenticModuleScope.md) (future `ccra.capabilities.ts` / MCP integration this proposal leaves room for)

> **When to use this file:**
> - Consult before starting any implementation work on the native CCRA module
>   (route tree, persistence layer, sync job, HIAP-facing API).
> - Consult when deciding what belongs in CityCatalyst's own database versus
>   what stays owned by Global API's geospatial pipeline.
> - Consult when wiring HIAP, Climate Advisor/MCP, or any other module to
>   CCRA risk data, to avoid re-creating the "two independent readers of
>   Global API" duplication this proposal is meant to close.
> - Consult when a C40/GCoM discovery decision closes (unit of analysis,
>   risk arithmetic, hazard set, etc.) and the schema needs to absorb it.
>
> **Related documents (external):**
> - CCRA MVP feature brief (Greta/Brian/Mau/Tati) — target feature set and user stories
> - CCRA discovery brief, 31 Jul 2026 — methodology landscape and the twelve open product/data decisions (D1–D12)
> - CCRA wireflows-feedback meeting notes, 17 Aug 2026 — MVP scoping calls this proposal implements

Technical implementation details for turning CCRA (Climate Change Risk
Assessment) into a native CityCatalyst module. Today CCRA is a dashboard
widget plus a link-out to an external Replit app; this document proposes the
target architecture and the concrete pieces needed to get there, following
the same pattern GHGI, HIAP, and MEED already use inside the CityCatalyst
app. It is a proposal, not a build order — several items are marked **(new)**
because they don't exist yet, and Section "Known Gaps" lists what's
deliberately left open pending the C40/GCoM discovery sessions
(18 Aug–15 Sep 2026).

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend framework | Next.js (App Router) + React + TypeScript, inside the existing `app/` package |
| UI library | Chakra UI v3 |
| Frontend data fetching | RTK Query (`app/src/services/api.ts`) |
| Backend framework | Next.js API routes (`app/src/app/api/v1/`), same `apiHandler` wrapper as every other module |
| ORM / persistence **(new for CCRA)** | Sequelize against CityCatalyst's own PostgreSQL — new models `CcraAssessment`, `CcraRiskScore`, `CcraResilienceResponse` |
| Migrations | Sequelize CLI (`npm run db:gen-migration`) |
| Scheduled sync **(new)** | Cron-triggered Next.js API route, same pattern as `cron/check-hiap-jobs` — no new infrastructure |
| Upstream data source | Global API — FastAPI (Python) + its own PostgreSQL (`modelled.ccra_*` schema); owned by the data-engineering pipeline, unchanged by this proposal |
| Downstream consumer | `hiap` microservice — FastAPI (Python) + XGBoost + ChromaDB; proposal reroutes its CCRA reads through CityCatalyst instead of Global API directly |
| Map tiles | S3-hosted COGs / PMTiles, published by the geospatial pipeline; read directly by the frontend map component, no CityCatalyst backend involvement |
| Auth / module gating | Existing `Module` + `ProjectModules` tables, `ModuleAccessService`, `useModuleAccessLayout` — reused as-is |
| API documentation | Swagger JSDoc (`@swagger` blocks), same as every other CityCatalyst v1 route |
| Deployment | No new deployment surface — ships inside the existing CityCatalyst app's Kubernetes deployment |

## Risk Scoring Configuration

This is not the risk methodology — that's the data team's, and it isn't
finalized (see D3/D12 in Known Gaps). Read every row below as an
**implementation instruction**: either a schema column you define with a
fixed set of allowed values, or a computation you place somewhere specific
in code. The "Why not hardcoded" column exists because each of these was a
place where the obvious simpler choice (a fixed value, a single formula
result) would force a schema rewrite the moment a still-open data decision
closes.

| Setting | Value | Where this lives in code | Why not hardcoded |
|---------|-------|---------------------------|--------------------|
| Unit of analysis (MVP) | `city` (enum also allows `district`, `grid_cell`) | `ccra_assessments.spatial_unit_type` — ENUM column; MVP code only ever writes `'city'` | 17 Aug decision: ship city-level first; enum stays open for a v2 unit-of-analysis change without a migration |
| Score types supported | `normalized_index` \| `probability_consequence` \| `expected_annual_loss` | `ccra_risk_scores.score_type` — ENUM column stamped on every row; frontend and the HIAP-facing API branch on it to know which arithmetic produced the row, instead of assuming one | Keeps D12 (risk arithmetic — still open) from forcing a schema rewrite later |
| Severity buckets | `very_high` \| `high` \| `medium` \| `low` | `ccra_risk_scores.severity_label` — ENUM column, computed server-side from `composite_score` by a bucketing function you write; the bucket thresholds themselves come from the data team, not invented in code | Cities explicitly asked for qualitative labels over a raw number |
| Vulnerability adjustment | V′ = V + V × (0.5 − R) | **Not a stored column.** Computed in `CcraService`/`CcraSyncService` and applied to `vulnerability_score`/`composite_score`. `R` is read from `CcraResilienceResponse.resilience_score`. Whether this runs at sync time or render time is still open — see Request/Sync Flow step 6 | Existing v1 formula; `R` comes from the new `CcraResilienceResponse` (UNDRR Disaster Resilience Scorecard) |
| Scenario coverage | `baseline` \| `optimistic` \| `pessimistic`, nullable per hazard | `ccra_assessments.scenario` — nullable ENUM column. Your API/frontend code must treat `null` here as a normal, valid state, not as missing data to flag or filter out | Not every hazard has every scenario (AdaptaBrasil precedent) — treated as a normal case, not an error |
| Methodology display | Named pipeline string (e.g. "OEF geospatial risk pipeline v2") | `ccra_assessments.methodology_pipeline` — plain VARCHAR, no parsing/validation logic needed. Raw dataset provenance goes in the separate `source_datasets` JSONB column, not this field | 17 Aug decision: show methodology, not a raw dataset list; raw provenance still retained for audit |

**Selection rationale**: The discovery brief documents three genuinely
different risk arithmetics in candidate use (normalized 0–1 index, probability
× consequence, monetized expected annual loss) that do not convert into one
another after the fact. Rather than picking one now, `CcraRiskScore.scoreType`
tags every stored score with which arithmetic produced it, so the frontend
and the HIAP-facing API can both be written once and remain correct whichever
way D12 closes.

## Data Sources

### Lane A — structured risk scores (Global API, cached in CityCatalyst)

The scored, rankable data behind the top-risks list, sector filters, and
export. Source of truth is Global API's `modelled.ccra_riskassessment`,
`ccra_impactchain`, `ccra_impactchain_indicator`, and `ccra_indicator` tables,
fed by the data-engineering geospatial pipeline (Mau) — unchanged by this
proposal. CityCatalyst fetches from
`GET {GLOBAL_API_URL}/api/v0/ccra/risk_assessment/city/{locode}/{scenario}`
via the existing `CcraApiService`, and — **(new)** — persists the result
locally instead of re-fetching on every page load.

### Lane B — map tiles (planned; does not exist in production yet)

Hazard/risk hotspot layers, intended to be published as PMTiles to S3 by
the geospatial pipeline (per a 2 Sep 2026 internal meeting referencing
"Maps / PMTiles / Protomaps" — **not yet confirmed directly with Mau**).
**This layer does not exist anywhere today.** Verified by inspecting the
live Replit CCRA prototype (`https://citycatalyst-ccra.replit.app`): its
only map is a generic public Esri satellite basemap with a single
city-location pin — no hazard/risk data is drawn on it at all. No
COG/PMTiles output from Global API's pipeline was found anywhere.

**Render pipeline: data → frontend**, as currently understood:

1. **Data pipeline (Mau's team)** — the geospatial pipeline packages
   hazard/risk data into a PMTiles file. Granularity (one file per city?
   per hazard/scenario?) is unconfirmed.
2. **Storage** — the PMTiles file is published to S3. Bucket, path, and CDN
   setup are TBD with Mau — see "Lane B" in Known Gaps.
3. **Access** — CityCatalyst's backend mints a short-lived signed URL
   scoped to the relevant file, reusing the `getSignedUrl` pattern already
   working in `InventoryFileStorageService.ts` (new bucket, same
   mechanism). One URL covers a full map session, since PMTiles is read via
   HTTP range requests rather than one authenticated call per tile.
4. **Frontend render — new capability required.** The map library already
   used elsewhere in the app (`pigeon-maps`, in `CityMap.tsx` and
   `ProjectMap.tsx` for city boundaries/pins during onboarding and project
   views) **cannot read PMTiles** — it only draws GeoJSON shapes/markers
   over a generic basemap. Drawing this layer requires adding a
   PMTiles-capable renderer (the Protomaps ecosystem, typically paired with
   `maplibre-gl` or a Leaflet plugin) specifically for the CCRA map. This is
   new frontend infrastructure, not a config change to an existing
   component.
5. **What the user sees** — the CCRA map page loads the signed URL into the
   new renderer, which fetches only the tile ranges needed for the current
   viewport/zoom and draws the hazard layer on screen.

Steps 1–3 are a data/infrastructure decision pending Mau. Step 4 is
frontend scope that doesn't exist in the codebase today and should be sized
as new work, not a config change, when this gets planned.

### Resilience questionnaire **(new)**

UNDRR Disaster Resilience Scorecard responses, answered inside the product
(this doesn't come from Global API today — CityCatalyst has nowhere to store
it). v1 is a single city-level score feeding the V′ adjustment above; v2
(schema-ready, not built) breaks the score down by response category and
links weak categories to specific HIAP adaptation actions.

## Request / Sync Flow

1. **Module entry**: user clicks the CCRA card in the Journey Navigator →
   `useModuleAccessLayout` checks `ProjectModules` for an active grant →
   route renders `app/src/app/[lng]/cities/[cityId]/CCRA/`.
2. **Page load**: the frontend calls
   `GET /api/v1/city/{city}/ccra/assessment` (**new** endpoint), which reads
   from the local `CcraAssessment`/`CcraRiskScore` tables — no synchronous
   call to Global API on the request path.
3. **Background sync** (**new**, cron-triggered, mirrors
   `cron/check-hiap-jobs`): for every city with an active CCRA
   `ProjectModules` grant, pull fresh rows from Global API's
   `risk_assessment` endpoint and upsert `CcraAssessment`/`CcraRiskScore`,
   stamping `sourceVersion` and `fetchedAt`. This is what makes "last
   updated" and versioning real. It does two distinct jobs in one pass: a
   **first-time populate** for any city whose grant is newer than its last
   sync (no local row exists yet — always fetched, no check-then-fetch guard
   applies), and a **refresh** for cities already synced (guarded by the
   check-then-fetch pattern below, so a cycle with nothing new upstream is a
   no-op for them).
4. **Map interaction**: the map component requests tiles directly from the
   S3/tile-catalog endpoint (Lane B) — no round-trip through CityCatalyst's
   API for tile pixels, only for the row of structured data behind a
   clicked hotspot, if any.
5. **HIAP consumption**: HIAP currently calls Global API's
   `risk_assessment` endpoint directly from its own Python service
   (`hiap/app/services/get_ccra.py`). This proposal reroutes that call
   through CityCatalyst's new `GET /api/v1/city/{city}/ccra/assessment`,
   consolidating what are today two independent, potentially inconsistent
   readers of the same upstream data.
6. **Resilience questionnaire**: user submits answers via a native form →
   persisted to `CcraResilienceResponse` → computed `R` feeds the V′
   adjustment applied to `CcraRiskScore.vulnerabilityScore`/`compositeScore`
   at render or sync time (exact computation point TBD during implementation).

### Recommended sync trigger & cadence

**Is a scheduled job still needed, given how cheap a no-op run is?** Yes —
for two reasons that hold regardless of how often the upstream hazard data
actually changes:

1. **New CCRA grants happen continuously**, and the assessment endpoint
   (step 2 above) reads *only* from local tables — there's no live Global
   API fallback on the request path. Something has to run periodically just
   to do the first-time populate for a newly granted city; without it, that
   city's assessment page stays empty until a human notices and intervenes.
2. **A manual-only trigger is a single point of failure.** It only works if
   someone remembers to run it after every relevant event (a Global API
   pipeline release, a new city onboarding) across however many cities have
   CCRA access — that doesn't scale and isn't what "no synchronous call to
   Global API on the request path" is supposed to buy us.

So the open question was never "cron or script" — it's "how do we avoid
guessing the right interval," and CityCatalyst already has the answer to
that in production. The GHGI data catalogue sync
(`app/scripts/catalogue-sync.ts`, deployed as the `cc-prod-sync-catalogue`
CronJob, `k8s/prod/cc-prod-sync-catalogue.yml`, schedule `0 0 * * 1` — every
Monday) hits the same `GLOBAL_API_URL` host and doesn't blindly re-fetch on
every run: it first calls `{GLOBAL_API_URL}/api/v0/catalogue/last-update`,
compares that timestamp to the locally stored `Catalogue.lastUpdate`, and
exits as a no-op if nothing changed upstream (`catalogue-sync.ts:76-97`).

What this looks like on every scheduled run, per city:

```
Sync job fires (any cadence — hourly / daily / weekly, doesn't matter)
│
├─ City has no local row yet (new grant)
│    └─ always fetch → upsert                 (first-time populate)
│
└─ City already synced
     └─ check last-update / source_version
          ├─ changed   → fetch → upsert       (refresh)
          └─ unchanged → skip                 (no-op — one cheap check)
```

This is the pattern to copy for the CCRA sync job:

- **Schedule the job on any convenient cadence** (weekly, daily, hourly —
  it doesn't matter for existing cities) and let a check-then-fetch guard
  decide whether a refresh actually happens. This removes the "don't poll
  faster than the pipeline refreshes" problem entirely for cities that
  already have data, since an unnecessary run costs one cheap timestamp
  check, not a full re-sync. It has no effect on the first-time-populate
  case above, which always has to fetch.
- **Open dependency on the data team**: the guard only works if Global API's
  CCRA endpoints expose an equivalent last-update/version signal (analogous
  to `/api/v0/catalogue/last-update`, or usable via the existing
  `source_version` field) that the sync job can check per city before
  pulling `risk_assessment` data. Needs confirming with Mau's team —
  see Known Gaps. Until that's confirmed, treat every scheduled run as a
  full re-fetch for all synced cities and pick the schedule conservatively
  (e.g. weekly, matching the catalogue sync) rather than aggressively.
- **Optional manual override**: keep a plain `Job` manifest alongside the
  `CronJob` (mirroring `k8s/cc-sync-catalogue-manual.yml`) so ops can force
  an immediate resync — e.g. right after a known Global API pipeline
  release — without waiting for the schedule. This is a supplement to the
  CronJob, not a replacement for it.
- **Anti-pattern to avoid**: the catalogue sync's dev environment also fires
  an immediate one-off run on every deploy
  (`.github/workflows/web-develop.yml:498-502`), via a second manual `Job`
  manifest — a workaround for a k8s limitation (a `CronJob` can't be
  triggered on-demand without a randomized job name). Prod does **not** do
  this; prod deploys only update the `CronJob`'s image and wait for the
  next scheduled run. Don't wire the CCRA sync to fire on every deploy —
  it's an artifact of a dev-environment workaround, not a deliberate design
  choice, and adds a manifest to maintain for no real benefit once
  check-then-fetch (or a conservative schedule) is in place.

## API Endpoints

| Method | Path | Status | Description |
|--------|------|--------|-------------|
| GET | `/api/v1/city/{city}/modules/ccra/dashboard` | Exists | Dashboard-widget summary, currently backs the Replit link-out card |
| GET | `/api/v1/city/{city}/ccra/assessment` | **New** | Full assessment for the native module pages — filterable by sector, hazard, scenario |
| POST | `/api/v1/city/{city}/ccra/resilience` | **New** | Submit/update resilience-questionnaire responses |
| GET | `/api/v1/city/{city}/ccra/resilience` | **New** | Read current resilience score + responses |
| — | `cron` sync job | **New** | Not user-facing; scheduled route pulling Global API → `CcraAssessment`/`CcraRiskScore` |

All new routes follow the existing `apiHandler` wrapper (auth resolution,
DB init, rate limiting, centralized error handling) and get Swagger JSDoc
blocks like every other v1 route.

## Database Schema

Three new tables in CityCatalyst's existing PostgreSQL (no new database) —
same header/line-item shape as `HighImpactActionRanking` →
`HighImpactActionRanked`.

### ccra_assessments
| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Assessment identifier |
| city_id | UUID (FK) | Owning city |
| locode | VARCHAR | City locode, for the Global API lookup |
| spatial_unit_type | ENUM (`city`\|`district`\|`grid_cell`) | MVP only ever populates `city`; kept open for v2 |
| spatial_unit_ref | VARCHAR, nullable | Sub-city identifier if `spatial_unit_type != city` |
| scenario | ENUM (`baseline`\|`optimistic`\|`pessimistic`), nullable | Nullable per hazard — not all hazards have all scenarios |
| methodology_pipeline | VARCHAR | Named methodology shown to users, e.g. "OEF geospatial risk pipeline v2" |
| source_datasets | JSONB | Raw provenance, retained for audit, not surfaced as primary UI |
| source_version | VARCHAR | Upstream pipeline version, for drift detection |
| fetched_at | TIMESTAMP | When this row was synced from Global API |
| created / last_updated | TIMESTAMP | Standard CityCatalyst timestamp columns |

### ccra_risk_scores
| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Row identifier |
| assessment_id | UUID (FK → ccra_assessments) | Parent assessment |
| sector | VARCHAR | e.g. water security, food security, energy security |
| hazard | VARCHAR | e.g. flood, heat, landslide, drought |
| score_type | ENUM (`normalized_index`\|`probability_consequence`\|`expected_annual_loss`) | Which risk arithmetic produced this row |
| hazard_score | NUMERIC | Tier-3 component |
| exposure_score | NUMERIC | Tier-3 component |
| vulnerability_score | NUMERIC, nullable | Tier-3 component; nullable per Level 2 vs. Level 3 granularity |
| composite_score | NUMERIC | Tier-2 — the risk score |
| severity_label | ENUM (`very_high`\|`high`\|`medium`\|`low`) | Derived bucket over `composite_score` |
| confidence_level | NUMERIC, nullable | Reserved for a future confidence/provenance policy |

### ccra_resilience_responses
| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Response identifier |
| city_id | UUID (FK) | Owning city |
| responses | JSONB | Raw UNDRR scorecard answers |
| resilience_score | NUMERIC | Computed `R`, feeds V′ = V + V×(0.5−R) |
| category_breakdown | JSONB, nullable | v2 — per-category scoring, not populated in v1 |
| created / last_updated | TIMESTAMP | Standard CityCatalyst timestamp columns |

## Repository Structure

Additions to the existing `app/` package (no new top-level service):

```
app/
├── src/
│   ├── app/
│   │   ├── [lng]/cities/[cityId]/CCRA/        # new — native route tree
│   │   │   ├── layout.tsx
│   │   │   ├── CCRAClientLayout.tsx           # useModuleAccessLayout gate
│   │   │   ├── page.tsx                        # resolves latest inventory, redirects
│   │   │   └── [inventory]/page.tsx            # dashboard content
│   │   └── api/v1/
│   │       ├── city/[city]/ccra/assessment/route.ts    # new
│   │       ├── city/[city]/ccra/resilience/route.ts    # new
│   │       ├── city/[city]/modules/ccra/dashboard/route.ts  # existing
│   │       └── cron/check-ccra-sync/route.ts   # new, mirrors check-hiap-jobs
│   ├── backend/ccra/
│   │   ├── CcraApiService.ts                   # existing — Global API client
│   │   ├── CcraService.ts                      # existing — scoring logic
│   │   └── CcraSyncService.ts                  # new — Lane A upsert logic
│   ├── models/
│   │   ├── CcraAssessment.ts                   # new
│   │   ├── CcraRiskScore.ts                    # new
│   │   └── CcraResilienceResponse.ts           # new
│   ├── components/
│   │   ├── ModuleWidgets/CCRAMainWidget.tsx    # existing — link swaps to native route
│   │   └── CCRA/                                # new — table, map, questionnaire components
│   └── lib/mcp/tools/risk-assessment.ts        # existing stub — implemented later, see AgenticModuleScope.md
└── migrations/
    ├── xxxx-CcraAssessment_create.cjs           # new
    ├── xxxx-CcraRiskScore_create.cjs            # new
    └── xxxx-CcraResilienceResponse_create.cjs   # new
```

## Deployment

No new deployment surface. This module ships as part of the existing
CityCatalyst app's Kubernetes deployment — no new service, no new
Dockerfile, no new cluster config. The only deployment-relevant additions
are: new database migrations (run through the existing `npm run db:migrate`
path) and a new scheduled route for the sync job (registered the same way
`cron/check-hiap-jobs` already is).

### Feature flag
Gate the new route tree and API endpoints behind the existing `CCRA_MODULE`
flag in `app/src/util/feature-flags.ts` during buildout, the same way
`MEED_MODULE` gated the MEED scaffold.

### Environment variables
| Variable | Required | Description |
|----------|----------|--------------|
| `GLOBAL_API_URL` | Yes (already exists) | Base URL for Global API, e.g. `https://ccglobal.openearth.dev` |
| `NEXT_PUBLIC_CC_CCRA_REPLIT_URL` | To be removed | Currently used for the Replit link-out; retire once the native route ships |
| Tile catalog access (name TBD) | **New**, pending | Whatever credential/endpoint config Lane B's tile serving mechanism needs — not decided in this proposal |

### Known deployment considerations
- A scheduled sync job is required regardless of upstream update frequency —
  it's what populates newly-granted cities and keeps CityCatalyst from
  depending on someone manually re-running a script (see "Recommended sync
  trigger & cadence" above). It should follow the catalogue sync's
  check-then-fetch pattern rather than a blind fixed-interval poll, which
  defers the "how fast does the pipeline refresh" question to a cheap
  per-run timestamp check instead of a cron interval picked by guesswork.
- If Lane B ends up needing a signed URL per request rather than a public
  endpoint, that's a request-time dependency on Mau's pipeline being
  reachable from the CityCatalyst backend, not just from the browser.
- `hiap`'s current direct Global API calls (`hiap/app/services/get_ccra.py`)
  need a coordinated cutover if/when they're rerouted through CityCatalyst —
  not a CCRA-module-only deploy.

## Known Gaps

### Resolved by this proposal
- The "two independent readers of Global API" duplication (CityCatalyst +
  `hiap`) — consolidated behind CityCatalyst's new persistence layer.
- CCRA having no history/versioning — Lane A's `sourceVersion`/`fetchedAt`
  fixes this.
- The Replit link-out as the only full experience — replaced by a native route.

### Remaining gaps
- **`Module.stage` conflict**: seeded as `assess-&-analyze`; the 17 Aug
  wireframes place the entry point under "Plan." One-line fix, needs a
  decision from Greta/Brian.
- **Lane B doesn't exist yet, and rendering it is new frontend work, not
  just a serving-mechanism choice**: no hazard/risk tile layer exists in
  production today — confirmed absent from both the live Replit prototype
  and the main app. The data team's likely format is PMTiles (per a 2 Sep
  2026 meeting reference), but that's unconfirmed with Mau, along with file
  granularity, timeline, and the S3/CDN serving setup (signed URL is the
  recommended default — see Data Sources → Lane B render pipeline). Separately,
  the app's current map library (`pigeon-maps`) can't read PMTiles at all,
  so a PMTiles-capable renderer needs to be added regardless of how Mau's
  side resolves. Needs a scoping conversation with Mau before this can be
  estimated — it's bigger than "which URL type."
- **CCRA last-update/version signal**: whether Global API's CCRA endpoints
  expose a last-update or version check per city (analogous to
  `/api/v0/catalogue/last-update`), which the sync job needs to implement
  the check-then-fetch pattern instead of a blind-interval cron — needs
  confirming with Mau's team.
- **HIAP deep-link filter contract**: what query parameter(s) a CCRA risk
  row passes to HIAP/the action-plan module — needs a conversation with
  HIAP's frontend owner.
- **Resilience questionnaire content**: the actual UNDRR-based question set
  already exists (referenced in the 17 Aug meeting as Iker's work) but
  hasn't been sourced into this proposal.
- **v2 resilience category breakdown → HIAP action mapping**: schema
  anticipates it (`category_breakdown` column), nothing here builds it.
- **The discovery brief's still-open decisions** this proposal didn't need
  to resolve to design the schema: comparability scope (D2), the full
  hazard set (D3), vulnerability depth beyond the age-share proxy (D4),
  confidence/provenance policy (D7), methodological base (D11), and the
  final risk-arithmetic choice (D12). `score_type` and `spatial_unit_type`
  are the two places this schema deliberately keeps a door open rather than
  picking an answer.
- **Default access**: whether every city gets CCRA access at project
  creation, mirroring the self-healing grant fix just applied to GHGI
  (commit `878625309`) — a product decision, not resolved here.
