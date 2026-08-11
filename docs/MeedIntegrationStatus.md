# Actions & Plans v2 (MEED): integration status

Where the module stands, what is owed by whom, and what is needed to test on dev.

Companions: [`MeedReferenceDataContractDiff.md`](./MeedReferenceDataContractDiff.md) — the field-by-field contract analysis and its resolution — and `MeedModuleImplementation.md`, which documents what was built and lands with [PR #2956](https://github.com/Open-Earth-Foundation/CityCatalyst/pull/2956) (not yet on `develop`).

---

## Summary

The backend contract is **functionally complete**. [PR #2982](https://github.com/Open-Earth-Foundation/CityCatalyst/pull/2982) is approved and merge-clean, and 6 of the 7 gaps we raised were closed in full; the seventh was declined with sound reasoning. Every field the module renders now has a source.

What remains splits cleanly into two piles that do **not** block each other.

**Deploy plumbing — reviewable now, independent of us.** Two values are missing from the deploy workflows: `HIAP_MEED_API_URL` and `MEED_MODULE` in dev's `NEXT_PUBLIC_FEATURE_FLAGS`. Both are plain repo edits, not cluster operations and not secrets. Critically, **both are inert until our code lands** — on `develop` today the module has zero files and `MEED_MODULE` is not even a defined flag, so adding them changes nothing and risks nothing. They can go in whenever it suits.

**Module delivery — our sequencing choice.** PR #2956 is held in draft **deliberately**, so that what reaches dev does something real rather than being a flag-gated shell. That is a product decision, not a blocker awaiting anyone.

**One open question**, set out at the end of this document. `hiap-meed-service-dev` is `ClusterIP` with no ingress, so `HIAP_MEED_API_URL` can only be exercised from inside the cluster — the first genuine test of the connection therefore has to happen on dev, after something is merged. Whether that is a small connectivity-only change first or a single merge of the whole module is a deploy-pipeline decision, not a frontend one.

---

## Architecture, briefly

**78 files:** 72 under `app/src/app/[lng]/cities/[cityId]/MEED/`, plus 5 proxy routes, 1 backend service, and a 177-line contract file.

```
MEED/
├── layout.tsx + MEEDClientLayout.tsx   page metadata + module access gate
├── page.tsx                            redirects to the newest inventory
├── (8 logic files)                     steps · navigation · status · gate · state
├── components/          14 files       shared chrome + primitives
└── [inventory]/         46 files       11 screens
```

**The spine.** `steps.ts` is the canonical 7-step list with ranking weights (emissions 55, context 23, regulations 23, preferences 22, policy 22 optional, finance 23), and it drives the stepper, hub cards and pre-flight from one place. `meedGate.ts` is the single `computeMeedGate()`. `navigation.ts` owns the `?from=` return contract. `useMeedRanking.ts` is the single read point for "does a ranking exist".

**Primitives.** 14 components, all thin data-mapping layers over existing Chakra/CityCatalyst components — no new visual language was invented.

**Data layer.** 5 RTK endpoints (tag `Meed`) → 5 proxy routes → `MeedGlobalApiService` → Global API. Auth is enforced **only** in the proxy routes via `UserService.findUserCity(cityId, context.session)`; the browser never touches the Global API. That is the deliberate change from the prototype, which made 16 direct browser calls upstream.

**State.** Entirely client-side today, keyed `meed:{inventoryId}:*` (`preferences`, `exclusions`, `step:{key}`, `ranking`). No MEED database tables. Two invariants to preserve when this moves server-side: **`confirmed` never regresses** (a data refresh must not undo a human acknowledgement), and **rankings are fingerprinted against their inputs**, so the UI can say "your answers changed since this was generated" rather than silently serving a stale list.

**Navigation.** A graph, not a line — every step is reachable from hub cards, stepper, breadcrumb or URL. `?from=` means editing a step from pre-flight returns you to pre-flight. Only the final generate action is gated, and the gate always explains itself next to the disabled button.

### Real vs. mock today

| Live upstream | CityCatalyst data | Input / derived | Not yet real |
|---|---|---|---|
| context, policy, finance | emissions (GHGI cross-read), hub | preferences, pre-flight | regulations *(precondition)*, processing *(8s animation)*, results *(empty, or mock behind a flag)* |

**6 of 11 screens already render live data.** The three that do not are exactly the three that need the prioritizer.

---

## Owed by the backend

All minor; none blocking.

| # | Ask | Why it matters |
|---|---|---|
| 1 | **Structured `warnings`** — `{code, params}` instead of English prose | The module ships in 5 languages and cannot translate the current strings. The only outstanding item with user-visible impact |
| 2 | **`datasource` / `version_label` on `CityIndicatorResponse`** | `INDICATOR_META` hardcodes citations like `"ENDISC 2015"` that live data contradicts (`cl-ine-censo` / `2024`). Without the field we should drop the Source column rather than show a wrong citation |
| 3 | **Documented vocabulary for `policy_support_category`** | Until then the field goes unused and we keep our own thresholds |

**Declined, and reasonably:** the 5-project / 5+5-opportunity caps mirror the evidence selection plan generation uses. We adapt the copy — `n_reachable_opportunities` reports 30 where we show 5, so the UI must read "5 of 30 shown" rather than silently contradict itself.

**Correction we owe:** an earlier version of the contract diff credited the migration with uncapped policy evidence. That was wrong — the upstream default is already 5 per action and hiap-meed does not pass `top_evidence_limit`. The document has been corrected.

---

## Owed by the frontend

All verified against live upstream data. These are **pre-existing bugs, not migration costs.**

| # | Bug | Impact | Where |
|---|---|---|---|
| 1 | **Every action shows "Cross-sector"** — we read a `sector` key that exists on 0 of 102 actions | Whole Sector column, every top-pick card, every detail panel | `results/components/actionCatalog.ts:63` |
| 2 | **Project costs 1000× too high** — `amount_unit` is `CLP_thousands` on 500/500 projects; we assume millions | Every project card | `finance/labels.ts:223` |
| 3 | **15% of actions show "Unknown route"** — no branch for `"needs technical assistance"` | Finance table and filter chips | `finance/labels.ts:48` |
| 4 | **Chilean cities described wrongly** — `profile` is `"Support-ready"` on 102/102, no branch | City profile card | `finance/labels.ts:126` |
| 5 | **Unknown-scope policy evidence counted as National** | Latent today; the new `scope` is nullable | `policy/policyAggregates.ts` |
| 6 | **Null-score rows silently dropped** — finance and policy both filter on `typeof === "number"` | Latent; the new contract returns nulls explicitly | `finance/types.ts`, `policy/policyRows.ts` |
| 7 | **Error cards have never rendered** — `MeedGlobalApiService` swallows every failure to `null` | "Broken" is indistinguishable from "no data" | `backend/meed/MeedGlobalApiService.ts` |
| 8 | **`warnings[]` never surfaced** | We cannot tell a user their data is partial | all screens |
| 9 | **Access gate does not withhold render** — `useModuleAccessLayout` only blocks when an `inventory` param is present; the MEED layout has only `{lng, cityId}` | Children render, then redirect asynchronously | `MEEDClientLayout.tsx` |
| 10 | **`MEED_MODULE` hides the tile, not the routes** — a direct URL still loads, subject only to module access | Worth a deliberate decision | `HomePage.tsx:293` |
| 11 | **All 5 endpoints typed `unknown`** with casts at the use site | ~150 lines of hand-rolled narrowing, no schema safety | `services/api.ts:209-238` |

Plus mechanical migration work: snake_case renames, `meta.total` → `meta.total_records`, projects array is `projects[]` not `data[]`, a two-group opportunities layout, and **omit `?language=`** — it validates against `("en","es")` only, so `?language=pt` returns 422, while omitting it returns all localizations including `pt`. That is the only route to Portuguese action names.

---

## Deploy plumbing (Mirco / Piotr)

Both are plain repo edits with no secrets. All three hiap-meed service names are confirmed from `hiap-meed/k8s/service-*.yml`, so the exact values are known — what is needed is review and agreement, not investigation.

**1. `HIAP_MEED_API_URL` does not exist.** `HIAP_API_URL` is not in `k8s/cc-web-deploy.yml` — it is set at deploy time by `kubectl set env`:

| File | Line | Value |
|---|---|---|
| `.github/workflows/web-develop.yml` | 479 | `"HIAP_MEED_API_URL=http://hiap-meed-service-dev" \` |
| `.github/workflows/web-test.yml` | 259 | `"HIAP_MEED_API_URL=http://hiap-meed-service-test" \` |
| `.github/workflows/web-tag.yml` | 242 | `"HIAP_MEED_API_URL=http://hiap-meed-service-prod" \` |
| `app/env.example` | ~65 | `HIAP_MEED_API_URL="http://localhost:8000"` |

Service names verified from `hiap-meed/k8s/service-{dev,test,prod}.yml` — all `ClusterIP` on port 80 → container 8000, no ingress, so they resolve only from inside the cluster.

**2. `MEED_MODULE` is not in dev's flags.** `NEXT_PUBLIC_FEATURE_FLAGS` appears three times in `web-develop.yml` (lines 41, 88, 483) — build-time and runtime. All three need it.

**Both are safe to land ahead of us.** On `develop` today the module has zero files and `MEED_MODULE` is not a defined flag, so the flag string is inert and the env var unused. There is no ordering dependency in either direction.

## Module delivery (ours)

**3. No client, no routes.** Nothing calls hiap-meed. Needs `MeedApiService.ts`, modelled on `backend/hiap/HiapApiService.ts`. This is the half of item 1 that is ours — the workflow supplies the value, our code has to read it.

**4. PR #2956 is held in draft deliberately**, so that what reaches dev does something real rather than being a flag-gated shell. Not a blocker awaiting review — a sequencing choice. See *Open decision* below.

### Making connectivity verifiable

hiap-meed exposes `GET /health` → `{"status":"healthy"}`. A diagnostic proxy route:

```
GET /api/v1/city/{city}/modules/meed/health → { url, status, latencyMs }
```

would answer "is this connected?" from one URL, separating *is the network wired* from *is the payload right* — two failures that are otherwise indistinguishable from inside the cluster. Logging the resolved `HIAP_MEED_API_URL` at module load (the `HiapService.ts:30` precedent) serves the same purpose. Whether this is worth a separate merge is the open decision below.

---

## Endpoint status

| Endpoint | Status |
|---|---|
| 7 reference-data GETs | Contract complete, #2982 approved, not deployed. 5 replace existing proxies, 2 are new (opportunities, projects), 1 unused (mitigation-feasibility) |
| `POST /v1/prioritize` | Contract stable, types already in `util/types/meed.ts`, **not wired** |
| `POST /v1/prioritize/exclusions/preview` | Not wired. Feeds pre-flight's confirmed-exclusions card, which today nothing ever writes to |
| `POST /v1/reports/output-plan` | Not wired. Sync vs. async to be decided by measurement, not assumption |
| `POST /v1/explanations/translate` | Not wired; fallback path only |

Note: **prioritize does not depend on #2982.** The hiap-meed pod fetches its own reference data, so the ranking can be wired while the GETs are still in review.

---

## Open decision: how to sequence the first deployment

`HIAP_MEED_API_URL` cannot be verified from a laptop. `hiap-meed-service-dev` is `ClusterIP` with no ingress, so it resolves only from inside the cluster — meaning the first genuine test of the connection can only happen on dev, after something is merged.

#2956 is held in draft so that what reaches dev is a working module rather than a flag-gated shell. That leaves an ordering question:

**Option A — connectivity first.** Merge a small, non-UI change that adds `MeedApiService` and a diagnostic route, so the connection can be confirmed on dev before the module lands. The module PR follows once the wiring is proven.

- Confirms `HIAP_MEED_API_URL` resolves and the pod reaches the service, independently of whether any payload is correct
- Two merges instead of one; adds code to `develop` that no user-facing feature consumes yet

**Option B — single merge.** Add the deploy values and merge #2956 together, and verify the connection at that point.

- One merge, one review cycle
- If `HIAP_MEED_API_URL` is wrong or the service is unreachable, that surfaces at the same moment as everything else, against a 109-file change

The trade-off is diagnostic isolation versus merge count. Either works; the choice belongs to whoever owns the deploy pipeline.

## Sequencing after that

1. **Prioritize POST** — replaces the mock and lights up regulations, processing and results.
2. **Reference-data migration** — 5 incremental PRs once #2982 is deployed. Carries frontend bugs 1–8.
3. **Reports** — measure, then decide.

Frontend bugs 1–4 are visible and independent of the migration; they can be pulled forward cheaply if a demo is imminent.

## Verification

- **Wiring:** hit the health route on dev; expect `{status:"healthy"}` and the resolved in-cluster URL in the pod logs.
- **Locally, without cluster access:** `cd hiap-meed && docker compose up` (port 8000, real upstream), then `HIAP_MEED_API_URL=http://localhost:8000`. Use `CL ANT` (attributes + policy + finance + opportunities) and `BR SAO` (policy + finance; no attributes upstream).
- **Regression:** `npx tsc --noEmit`, `npm run build`, and one load of a non-MEED city page with the flag off.
