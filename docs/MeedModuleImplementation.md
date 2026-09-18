# Actions & Plans v2 (MEED) — implementation notes

**Status:** frontend complete, prioritization backend not wired. Everything ships behind the
`MEED_MODULE` feature flag, which is **off by default**.

Companion to the planning docs in this folder — [`MeedModuleMigration.md`](./MeedModuleMigration.md),
[`MeedModuleMigration-Inventory.md`](./MeedModuleMigration-Inventory.md),
[`MeedModuleMigration-Interop.md`](./MeedModuleMigration-Interop.md) — which describe what was
*proposed*. This describes what was **built**, what was deliberately left out, and what the next
person needs to know.

---

## 1. What this is

A native CityCatalyst port of the MEED+ / HIAP v3 prioritizer, previously a standalone Vite/React
SPA at
[`meed-mitigation-prioritizer-frontend`](https://github.com/Open-Earth-Foundation/meed-mitigation-prioritizer-frontend).
It ranks climate mitigation actions for a city against one GHG inventory.

The module is **per city and per inventory**: every screen lives under
`/[lng]/cities/[cityId]/MEED/[inventory]/…`, so ranking against a different year is a matter of
switching inventory, and each inventory keeps its own answers.

City, project and organisation switching is deliberately **not** duplicated here — that belongs to
the global side navigation (`components/HomePage/JNDrawer.tsx`).

---

## 2. Route map

```
[lng]/cities/[cityId]/MEED/
├── layout.tsx              server component, page metadata
├── MEEDClientLayout.tsx    module access gate (useModuleAccessLayout + Modules.MEED.id)
├── page.tsx                redirects to the newest inventory, or GHGI onboarding if none
├── steps.ts                canonical step list — single source of truth
├── navigation.ts           ?from= return-context contract
├── meedStatus.ts           four-state section model + inputs fingerprint
├── meedGate.ts             the "can we generate?" rule, one implementation
├── meedLocalState.ts       TEMPORARY client persistence (see §6)
├── meedMockRanking.ts      catalog-backed stand-in ranking (flag-gated, see §5)
├── useMeedRanking.ts       the ONE source for "does a ranking exist"
├── useMeedInventories.ts   inventories shaped for the year selector
├── components/             module primitives (see §4)
└── [inventory]/
    ├── page.tsx            the hub / landing screen
    ├── emissions/          step 1 — real GHGI data
    ├── context/            step 2 — Global API city attributes
    ├── regulations/        step 3 — precondition state (needs backend)
    ├── preferences/        step 4 — the input form
    ├── policy/             step 5 — real Global API policy scores
    ├── finance/            step 6 — real Global API finance data
    ├── preflight/          step 7 — readiness, weights, generate CTA
    ├── processing/         run animation
    └── results/            results overview + ranked table + detail drawer
```

Backend proxies live at `app/src/app/api/v1/city/[city]/modules/meed/…` and the server-side reader
at `app/src/backend/meed/MeedGlobalApiService.ts`.

---

## 3. Endpoint status — read this before wiring the backend

### Working today, on real data

All proxied server-side through the module's own routes (the prototype called these directly from
the browser, which is what caused its screen-vs-report divergence):

| Upstream (Global API) | Our route |
|---|---|
| `GET /api/v1/action-pathways` | `…/modules/meed/actions` |
| `GET /api/v0/city_attributes/{locode}` | `…/modules/meed/city-attributes` |
| `GET /api/v1/cities/{locode}/action-policy-scores` | `…/modules/meed/policy-scores` |
| `GET /api/v1/cities/{locode}/climate-finance/feasibility` | `…/modules/meed/finance/feasibility` |
| `links.projects` / `links.opportunities` (relative links inside responses) | `…/modules/meed/finance/follow` |

Emissions come from CityCatalyst's own inventory endpoints (`useGetResultsQuery`,
`useGetSectorBreakdownQuery`) — the first real cross-module read, MEED ← GHGI.

### NOT built — the prioritizer itself

There is **no client, no proxy route and no env var** for the four `hiap-meed` endpoints:

