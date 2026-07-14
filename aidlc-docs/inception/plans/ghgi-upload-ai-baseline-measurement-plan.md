# GHGI Upload AI — Baseline Measurement Plan

**Project**: CityCatalyst (Brownfield)
**Created**: 2026-07-14T01:10:00Z
**Status**: Approved 2026-07-14T01:15:00Z — fill tables during runs
**Document Language**: English
**Requirements**: `aidlc-docs/inception/requirements/ghgi-upload-ai-baseline-requirements.md`
**Hypotheses**: `aidlc-docs/inception/plans/ghgi-upload-ai-bottlenecks-hypotheses.md`

---

## 1. Purpose

Record a **before** baseline for GHGI import Path B (tabular AI) and Path C (PDF AI), with non-AI controls, so later optimizations can show a measurable before/after **gains** table.

**Do not** implement optimizations while filling this plan.

---

## 2. Environment Assumptions (fill at run time)

| Field | Value (fill) |
|-------|----------------|
| Date (UTC) | **2026-07-14T02:00:27Z** (authoritative OpenRouter session) |
| Host OS | Linux |
| App | Next.js `app/` local (`npm run dev`) |
| Database | Postgres Docker via `app/scripts/start-db.sh` |
| Auth / city / inventory year | Admin session; city `1bf329ec-…`; year **2022** |
| `LLM_PROVIDER` | openai adapter + **OpenRouter** |
| `LLM_BASE_URL` | `https://openrouter.ai/api/v1` |
| `LLM_MODEL` | `openai/gpt-4o-mini` |
| `LLM_TIMEOUT_MS` | **120000** |
| `LLM_MAX_RETRIES` | **2** |
| `OPENAI_API_KEY` present | yes (OpenRouter key) |
| Notes | curl `-L` harness; poll 2s. Raw: `ghgi-upload-ai-baseline-results-raw.json`. Prior failed OpenAI-direct session kept as historical note only. **Gate PASSED** (N=1). |

Code defaults: `app/src/backend/llm/config.ts` (`DEFAULT_TIMEOUT_MS = 90_000`, `DEFAULT_MAX_RETRIES = 3`, `DEFAULT_MODEL = "gpt-4o-mini"`).

---

## 3. Precondition: Empty Inventory

Approve blocks non-empty inventories:

```text
HTTP 409 Conflict
"This inventory already contains data. Clear existing data before importing again."
```

Source: `app/src/app/api/v1/city/[city]/inventory/[inventory]/import/approve/route.ts`.

**Before each full run that will approve** (or when comparing approve wall-clock): ensure inventory has no `InventoryValue` rows / progress data. For latency of upload→`waiting_for_approval` only, empty inventory is still recommended for consistency with prior F0 exploration.

---

## 4. Fixture Matrix

| ID | Relative path under `app/tmp-import-fixtures/` | Expected path | LLM |
|----|-----------------------------------------------|---------------|-----|
| F0 | `01-near-ecrf-BR-RIO-2022.csv` | D near-eCRF (control) | No |
| F1 | `02-ecrf-template.xlsx` | A eCRF (control) | No |
| F2 | `06-ecrf-minimal-filled.xlsx` | A eCRF (control) | No |
| F3 | `03-path-b-long-tidy-2022.csv` | B interpret | Yes |
| F4 | `04-path-b-wide-year.csv` | B interpret | Yes |
| F5 | `05-path-c-sample-inventory.pdf` | C extract | Yes |
| F6 | `07-path-b-stress-multi-chunk-2022.csv` | B interpret (stress; ≥3 shape chunks) | Yes |

Prior exploration: F0 → `waiting_for_approval`, ~74 rows, no AI.

---

## 5. Metrics

