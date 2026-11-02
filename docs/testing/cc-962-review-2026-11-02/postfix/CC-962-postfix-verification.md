# CC-962 — SEEG provenance post-fix verification

Verified on 2 November 2026. The catalogue-derived **2015 / national** attribution did not recur in **6/6** complete recorded conversations on the patched code. All six completed their requested discovery/provenance goal, and no inventory emissions were written. This is a narrow regression result, not an overall CA accuracy score.

## What changed

The backend previously described a fetched SEEG record using the catalogue range start (2015) and catalogue country coverage (BR). The actual retrieval requested **São Paulo / 2022**. The patch derives record metadata from the retrieval parameters, including separate country/region treatment for population-downscaled sources. The exact residential Scope 1 value remains **1,117,504,701 kgCO₂e**. The provider body supplies no independent year or geography, so the request remains the provenance contract. A provider silently returning another year under the same URL is outside this verification.

- Local commit: `5c04cc616466cdc1b0f550588cd00f4f252b5106`, based on `9a74627ee590a137febe38ab3b7e15a04d2e8f11`.
- Branch: `t3/fix-seeg-source-provenance`.
- Changed production file: `app/src/backend/agentic/ghgi/stationary-energy/context.ts`; one added provenance test file.
- [Implementation report](implementation-report.md).
- No push, PR or shared deployment. Old persisted drafts retain their earlier metadata; a new/regenerated draft is necessary.

## Environment and method

Patched Next.js ran locally on port 3407 with an isolated CA on port 8088 and its own disposable PostgreSQL. CC used development database taxonomy/catalogue and clearly disposable private copies of São Paulo 2022. The city population was 11,451,245; AR5/GPC Basic+ inventory inputs were preserved. All proposals came through the real UI, real credentials authentication, real Global API and real model calls; no mocked provider or LLM responses. The application model was `openai/gpt-5.6-terra` from unchanged CA configuration. The independent judge was **GPT-6.1 Terra**, as requested.

Two scenarios were repeated three times:

1. **UC01 — Find stationary energy data sources.** Ask where to obtain data; give the requested consent to prepare a review draft; ask which sources/categories are covered and how to assess year, geography and suitability. Consent is successful designed behavior. No save is requested.
2. **UC02 — Explain a proposed value.** Prepare a review draft; ask the origin, year and value for SEEG residential Scope 1 I.1.1; ask whether it fits the city/category and what limitations to explain.

The denominator is **six complete conversations  / 21 scripted user messages**, with separate judgments for provenance, complete-answer quality and goal completion. UI-generated summary turns are preserved in raw evidence but are not additional independent scenarios. API/DB reads check state; they do not substitute for the recorded conversations.

## Results and recordings

| Run | Year/geography regression | Answer quality | Requested goal | Flow quality | Evidence |
|---|---|---|---|---|---|
| UC01-r2 | Pass | Pass | Pass | Pass | [Video](MEDIA_PENDING) (92.4s) · [Full answers](UC01-r2/transcript.md) |
| UC01-r3 | Pass | Pass | Pass | Pass | [Video](MEDIA_PENDING) (82.8s) · [Full answers](UC01-r3/transcript.md) |
| UC01-r4 | Pass | Pass | Pass | Partial: duplicate draft | [Video](MEDIA_PENDING) (91.0s) · [Full answers](UC01-r4/transcript.md) |
| UC02-r1 | Pass | Pass | Pass | Pass | [Video](MEDIA_PENDING) (69.9s) · [Full answers](UC02-r1/transcript.md) |
| UC02-r2 | Pass | Partial: short Mt display | Pass | Pass | [Video](MEDIA_PENDING) (70.2s) · [Full answers](UC02-r2/transcript.md) |
| UC02-r3 | Pass | Partial: short Mt display | Pass | Pass | [Video](MEDIA_PENDING) (77.7s) · [Full answers](UC02-r3/transcript.md) |

- **Provenance:**6 pass / 6. UC01: 3/3; UC02: 3/3. The successful SEEG residential candidate and the spoken explanation identify2022/city.
- **Complete-answer quality:**4 pass, 2 partial / 6. The partials are UC02-r2/r3, which repeat the existing truncated1.11Mt display.
- **Goal completion:**6 pass / 6. Source discovery and provenance explanations were delivered. No inventory save was requested, and all six inventory-value counts remained zero.
- **Exact residential kilograms:**correct 3/3 UC02 answers. Correct two-decimal megatonne rounding: 1/3.
- **Flow quality:**UC01-r4 has a duplicate draft artifact; this is tracked separately from answer factuality.

Example from UC02-r1, verbatim:

