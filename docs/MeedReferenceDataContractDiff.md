# MEED reference data: prototype endpoints vs. the hiap-meed contract

**Purpose:** establish what it takes for the Actions & Plans v2 module to stop calling the Global API directly and read everything through hiap-meed.

**Target state:** zero direct Global API calls from CityCatalyst. Every read goes through hiap-meed, so the data the user sees on screen and the data the prioritizer ranks on are the same data, selected by the same rules. Today they are two independent fetches of the same upstream, which is exactly the divergence this migration exists to remove.

This is a gap analysis against that fixed destination, not a menu of options.

**Sources.** Contract: `hiap-meed/app/modules/reference_data/models.py` on branch `cc-603-implement-apis` ([PR #2982](https://github.com/Open-Earth-Foundation/CityCatalyst/pull/2982), open, mergeable, blocked on review). Every response model sets `extra="forbid"`, so the field lists below are exhaustive — nothing extra rides along. Consumer side: the module as it stands on `feat/meed-module-scaffold` ([PR #2956](https://github.com/Open-Earth-Foundation/CityCatalyst/pull/2956)).

---

## Status: resolved

**This document did its job.** It was written against the first draft of the contract, which dropped 17 fields the module renders. The backend author addressed **6 of the 7 asks in full**; the seventh was declined with sound reasoning. The contract is now functionally complete for our UI — every field the module renders has a source.

The per-endpoint analysis below is kept as the record of what was asked and why. Each ask now carries its outcome.

| Ask | Outcome |
|---|---|
| 1. Per-action policy evidence strength | ✅ `evidence_strength`, `signal_strength`, `signal_type`, plus `document_type`, `signal_relation`, `doc_relevance` — originals passed through unchanged |
| 2. Project cost / funder / match confidence | ✅ all, plus `sector`, `project_name_i18n`, and `amount_unit` (not asked for) |
| 3. Catalog sector / co-benefits / emissions | ✅ `co_benefits` and `emissions{sector_number, gpc_reference_number, impact_*}`. Sector is **derivable, not top-level** — see below |
| 4. Indicator category | ✅ `category` on `indicators[]` |
| 5. Finance `inputs` | ✅ exact match to our `FeasibilityInputs`, including two fields we declared but never read |
| 6. `signal_type` + vocabulary | ✅ the synthetic `relevance` was removed in favour of upstream originals |
| 7. The 5-item caps | ❌ **declined** — they mirror the evidence selection plan generation uses, not a browsing catalogue. We adapt the copy instead |

### On sector — the ask was wrong, and it exposed a bug of ours

Global API provides **no top-level action sector**; it provides `emissions.sector_number` and `gpc_reference_number`. Verified across all 102 catalog actions. Deriving the tag is therefore *our* work, using the backend's own `SECTOR_NUMBER_TO_TAG` (`prioritizer/utils/sector_mapping.py`) — the same map the prioritizer matches sector preferences through.

That check also caught a live defect: `actionCatalog.ts:63` reads a `sector` key that has never existed upstream, so `sectorLabel` always falls through and **every action currently displays "Cross-sector"** in the ranked table, the top-pick cards and the detail panel.

### Outstanding, all minor and non-blocking

1. **Structured `warnings`** (`{code, params}` instead of English prose) — the module ships in 5 languages and cannot translate the current strings.
2. **`datasource` / `version_label` on `CityIndicatorResponse`** — `INDICATOR_META` hardcodes citations like `"ENDISC 2015"` that live data contradicts (`cl-ine-censo` / `2024`). Without the field we should drop the Source column rather than display a wrong citation.
3. **Documented vocabulary for `policy_support_category`** — until then we keep our own thresholds and the field goes unused.

---

## 1. City attributes

`GET /api/v0/city_attributes/{locode}` → `GET /v1/cities/{locode}/attributes`

Consumer: `context/indicators.ts:304`, `context/page.tsx:314`. 34 known indicator keys, 4 promoted to cards.

Structure changes from a **map keyed by indicator name** to an **array of records** — mechanical, fine.

| Today | New | Status |
|---|---|---|
| `city.<key>.attribute_value` | `indicators[].value` | renamed; type widens to `float \| str \| null` (we filter on `number` today) |
| `city.<key>.attribute_units` | `indicators[].unit` | renamed |
| `city.<key>.attribute_category` | — | **dropped** |
| — | `city.population_size`, `area_km2`, `population_density`, `region_name`, `country_code` | **gained** as first-class fields |

**What breaks:** `attribute_category` is the qualitative band (`very high` → `very low`) behind the level chip on every indicator. `buildIndicators` reads it directly and `INDICATOR_META` validates against it. Without it, all 34 indicators lose their band and become bare numbers — the user can see 8.1% unemployment but not whether that is high for a city like theirs.

**Workaround:** none that is honest. We could bucket client-side, but the thresholds are upstream domain knowledge, and inventing them would be fabricating an assessment.

**Ask:** add `category: str | None` to `CityIndicatorResponse`. → ✅ **delivered.**

---

## 2. Action pathways

`GET /api/v1/action-pathways` → `GET /v1/action-pathways?language=`

Consumer: `results/components/actionCatalog.ts:35` (`buildActionIndex`), used by 4 screens — landing, results, policy, processing.

| Today | New | Status |
|---|---|---|
| `actionId` / `ActionID` | `action_id` | renamed — and the dual-casing tolerance can go, backend normalizes |
| `actionName` / `ActionName` | `action_name` | renamed |
| `description` | `description` | same |
| `timelineForImplementation` | `implementation_timeline` | renamed |
| `sector` / `Sector` | — | **dropped** |
| `coBenefits` / `CoBenefits` | — | **dropped** |
| `emissions.impact_numeric` / `impact_text` | — | **dropped** |
| — | `name_i18n`, `description_i18n` | **gained** |
| — | `action_type`, `investment_cost` | **gained** |

**What breaks:**
- `sector` drives sector chips and grouping on results, and `gpcToSectorTag`.
- `coBenefits` is the fallback in `coBenefits.ts:127-146` when the prioritize response's `evidence_summary` carries none, and feeds `CoBenefitStrip`.
- `emissions.impact_numeric` is the 1–5 impact level on results cards.

**Workarounds, all partial:** `sector` is recoverable per-action from the finance feasibility endpoint — but only for actions that have a finance row. `coBenefits` degrades to whatever `evidence_summary` provides. `emissions.impact_numeric` is a *catalog attribute* (this action's inherent potential); `impact_score` in the prioritize response is a *contextual score* (this action against this city's inventory). Substituting one for the other would silently change what the number means.

**Gained, and worth naming:** `name_i18n` / `description_i18n` mean action names finally render in Spanish and Portuguese. The module ships in 5 languages and currently shows every action name in English. This alone is a strong argument for the migration.

**Ask:** add `sector`, `co_benefits`, and the emissions impact fields to `ActionPathwayResponse`. → ✅ **`co_benefits` and `emissions` delivered.** `sector` does not exist upstream — we derive it from `emissions.sector_number` (see Status above).

---

## 3. Action policy scores — *was the largest loss, now resolved*

`GET /api/v1/cities/{locode}/action-policy-scores?top_evidence_limit=5` → `GET /v1/cities/{locode}/action-policy-scores`

Consumers: `policy/policyRows.ts`, `policy/policyAggregates.ts`, `policy/components/PolicyActionRow.tsx`.

| Today | New | Status |
|---|---|---|
| `scores[].src_action_id` | `scores[].action_id` | renamed |
| `scores[].policy_support_score` | same | same |
| `policy_evidence[].document_name` | same | same |
| `policy_evidence[].document_type` | `policy_evidence[].scope` | **improved** — backend now does the `parcc`→Regional / `paccc`→Municipal mapping, so `docScope()` is deleted |
| `policy_evidence[].evidence_strength` | — | **dropped** |
| `policy_evidence[].signal_strength` | — | **dropped** |
| `policy_evidence[].signal_type` | — | **dropped** |
| *(computed client-side)* | `aggregates.{national,regional,municipal}` | **gained** — `computePolicyAggregates` is deleted |
| — | `policy_support_category`, `finding_count`, `document_count` | **gained** |
| `top_evidence_limit=5` | *(parameter not accepted)* | **no change** — the upstream default is already 5 per action, and hiap-meed does not pass the parameter. Verified live: 102 actions, 510 evidence rows, max 5 each |

**What breaks, precisely.** The policy table has five columns: Action · Score · National · Regional · Municipal. The last three are **per-action** meters computed in `derivePolicyRows` as `scopeMax[scope] = max(evidenceStrengthNum(ev))` over that action's evidence — and `evidenceStrengthNum` reads `evidence_strength`, falling back to `signal_strength`. Both are gone, so `scopeMax` cannot be computed, **three of five columns go blank**, and `sortPolicyRows` loses three of its four sort keys.

The new `aggregates` do **not** substitute. They are three city-level numbers for the summary header; the columns are per-action. We gain the header and lose the table.

`signal_type` additionally drives the evidence chips (`SIGNAL_TYPE_KEYS`: action / funding / governance / sector_priority / target). The new `relevance: str | None` may cover some of this, but its vocabulary is undocumented — the only example value is `"supporting"`.

**Workaround:** none. The numeric strength is not in the response in any form.

**Ask (highest priority):** → ✅ **delivered.** `PolicyEvidenceResponse` now carries `evidence_strength`, `signal_strength`, `signal_type`, `signal_relation`, `doc_relevance` and the original `document_type`, so `derivePolicyRows` keeps working and all five columns survive. `scope` is now `national|regional|municipal|null` — unknown-scope evidence must contribute to no scope aggregate rather than defaulting to National, which is a bug in our current `docScope`. The original ask was for either a numeric strength or per-action scope scores:

```
scores[].scope_scores: { national: float|null, regional: float|null, municipal: float|null }
```

That would let us delete `derivePolicyRows`' scope loop entirely and keep the table. Also worth confirming the controlled vocabulary for `relevance`.

---

## 4. Action mitigation-feasibility scores

`GET /v1/cities/{locode}/action-mitigation-feasibility-scores?country_code=`

**New endpoint, no current consumer.** Pure gain: `action_score`, `rank_within_city`, `dimension_scores{}` per action. The module has no feasibility view today; this could power one, and `rank_within_city` is a natural sort for the results table.

No migration work. Listed for completeness.

---

## 5. Financial feasibility

`GET /api/v1/cities/{locode}/climate-finance/feasibility?country_code=` → same path under hiap-meed

Consumers: `finance/types.ts:53`, `finance/page.tsx`, `finance/components/{FeasibilityRow,RowDetail}.tsx`.

| Today | New | Status |
|---|---|---|
| `action_id`, `action_name`, `sector`, `route`, `reason` | same | same |
| `financial_feasibility` | same, but **nullable** | see below |
| `inputs.action.capital_intensity` | — | **dropped** |
| `inputs.action.preparation_complexity` | — | **dropped** |
| `inputs.city.profile` | — | **dropped** |
| `inputs.finance.n_reachable_opportunities` | — | **dropped** |
| `links.opportunities` / `links.projects` | — | **replaced** by §6 and §7 — an improvement |

**Nullability is a bug fix on our side.** `extractFeasibilityRows` currently requires `typeof financial_feasibility === "number"` and **silently drops every row without a score**. The new contract returns those rows explicitly, ordered last. We must keep them and render "no score available" — the user should see that an action was assessed and had no finance data, not that it does not exist.

**What breaks:** `RowDetail` renders capital intensity, preparation complexity, city profile and reachable-opportunity count. All four disappear. `inputs.finance.fund_access` and `inputs.evidence.n_existing_projects` are also dropped but are declared-and-unread, so no impact.

**Ask:** restore `inputs`, or a slimmer explicit object. → ✅ **delivered in full**, including `fund_access` and `n_existing_projects`.

---

## 6. Climate-finance opportunities — **fully covered**

Follow `links.opportunities` via `…/modules/meed/finance/follow?link=` → `GET /v1/climate-finance/opportunities?country_code=&sector=&route=`

Consumer: `finance/components/OpportunityCard.tsx`, via `useGetMeedFinanceLinkQuery`.

| Today | New | Status |
|---|---|---|
| `opportunity_name`, `funder_name` | same | same — these are the only two we render |
| `instrument`, `status`, `source_url` | same | present; **we declare but never render them** — could now light up the `STATUS_KEYS`/`STATUS_TONE` maps already sitting unused in `labels.ts:189` |
| `amount_note`, `notes` | — | dropped, both unread — no impact |
| *(flat list)* | `current[]` + `monitor[]`, with `recurrence` on monitor | **structural change** |
| `meta.total` | `meta.total_records` | rename in `extractLinkedList` |

**Two real changes.** The response now splits into current and monitoring groups — a UI improvement (recurring closed calls are genuinely different from open ones) but it needs a two-group layout rather than one list. And results are capped at **5 current + 5 monitoring**, backend-owned; today the followed link returns more.

**Net: this endpoint is strictly better.** It also lets us delete the `finance/follow` proxy route, `useGetMeedFinanceLinkQuery`, and the arbitrary-URL-following security guard in `MeedGlobalApiService.followLink`.

**Ask:** none. → The 5+5 cap is **confirmed intentional** — it mirrors the evidence selection plan generation uses. We change the copy to "5 of 30 shown" so the count and the list stop contradicting each other.

---

## 7. Climate-finance projects — **second-largest loss**

Follow `links.projects` + `?limit=50` → `GET /v1/climate-finance/projects?country_code=&action_id=`

Consumer: `finance/components/ProjectCard.tsx`.

| Today | New | Status |
|---|---|---|
| `project_name` | same | same |
| `jurisdiction`, `lifecycle_stage`, `funding_channel` | same | same |
| `cost_total` | — | **dropped** |
| `funding_sources[].funder_name` | — | **dropped** |
| `action_matches[].confidence` | — | **dropped** |
| `project_name_i18n` | — | **dropped** (falls back to `project_name` — minor) |
| `sector` | — | **dropped** |
| `?limit=50` | *(capped at 5)* | **10× fewer results** |

**What breaks:** `ProjectCard` renders a confidence tag, a cost field, a funder field and a sector field. All four are gone, leaving name + jurisdiction + lifecycle + channel. The card loses its two most decision-relevant facts — how much a comparable project cost, and who paid for it.

`confidence` matters separately: it is how the user knows whether this project is genuinely comparable or a loose match. Without it every project is presented with equal authority.

**Workaround:** none.

**Ask (second priority):** → ✅ **delivered in full** — `cost_total`, `funding_sources[]` (with per-source `amount`/`amount_unit`), `action_matches[].confidence`, `sector`, `project_name_i18n`, plus `amount_unit` at project level, which fixes a 1000× display error on our side (`formatClpMillions` assumes millions; live data is `CLP_thousands`). The 5-project cap is **confirmed intentional**.

---

## What unification deletes

Real simplification, worth stating alongside the asks:

- **`MeedGlobalApiService.ts`** — the whole file, including `followLink`'s `/api/v1/cities/` path guard, which exists only because we let the browser drive an arbitrary upstream URL.
- **`…/modules/meed/finance/follow/route.ts`** and `useGetMeedFinanceLinkQuery`.
- **`policyAggregates.computePolicyAggregates`**, `docScope`, `SIGNAL_STRENGTH_NUM` — all replaced by backend `aggregates` and `scope`.
- **Dual-casing tolerance** in `buildActionIndex` (`actionId` / `ActionID`, ×6 fields).
- `GLOBAL_API_URL` as a MEED dependency — the module stops needing to know the Global API exists.

## What unification gains

1. **Screen and ranking agree by construction** — the reason to do this.
2. **`name_i18n` / `description_i18n`** — action names in Spanish and Portuguese, instead of English everywhere. (3 of our 5 shipped languages; `de` and `fr` do not exist upstream.)
3. **Backend `aggregates`** — one less client-side calculation to keep in sync.
4. **`warnings[]` on every response** — we currently have no way to tell the user their data is partial. This is the first time the backend can say so.
5. **`meta.generated_at_utc`** — provenance we can show next to a ranking.
6. **A mitigation-feasibility endpoint** we do not use yet.

---

## Asks, in priority order

| # | Endpoint | Ask | Outcome |
|---|---|---|---|
| 1 | policy scores | per-action scope scores, or a numeric strength on `policy_evidence[]` | ✅ numeric `evidence_strength` + all signal fields restored |
| 2 | projects | `cost_total`, `funding_sources[]`, per-project match `confidence` | ✅ delivered, plus `sector`, `project_name_i18n`, `amount_unit` |
| 3 | action pathways | `sector`, `co_benefits`, emissions impact | ✅ `co_benefits` + `emissions`; `sector` derived from `sector_number` |
| 4 | city attributes | `category` on `indicators[]` | ✅ delivered |
| 5 | finance feasibility | `inputs` (or a slimmer drivers object) | ✅ delivered in full |
| 6 | policy scores | documented vocabulary for `relevance`; `signal_type` | ✅ synthetic `relevance` dropped for upstream originals |
| 7 | opportunities / projects | confirm the 5 / 5+5 caps are intended for a browsing UI | ❌ declined — intentional; we change the copy |

### Still open

| # | Ask | Impact |
|---|---|---|
| 8 | Structured `warnings` (`{code, params}`, not English prose) | Untranslatable in a 5-language module |
| 9 | `datasource` / `version_label` on `CityIndicatorResponse` | We display hardcoded citations that live data contradicts; without it, drop the Source column |
| 10 | Documented vocabulary for `policy_support_category` | Field goes unused; we keep our own thresholds |

## Changes we must make regardless

Independent of any amendment:

- **Keep null-scored finance rows.** `extractFeasibilityRows` drops them today; that is a bug the new contract exposes.
- **Rename** `src_action_id`→`action_id`, `attribute_value`→`value`, `timelineForImplementation`→`implementation_timeline`, `meta.total`→`meta.total_records`.
- **Two-group opportunities layout** for `current[]` / `monitor[]`.
- **Type the responses properly.** All five current MEED RTK endpoints are typed `unknown` with a cast at the use site. The new contract is strict and generated from Pydantic — there is no excuse to keep casting.
- **Surface `warnings[]`.** Every response carries it and no screen reads it today.

## Recommendation

*(Original recommendation, now acted on: the asks went to the backend team as a single batch and 6 of 7 were delivered. The migration can proceed without removing information from any screen.)*

The standing principle still holds: where a field is genuinely unavailable, drop the affected UI rather than keep a parallel Global API call to fill the gap — a second fetch of the same upstream is precisely the divergence this work exists to eliminate, and re-introducing it for cosmetic parity would trade the actual goal for the appearance of it.

Sequencing note: none of this blocks `POST /v1/prioritize`. The hiap-meed pod fetches its own reference data, so the ranking can be wired while these are still being negotiated.