```
POST /v1/prioritize                    → the ranking
POST /v1/prioritize/exclusions/preview → legal screening preview
POST /v1/reports/output-plan           → per-action report (10–30 s LLM call)
POST /v1/explanations/translate        → explanation translation fallback
```

Their request/response types **are** already defined, in
[`app/src/util/types/meed.ts`](../app/src/util/types/meed.ts), extracted from the prototype's
`lib/hiapApi.ts`. That is the week-0 contract artifact from the migration plan; the frontend is
built against it.

### The service is reachable — from inside the cluster

`hiap-meed` is deployed and running. From
[`hiap-meed/k8s/service-dev.yml`](../hiap-meed/k8s/service-dev.yml):

- Service name `hiap-meed-service-dev`, namespace `default`, port `80` → container `8000`
- **`type: ClusterIP`**, and there is no ingress in `hiap-meed/k8s/`

So it is reachable **from a deployed CityCatalyst pod** at `http://hiap-meed-service-dev`, and
**not** from a laptop without help. For local work:

```bash
kubectl port-forward svc/hiap-meed-service-dev 8000:80   # then http://localhost:8000
# or run it locally:
cd hiap-meed && docker compose up          # see hiap-meed/README.md for required env
```

### What wiring it takes

1. `HIAP_MEED_API_URL` in `app/env.example` and `app/.env` (default `http://hiap-meed-service-dev`),
   plus `k8s/cc-web-deploy.yml`.
2. `app/src/backend/meed/MeedApiService.ts` — HTTP client for the four endpoints, modelled on
   `src/backend/hiap/HiapApiService.ts`. Note `hiap-meed` is **synchronous** (`POST` → result),
   unlike `hiap` which is task-polled. Every call wraps its payload as `{ meta, requestData }`;
   build that envelope server-side.
3. Proxy routes under `…/modules/meed/prioritize` etc., via `apiHandler` like the existing five.
4. A `MeedInventoryService` that turns an inventory into the GPC-reference-level `gpcData` the
   prioritizer needs. **This is the correctness-critical piece** — the prototype's
   `lib/cityInventory.ts` already implements the same transform, so a golden test against the
   bundled snapshots is cheap and worth it.
5. RTK Query endpoints + swap `useMeedRanking` from local storage to the query (§6).

Report generation additionally needs the async job + cron pattern — it cannot run inside a request
handler.

---

## 4. Module primitives

Built on components that already existed, per the "reuse first" rule. **No new visual language was
invented** — each is a data-mapping layer.

| Component | Built on | Why it exists |
|---|---|---|
| `MeedStepper` | Chakra `Steps` (ships in v3, unused elsewhere in CC) | Chakra derives step status from the index; we need it from stored progress |
| `MeedMeter` | Chakra `Progress` | Replaced five hand-rolled bars that disagreed on height, radius and colour |
| `MeedStatusTag` | `ui/tag` | The theme's tag status variants don't render (see §8) |
| `MeedChipGroup` | Chakra `Checkbox.Root` | Real inputs, so selection is announced and keyboard-operable |
| `MeedInfoTip` | `ui/tooltip` | Adds a focusable trigger |
| `MeedSkeletons` | `ui/skeleton` | Replaced six text loaders that caused layout jump |
| `MeedShell` | — | One page container replacing three duplicated copies |
| `MeedContextHeader` / `MeedModuleHeader` / `MeedBreadcrumb` | — | Module chrome; see §7 on why not the GHGI `Hero` |
| `MeedInventoryMenu` | `ui/menu` | Compact switcher; the shared `YearSelector` renders year *cards*, too heavy for a header bar |
| `MeedSectionCard`, `MeedRankingCard`, `MeedGateNotice` | Chakra `Card` | Module-specific compositions |

Also now used where they weren't: `ui/checkbox`, `ui/slider`, `ui/tooltip`, `ui/menu`,
`ui/skeleton`, `package/Texts/Overline`, `package/Texts/Display`.

---

## 5. What is real, what is simulated

**Real:** the action catalog (102 actions), policy scores (assessed against 7 national plans for
São Paulo), climate-finance feasibility (52 self-deliverable / 27 co-finance / 7 finance+support),
and the GHG inventory.

