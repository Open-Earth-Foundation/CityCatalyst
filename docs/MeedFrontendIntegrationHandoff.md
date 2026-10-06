# Handoff: wire the MEED frontend to the ranking route

**Temporary working document.** Delete before #2956 merges — this is session
scaffolding, not product documentation. Durable material lives in
`MeedModuleImplementation.md` and `MeedIntegrationStatus.md`.

## The job

The Actions & Plans v2 module renders a **mock** ranking. Milan's backend route
now exists ([#3023](https://github.com/Open-Earth-Foundation/CityCatalyst/pull/3023)).
Replace the mock with real calls to it.

Roughly a day. Nothing here needs the hiap-meed service directly — the CC route
is the only boundary the frontend touches.

## The contract (verified against his branch, not assumed)

`milan/feat-cc-598-meed-api-service`

```
POST /api/v1/city/{cityId}/meed/rank
GET  /api/v1/city/{cityId}/meed/rank?inventoryId={uuid}
```

Both return the same envelope:

```jsonc
{ "data": { "rankedActions": [...], "removedActions": [...] } }
```

**POST request body** — note `inventoryId` is top level and `cityDataList` is an
array even though one inventory means one city:

```jsonc
{
  "inventoryId": "<uuid>",
  "requestedLanguages": ["en"],
  "topN": 20,
  "createExplanations": true,
  "cityDataList": [{
    "excludedActionIds": [],
    "weightsOverride": {},                          // {} means "use defaults"
    "cityStrategicPreferenceSectors": ["stationary_energy"],
    "cityStrategicPreferenceTimeframes": ["short"],
    "cityStrategicPreferenceCoBenefitKeys": []
  }]
}
```

We do **not** send `locode`, `countryCode`, `populationSize` or
`cityEmissionsData` — his route builds those from the CityCatalyst DB using
`inventoryId`. Do not add them.

**`rankedActions[]`** — `id`, `inventoryId`, `actionId`, `rank`, `finalScore`,
`impactScore`, `alignmentScore`, `feasibilityScore`, `explanations: {en, …}`,
`created`, `lastUpdated`.

**`removedActions[]`** — the above plus `actionName`, `removalReason`,
`removalSource`, `verdictCategory`, `ownershipCategory`, `restrictionsCategory`,
`ownershipDescription: {en, es}`, `restrictionsDescription: {en, es}`,
`legalJustification: {en, es}`, `legalReferences: string[]`.

An example response is on Carlos's Desktop as
`meed_rank_example_response_json.json` — use it as the adapter's test fixture.

### The two mismatches to handle

**1. Casing.** His model is camelCase (`actionId`, `finalScore`) — correct for
CityCatalyst. Our internal types in `app/src/util/types/meed.ts` are the
prioritizer's snake_case (`action_id`, `final_score`), and every screen reads
them. **Adapt at the boundary; do not rename the internal types**, or you touch
every consumer for no gain.

**2. Ordering.** `getRanking` uses `findAll` with no `order` clause, so rows come
back in arbitrary Postgres order. The results screen takes the first three as
"top picks". **Sort by `rank` in the adapter** regardless of whether Milan adds
`order: [["rank","ASC"]]` — cheap insurance.

### Two fields still pending on his side

Both degrade gracefully; build as if absent and they light up when he pushes.

- **`evidence_summary`** — needed only for `feasibility.legal.assessment_missing`,
  which identifies *flagged* actions (kept in the ranking but with no legal
  assessment). Without it the Regulations "Flagged — evidence missing" card stays
  at zero, which is honest.
- **Resolved weights** — `readRankingWeights()` in
  `results/components/rankingFacts.ts` already falls back to `PILLAR_WEIGHTS`.
  Until they arrive, the score-breakdown formula prints defaults.

## Work, in order

### 1. Exclusion writer — do this first, it is independent of everything

`setMeedConfirmedExclusions` (`MEED/meedLocalState.ts`) **is never called**.
Pre-flight renders a count from it, so the branch is currently unreachable, and
`excludedActionIds` would always be `[]` however good the rest is.

Build the preview → confirm flow on the pre-flight screen: a "Preview what this
excludes" button (enabled when `hasExclusionCriteria`), a checkbox list of
proposals, confirm → `setMeedConfirmedExclusions`. Compute proposals locally
against the action catalog (sector tag, negative co-benefit, free-text match) —
the prototype did exactly this as its offline fallback, see
`meed-prototype/app/artifacts/hiap/src/pages/PreflightCheck.tsx:57`.

The i18n keys already exist (`confirmed-exclusions-count_one`/`_other`).

### 2. Response adapter

New `MEED/meedRankingAdapter.ts`: `toMeedPrioritizeCityResult(data)` mapping
camelCase → our `MeedPrioritizeCityResult`, sorting by `rank`, and deriving
`metadata.counts.discarded_legal` from `removedActions` where
`removalSource === "legal_hard_filter"`.

Unit-test against the example JSON. This is the piece most worth a test.

### 3. RTK endpoints

In `app/src/services/api.ts`, beside the existing MEED block (~line 209):
a `getMeedRanking` **query** (GET) and a `runMeedRanking` **mutation** (POST).
Type them properly — do not repeat the `unknown` + cast pattern the five
existing MEED endpoints use.

### 4. Processing screen

`MEED/[inventory]/processing/page.tsx` currently runs an 8-second animation and
navigates regardless of outcome. Fire the mutation on mount behind a `useRef`
one-shot guard; let the eased curve asymptote at ~90 and only the resolved
response set 100 and `done`; add the error state the screen cannot currently
show; never navigate to results on failure.

Keep `MEED_MOCK_RANKING` taking precedence — that is the offline story and the
no-regression guarantee.

### 5. `useMeedRanking`

Currently reads localStorage. Point it at the GET query. Keep the signature and
return shape (`{ ranking, isStale, isReady }`) — every consumer already agrees to
read through this one hook, so nothing downstream should change.

## Do not

- **Do not build a client to hiap-meed.** Milan's route owns that boundary.
- **Do not restore the prototype's auto-run of the ranking on the Regulations
  screen.** It fired a full ranking at anyone who clicked through step 3 and
  pre-empted the generate gate. Regulations renders from the stored ranking; a
  user-triggered "Run legal screening" button is the agreed shape if wanted.
- **Do not send city data in the request.**

## Verification

```bash
cd ~/meed-local/app && npx tsc --noEmit && npm run build
```

Then `~/meed-local/meed-env.sh rebuild` and walk São Paulo:
pre-flight → generate → processing → results.

- With `MEED_MOCK_RANKING` set, behaviour must be **identical to today**.
- Without it, and with Milan's branch merged, the ranking must come from the API,
  results must show real action names, and re-opening results must **not** re-run
  the ranking (that is what the GET is for).
- Regulations should show blocked actions with real names and sector chips.