| Metric ID | Definition | How to capture |
|-----------|------------|----------------|
| M1 | `T_upload_terminal` — wall-clock from upload submit until terminal status after upload poll | Stopwatch; optional DB `created` → `lastUpdated` |
| M2 | `T_ai` — wall-clock from Extract/Interpret click until `waiting_for_approval` or `failed` | Stopwatch; DB timestamps; poll UI |
| M3 | `T_approve` — wall-clock from Import Inventory until `completed` or `failed` (optional for baseline v1) | Stopwatch |
| M4 | `N_chunks` — number of LLM chunks (Path B shape chunks; Path C extract chunks) | Logs (`chunkCount`); Path C UI `extractionProgress.total`; code caps |
| M5 | `T_per_chunk` — per-chunk latency if observable | Debug logs; else `N/A` → instrumentation candidate |
| M6 | Tokens in/out or estimated cost | Provider dashboard / app logs; else `N/A` |
| M7 | Outcome | `importStatus`, `rowCount`, `errorLog` |
| M8 | Progress UX observed | Path C: determinate bar if `total > 1`; Path B: none today |

Polling interval: **3s** (`usePollUntil`) — wall-clock includes up to ~1 poll interval of jitter.

---

## 6. Run Protocol

### 6.1 Recommended order

1. Record environment table (§2).
2. **Controls** (no LLM cost): F0, then F1 or F2 (at least one eCRF).
3. **Path B**: F3, then F4 (if time/budget).
4. **Path C**: F5.
5. For each AI fixture, repeat up to **N=3** (Q2 default); if budget forces N=1, note it.

### 6.2 Steps per fixture

1. Ensure empty inventory (or fresh inventory year) as required.
2. Open onboarding import wizard for the inventory (`?inventory=<id>`).
3. Start stopwatch; upload fixture file.
4. Record post-upload terminal `importStatus` and M1.
5. If `pending_ai_interpretation` (B) or `pending_ai_extraction` (C): start stopwatch; click **Extract with AI**; record M2, M4, M7, M8.
6. Optionally proceed mapping → approve; record M3 (optional for v1).
7. Copy values into §7 Baseline Results Table.
8. Reset inventory / use new empty inventory before next approve-capable run.

### 6.3 What to log from the server (manual)

Prefer existing logs over new code:

- Interpret: `"Table shape chunks merged"` with `chunkCount`, `totalShapedRows`
- Extract: chunk progress updates / `"Background PDF extraction completed"`
- LLM client retry / timeout messages

---

## 7. Baseline Results Table (EMPTY — fill during runs)

Copy a new block per session if needed. One row per fixture × run index.