**Simulated, behind `MEED_MOCK_RANKING` (off by default):** the ranking itself.
[`meedMockRanking.ts`](../app/src/app/[lng]/cities/[cityId]/MEED/meedMockRanking.ts) builds a
stand-in from the **live catalog** — every action id, name, sector, timeline and co-benefit is real;
only the three pillar scores are synthetic, derived deterministically from the action id so ordering
is stable between runs. Results are tagged `isMock`.

This exists so the results screens can be reviewed before the service is wired. **Delete the file
when `POST /v1/prioritize` lands.**

To exercise the whole flow locally:

```bash
# in app/.env
NEXT_PUBLIC_FEATURE_FLAGS="…,MEED_MODULE,MEED_MOCK_RANKING"
```

then walk pre-flight → generate → processing → results.

---

## 6. State — currently client-side, by design

`meedLocalState.ts` keeps everything under `meed:{inventoryId}:*` in `localStorage`:
preferences, confirmed exclusions, per-step progress, and the generated ranking.

This mirrors the prototype's `hiap:{locode}:*` families and is **explicitly temporary**. It should
become the `MeedPreferences` / `MeedExclusion` / `MeedRanking` tables described in the migration
plan. Two properties are worth preserving when it moves:

- **`confirmed` never regresses.** A human acknowledgement must not be undone by an automatic data
  refresh.
- **Inputs are fingerprinted** when a ranking is generated (`inputsFingerprint`), so the UI can tell
  the user their answers have changed since — rather than quietly serving a stale ranking.

`useMeedRanking(inventoryId, states)` is the single read point for "does a ranking exist". The
landing screen and the results screen both consume it. **When the backend lands, change that one
hook to the RTK query and every consumer keeps working.** They previously had separate sources and
contradicted each other in review; do not reintroduce that.

---

## 7. Decisions taken, and why

| Decision | Reasoning |
|---|---|
| **CityCatalyst design system, not the MEED+ palette** | Consistency with GHGI/HIAP; the MEED identity lives in the module card, name and copy |
| **Display-name rename only** ("Actions & Plans v2") | URLs, folders, module id, feature flag, API routes and i18n filenames stay `meed`, so in-flight backend work and the merged planning docs stay valid |
| **Hub-and-spoke navigation, not a linear wizard** | Every step reachable from the hub, stepper, breadcrumb or URL. Only the final generate action is gated, and it explains what's missing |
| **`?from=` return context** | Editing a step from pre-flight returns to pre-flight, not deeper into the wizard |
| **Own header, not the GHGI `Hero`** | `Hero` is built around an inventory — 491px of emissions stats and a city map. Right frame for the inventory module, wrong one where the subject is the ranking |
| **One report entry point** | The prototype had a per-card report button *and* a checkbox-driven multi-action report, which competed. Selection is now the only mechanism |
| **Colour means one thing in the stepper** | Blue = "you are here". Finished/needs-review are distinguished by *shape* (check / eye). Four statuses in four colours read as noise in a 28px strip with no legend |
| **Priority chips dropped** | The prototype painted HIGH in red; in CC red means *negative*, so a red "HIGH" on Emissions reads as an error. The "shapes 55% of ranking" weight badge says the same thing |
| **Spacing tokens only** | 310 raw pixel values across 36 files moved onto the theme scale, collapsing 12 ad-hoc gap values onto one rhythm |

### Deliberately not built

Report generation (needs the async LLM job), the exclusions preview call, real prioritization,
database persistence, and the ~345-comuna Chilean onboarding (a data operation, decoupled from this
module — because the module reads through the inventory layer, nothing here changes as more cities
arrive).

---

## 8. Platform issues found along the way

**Fixed, in a separate branch (`fix/theme-radii-full`, merged into this one):**

- `radii.full` was defined as `50%` instead of a stadium radius, so every wide, short element —
  progress tracks, slider tracks and thumbs, pill chips — rendered as an **ellipse**, app-wide.
  Chakra's own slider and progress recipes use `full` internally. A square element clamps to the
  same circle either way, so avatars and dots are unaffected; verified on the GHGI page that all
  elements resolving `full` are square and render identically.