> For **Residential Buildings, Scope 1 — fuel combustion (I.1.1)**, the proposal uses **SEEG (Sistema de Estimativa de Emissão de Gases do Efeito Estufa)**, a city-level source for **2022**, matching the inventory year.
>
> **Proposed emissions:** **1,117,504,701 kgCO₂e** (about **1.12 MtCO₂e**, 100-year GWP).  
> It combines reported CO₂, CH₄, and N₂O emissions. The source does not provide a fuel-activity quantity or activity unit for this proposal.

[Independent Terra judgment](postfix-judgment.md) · [Structured judgment](postfix-judgment.json) · [Frozen evidence packet](judge-packet.json). Historical 1 November runs and metrics have not been rewritten as post-fix passes.

## Verification

- Parent independently ran three targeted Jest suites: **16/16 tests passed**, exit 0, with provider/database dependencies mocked. These are separate from the real browser evidence. Unit test log (local execution artifact; not distributed).
- The implementer additionally reported 54 Stationary Energy tests passing. An unrelated top-level-await parser failure in the existing chat-resume test prevents claiming that the entire broad command passed.
- All six primary recorder metadata files report `ok:true`. FFprobe confirmed nonzero duration, video dimensions and sizes; a representative frame of every primary video was inspected. All original and recovery recordings remain available. [Video verification and hashes](artifact-verification.json).
- MLflow was verified by actual readback: **43 runs, 43 FINISHED** in the task-specific [experiment](https://mlflow-dev.openearth.dev/#/experiments/10). Two request/conversation artifacts were downloaded and read successfully. This includes auxiliary runs and setup/recovery, so 43 is not the number of evaluated conversations. [MLflow evidence](mlflow-final-readback.json).
- Persisted draft rows, request events, exact quotes and the duplicate observation are in [Runtime observations](runtime-observations.json).

## Recorder interruption and recovery

The first UC01 recording pressed Enter during the automatic draft-ready summary. Its next question was filled but not sent, and the recorder timed out. The corrected recorder waits for the actual submit button. The original incomplete recording is retained: [Initial video](MEDIA_PENDING) (recorder `ok:false`).

A separately recorded reload/recovery submitted a coverage question before the draft context finished loading: the request used a new thread with no draft-run ID. CA asked to start a draft. The next question carried the original thread and correct run ID and obtained correct guidance. The exact timing/context sequence is retained in [Recovery video](MEDIA_PENDING) and [Execution evidence](UC01-r1/execution.json). This mixed recovery is **excluded from the six complete-run counts**, not silently promoted to a pass. UC01-r4 is the independent full replacement. The recovery alone does not establish a reproducible product fault; it also does not rule one out. No videos were spliced to imply an uninterrupted success.

## Cleanup

Removed the task-owned user, organization, project and seven empty inventory copies after verifying zero inventory emissions in each. Stopped only the task-owned Next.js, CA and port-forward processes; removed the labelled disposable PostgreSQL container and tunnel pod. Shared services were left running. Evidence remains available after cleanup. See [data cleanup](cleanup-data.json), [persisted-state verification](persisted-state-final.json) and [process cleanup](cleanup-processes.json).

## Not tested

This verifies one city/year/source configuration on patched local CC with dev data. It does not establish shared-dev or production deployment behavior, every provider endpoint, every geography/year, save/idempotency, model-wide accuracy, or migration of old drafts. No shared CA process was restarted. Local mocked tests cover some additional provenance branches; live country/region downscaling and actor-ID providers remain outside these recordings.

## Remaining issues

1. **Truncated short value still propagates to answers — UC02-r2/r3.** At the source-value question (see the video step/`turns[1]`), CA gives the correct exact kg but says about 1.11 Mt. The correct two-decimal rounding is 1.12 Mt. The request’s enriched UI context already contains 1.11 Mt, and all six right-hand panels display it. This is a known formatting/context issue; independent LLM arithmetic causality is not established. It was not part of the provenance patch.
2. **One consent produced two working drafts — UC01-r4.** T2 emitted one successful `stationary_energy_start_draft` result for `e4a26780…` with `continue_request:true`. A later browser start request created `d76aa2ca…`. The local CA database contains both ready runs on the same inventory/thread, 17 seconds apart, and the final UI shows two Working drafts. No extra new-draft action was scripted. The cause and whether this was introduced by any particular change are not established. Both drafts have correct SEEG 2022/city metadata, and no inventory emissions were saved.
3. **Reload context anomaly remains unclassified.** The supplemental recovery reached a new thread before its existing draft context loaded. It needs a controlled manual reload check before being labelled as a separate product defect.