| Run | Fixture | Path | N (repeat #) | M1 upload→terminal (s) | Post-upload status | M2 AI→waiting/fail (s) | M4 N_chunks | M5 T_per_chunk | M6 tokens/cost | M7 status | M7 rowCount | M8 progress UX | Notes |
|-----|---------|------|--------------|------------------------|--------------------|------------------------|-------------|----------------|----------------|-----------|-------------|----------------|-------|
| 1 | F0 | D | 1 | **4.06** | waiting_for_approval | n/a | n/a | n/a | n/a | waiting_for_approval | **74** | none | Control OK (OpenRouter session) |
| 2 | F2 | A | 1 | **0.48** | waiting_for_approval | n/a | n/a | n/a | n/a | waiting_for_approval | **3** | none | Control from prior session (still valid) |
| 3 | F3 | B | 1 | **0.37** | pending_ai_interpretation | **12.2** | **1** shape (+1 interpret) | N/A (single shape) | **5937** tot (5487+450) | waiting_for_approval | **4** | none | OpenRouter; long-tidy; 2 LLM calls |
| 4 | F4 | B | 1 | **0.31** | pending_ai_interpretation | **12.3** | **1** shape (+1 interpret) | N/A | **5810** tot (5414+396) | waiting_for_approval | **4** | none | OpenRouter; wide-year; 2 LLM calls |
| 5 | F5 | C | 1 | **0.30** | pending_ai_extraction | **7.5** | **1** (no multi-chunk) | N/A | **3966** tot (3581+385) | waiting_for_approval | **4** | none observed | New PDF 1.7; single extract call |
| hist | F3/F4 | B | 1 | — | — | ~19.8 / ~10.0 to fail | — | — | — | failed | — | — | Superseded: OpenAI direct **429** |
| hist | F5 | C | 1 | — | — | — | — | — | — | extract 400 | — | — | Superseded: old PDF **bad XRef** |

### Session verdict (2026-07-14 OpenRouter)

| Gate item | Status |
|-----------|--------|
| Environment filled | Yes (OpenRouter) |
| ≥1 non-AI control | Yes (F0; F2 from prior) |
| Path B success → `waiting_for_approval` | **Yes** (F3, F4) |
| Path C success → `waiting_for_approval` | **Yes** (F5) |
| M4/M5/M6 | Partial — M4=1 on these fixtures; M6 from logs; M5 N/A |
| **Baseline gate** | **PASSED** (caveat: N=1; small fixtures do not stress multi-chunk H1) |

**Unblock checklist before re-run** — cleared for OpenRouter + new PDF.

Optional follow-ups (not blocking gate): N=3 repeats; larger fixture to exercise multi-chunk Path B/C.

---

## 7b. Extended baseline — F6 multi-chunk stress (U3)

**When**: 2026-07-14T02:43Z (after U1+U2; Path C fail-closed also shipped in U3)  
**Fixture**: `07-path-b-stress-multi-chunk-2022.csv` (250 data rows; expected **3** shape chunks @ chunkSize 100)  
**Raw**: `ghgi-upload-ai-u3-f6-stress-raw.json`  
**Env**: same OpenRouter class as §2

| Run | Fixture | Path | N | M1 (s) | Post-upload | M2 AI (s) | M4 N_chunks | M7 status | M7 rowCount | M8 progress | Notes |
|-----|---------|------|---|--------|-------------|-----------|-------------|-----------|-------------|-------------|-------|
| 1 | F6 | B | 1 | **0.38** | pending_ai_interpretation | **504.4** | **3** | waiting_for_approval | **205** | poll saw `{current:3,total:3}` | U1 skip-interpret; U2 progress; sequential H1 stressed |

Use this row as the **before** for F6 in U5 gains (M2/M4/M7). rowCount 205/250 reflects LLM shape dropouts on a large tidy sheet — track unexplained drops in U5.

---

## 8. Gains Table (after U1 — 2026-07-14T02:24Z)

Same protocol/env class as OpenRouter baseline (§2 / §7). Change: **U1** skip `interpretTabular` for FormatAdapter tidy types (shape-only). Raw: `ghgi-upload-ai-u1-gains-f3-f4-raw.json`.

| Metric | Fixture / Path | Baseline (from §7) | After change (U1) | Δ absolute | Δ % | Change ID | Notes |
|--------|----------------|--------------------|-------------------|------------|-----|-----------|-------|
| M2 T_ai | F3 / B | **12.2 s** (12163 ms) | **7.5 s** (7530 ms) | −4.6 s | **−38%** | U1 | Skip confirmed in logs |
| M2 T_ai | F4 / B | **12.3 s** (12270 ms) | **5.1 s** (5056 ms) | −7.2 s | **−59%** | U1 | Skip confirmed in logs |
| M2 T_ai | F5 / C | 7.5 s | — | — | — | — | Not re-run this session |
| M4 N_chunks | F3 / B | 1 shape (+1 interpret) | **1** shape only | −1 LLM call | — | U1 | |
| M4 N_chunks | F5 / C | 1 | — | — | — | — | |
| M6 tokens (sum) | F3 / B | **5937** | **3280** (2883+397) | −2657 | **−45%** | U1 | 1 LLM call |
| M6 tokens (sum) | F4 / B | **5810** | **3216** (2846+370) | −2594 | **−45%** | U1 | 1 LLM call |
| M6 tokens (sum) | F5 / C | 3966 | — | — | — | — | |
| M1 control | F0 / D | 4.06 s | — | — | — | — | Not re-run (Path B-only session) |
| M7 rowCount | F3 / B | 4 | **4** | 0 | 0% | U1 | No regression |
| M7 rowCount | F4 / B | 4 | **4** | 0 | 0% | U1 | No regression |
| M7 status | F3 / B | waiting_for_approval | waiting_for_approval | — | — | U1 | OK |
| M7 status | F4 / B | waiting_for_approval | waiting_for_approval | — | — | U1 | OK |
| M8 progress | F3 / B | none | backend `extractionProgress` (U2) | — | — | — | UI optional (U4); pollable on Path B shape |

### NFR-O1 evaluation (U1 / F3+F4)

| Criterion | Result |
|-----------|--------|
| Clear improvement on M2 **or** M6 for F3 and/or F4 | **PASS** — both M2 and M6 improved on F3 **and** F4 |
| F5 hold/improve | **N/A** this session (not re-run) |
| No terminal success regression | **PASS** — both `waiting_for_approval` |
| No unexplained rowCount drop | **PASS** — 4 → 4 |

**Verdict: NFR-O1 PASSES for Path B (F3/F4) under U1.** Full MVP NFR-O1 (incl. F5) remains pending U5 / Path C re-measure.

---

## 8b. Gains Table (U5 full re-measure — 2026-07-14T12:38Z)

Same OpenRouter env class. Changes in tree: **U1+U2+U3** (U4 skipped at the time). Historical sequential F6 success. Superseded for acceptance by §8c (post-U4/U6 refresh). Raw snapshot from that session was overwritten; sequential F6 row retained below for Δ reference.

| Metric | Fixture / Path | Baseline | After U1–U3 (U5 seq.) | Δ absolute | Δ % | Notes |
|--------|----------------|----------|----------------------|------------|-----|-------|
| M2 T_ai | F6 / B | **504.4 s** (U3) | **376.7 s** | −127.7 s | **−25%** | Sequential shape; `waiting_for_approval`; rowCount **239** |
| M6 tokens | F6 / B | n/a | **38075** (3 calls) | — | — | Sequential stress token capture |

---

## 8c. Gains Table (U5 refresh — U4 UI + U6 parallel — 2026-07-14T13:49Z)

OpenRouter env class (§2). Tree: **U1+U2+U3+U4+U6** (`LLM_CHUNK_CONCURRENCY` default **3**). Raw: `ghgi-upload-ai-u5-gains-raw.json`.

| Metric | Fixture / Path | Baseline (§7 / §7b) | After U1–U6 (this run) | Δ absolute | Δ % | Notes |
|--------|----------------|---------------------|------------------------|------------|-----|-------|
| M1 | F0 / D | **4.06 s** | **0.45 s** | −3.61 s | — | NFR-O2 OK (same order; 74 rows) |
| M2 T_ai | F3 / B | **12.2 s** | **7.6 s** (7585 ms) | −4.6 s | **−38%** | 1 LLM call (U1); concurrency=3 N/A (1 chunk) |
| M2 T_ai | F4 / B | **12.3 s** | **7.6 s** (7567 ms) | −4.7 s | **−38%** | 1 LLM call (U1) |
| M2 T_ai | F5 / C | **7.5 s** | **7.8 s** (7799 ms) | +0.3 s | ~0% | **Hold**; `waiting_for_approval`; unpdf Path C |
| M2 T_ai | F6 / B | **376.7 s** (U5 seq. success) | **364.4 s** → **`failed`** | — | — | **U6 parallel (concurrency=3)**; provider `Request timed out`. Logs: 3 concurrent LLM requests; 1 completed (~60s); **2× LLM_TIMEOUT** at same timestamps (attempts 1+2). Progress polled `{current:1,total:3}`. Same failure class as U6 spot-check (~368s). |
| M6 tokens | F3 / B | **5937** | **3280** | −2657 | **−45%** | |
| M6 tokens | F4 / B | **5810** | **3218** | −2592 | **−45%** | |
| M6 tokens | F5 / C | **3966** | **3977** | +11 | ~0% | Hold |
| M6 tokens | F6 / B | **38075** (seq. success) | **8009** (1 completed call) | — | — | Incomplete — 2 chunks timed out before token logs |
| M7 rowCount | F3 / B | 4 | **4** | 0 | 0% | |
| M7 rowCount | F4 / B | 4 | **4** | 0 | 0% | |
| M7 rowCount | F5 / C | 4 | **4** | 0 | 0% | |
| M7 rowCount | F6 / B | 239 (seq.) | **null** (failed) | — | — | Provider timeout; not a silent truncation |
| M7 status | F3/F4/F5 | waiting_for_approval | waiting_for_approval | — | — | OK |
| M7 status | F6 / B | waiting_for_approval (seq.) | **failed** (`Request timed out`) | — | — | Fail-closed OK (NFR-O3); wall-clock gain from parallel **not demonstrated** under current OpenRouter latency/timeouts |
| M8 progress | F3/F4/F6 | none / U2 pollable | **U4 UI** + pollable `extractionProgress` | — | — | ImportPage determinate bar when `total > 1` (Path B mirrors Path C) |

### NFR evaluation (U5 refresh / §8c)

| Criterion | Result |
|-----------|--------|
| NFR-O1 clear M2 **or** M6 improvement on F3 and/or F4 | **PASS** (−38% M2; −45% M6 both) |
| NFR-O1 F5 hold/improve | **PASS** — M2 ≈ baseline (7.8 vs 7.5 s); M6 hold (3977 vs 3966); status + rowCount OK |
| NFR-O1 no status / rowCount regression on F3/F4 | **PASS** |
| NFR-O1 F6 | **INCONCLUSIVE for parallel latency** — sequential U5 success remains evidence Path B stress works; parallel run fails on **provider timeouts** (documented), not silent data loss |
| NFR-O2 F0 control | **PASS** (0.45 s; 74 rows) |
| NFR-O3 fail-closed | **PASS** (F6 → `failed` + `Request timed out`) |
| FR-O6 Path B progress UI | **DONE** (U4) |

**MVP construction verdict:** Path B call-reduction goals met (F3/F4). Path C holds vs baseline. U4 Path B progress UI shipped. U6 parallel code is live; **F6 wall-clock gain under concurrency=3 is blocked by OpenRouter timeouts** (reproducible). Prefer `LLM_CHUNK_CONCURRENCY=1` or higher `LLM_TIMEOUT_MS` when measuring multi-chunk latency until the provider can finish 3 overlapping large shape calls.

---

## 9. Instrumentation Gap Checklist

After first AI runs, mark each:

| Gap | Observed? (Y/N/Partial) | Action |
|-----|-------------------------|--------|
| Per-chunk timestamps (Path B) | N (only 1 shape chunk) | Need larger fixture to stress; instrumentation optional |
| Per-chunk timestamps (Path C) | N (single extract call) | Same |
| Token usage per call | **Y** (debug logs) | Sufficient for this baseline |
| Exact chunk count without digging logs | Partial (debug `chunkCount`) | OK for now |
| Correlation ID per import job | Y (`fileId`) | OK |
| Valid Path C fixture | **Y** (new PDF 1.7) | Cleared |
| OpenAI/OpenRouter quota for baseline | **Y** (OpenRouter) | Cleared |

If critical gaps block a useful baseline: draft **measurement-only instrumentation Requirements** (separate slice), approve, ship, **re-run** §7 — still **no** optimization.

---

## 10. Approval

> Review this measurement plan together with baseline requirements and hypotheses.  
> Approve to allow fixture baseline runs (still no optimization code).