- `Hero` gained an optional `moduleLabel` prop. Its breadcrumb was hard-coded by pathname sniffing,
  so this module's breadcrumb read "GHG Inventories".

**Found and NOT fixed — each needs its own ticket:**

1. **Slot recipes are never registered.** `app-theme.ts` passes `tag`, `card`, `tooltip`,
   `accordion`, `progress`, `switch` and `tabs` under `recipes`, but Chakra v3 requires those under
   `slotRecipes` — and there is no `slotRecipes` key anywhere in `src/`. So `tagRecipe`'s
   ready-made `success` / `warning` / `low` / `medium` / `high` variants **have never rendered
   anywhere in CityCatalyst**. That is why code reaches for `colorPalette` and lands on stock greys.
   Fixing it would restyle Tag/Card/Tooltip/Accordion/Progress/Switch across GHGI, HIAP, dashboard
   and settings in one commit — it needs design review, hence the module-local `MeedStatusTag`.
   (`tab` is also the wrong key; Chakra uses `tabs`. `form` and `text` aren't Chakra recipe keys.)
2. **`divider.neutral` (#F0F0F0) is ~1.15:1 on white** — unusable as a structural border, though it
   is the only `divider.*` token. Use `border.neutral` (#D7D8FA) or `border.overlay` (#E6E7FF).
3. **`CCTerraButton` hardcodes `minW="172px" h="48px"`** and wraps children in a `<Text>`, so nested
   markup inside it is invalid HTML. It needs a `size` prop; it is used app-wide.
4. **`useModuleAccessLayout` renders a silent infinite spinner** when access is denied — no message.
   Shared with CCRA.
5. **`components/steps/progress-steps.tsx` never renders its `title` prop.**
6. **ESLint is broken repo-wide** on `develop` (eslint 10 vs the `eslint-config-next` react plugin);
   every file errors. `npx tsc --noEmit` and `npm run build` are the usable gates.

---

## 9. Running it locally

```bash
cd app
npm install
bash scripts/start-db.sh          # or reuse an existing citycatalyst-db container
cp env.example .env               # then set DATABASE_PASSWORD to match your container
npm run db:migrate && npm run db:seed
npx sequelize-cli db:seed --seed 20260804090000-rename-meed-module.cjs   # if the modules seeder already ran
npm run dev
```

Enable the module: add `MEED_MODULE` to `NEXT_PUBLIC_FEATURE_FLAGS` in `.env` (plus
`MEED_MOCK_RANKING` to exercise the results screens). The module also needs a `ProjectModules` grant:

```sql
INSERT INTO "ProjectModules" (project_id, module_id)
SELECT project_id, '9f622243-fba8-4f32-a000-ce6e66982bd1' FROM "Project"
ON CONFLICT DO NOTHING;
```

**Note on the module registration:** `seed-data/modules/modules.json` is not read at runtime — it is
bulk-upserted by `seeders/20250923103314-modules.cjs`, which Sequelize records as already executed.
Any change to a module's name or description therefore needs a new dated seeder to reach an existing
database. `seeders/20260804090000-rename-meed-module.cjs` is the example.

---

## 10. What's left, in order

1. **Wire the prioritizer** (§3). Unblocks results, the ranked table, the detail drawer and the
   whole processing screen. Everything downstream is already built against the contract.
2. **Database persistence** replacing `meedLocalState` (§6).
3. **Report generation** — async job + cron, per the migration plan.
4. **Translations.** The nine `meed*` namespaces exist in `en` only. Deliberately left last so the
   copy stops moving first; users currently see English with a console error, not raw keys, because
   `fallbackLng` is `en`. Run `npm run i18n:update` or let CI translate.
5. **Keyboard-only pass** across hub → step → pre-flight → results, and a Playwright happy path.
6. **Golden screenshots** of the prototype for side-by-side visual QA (never captured).

### Known rough edges

- The `processing` screen runs an 8-second scripted animation that is not gated on any real request.
  It has a cancel exit; the TODO marks where the real call goes.
- `regulations` and the ranked results render precondition/empty states until the backend lands.
- Co-benefits on the results screen are omitted entirely when the data isn't present, rather than
  invented — so that section can legitimately disappear.
