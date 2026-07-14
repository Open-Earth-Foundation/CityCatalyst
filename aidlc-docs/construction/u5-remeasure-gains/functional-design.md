# U5 — Re-measure + Gains (post-U4/U6 refresh)

**Status**: Complete  
**Requirements**: FR-O7, NFR-O1, NFR-O2  
**Depends on**: U1–U3, U4 (shipped), U6 parallel chunks

## What was measured

OpenRouter env; fixtures **F0, F3, F4, F5, F6**. Session `u5-remeasure-u4-u6` at **2026-07-14T13:49Z**.  
Raw: `aidlc-docs/inception/plans/ghgi-upload-ai-u5-gains-raw.json`.  
Gains table: measurement plan **§8c**.

| Fixture | M1/M2 | Status | Notes |
|---------|-------|--------|-------|
| F0 | M1 **0.45 s** | waiting_for_approval | 74 rows — NFR-O2 PASS |
| F3 | M2 **7.6 s** | waiting_for_approval | −38% vs 12.2 s; M6 3280 (−45%) |
| F4 | M2 **7.6 s** | waiting_for_approval | −38% vs 12.3 s; M6 3218 (−45%) |
| F5 | M2 **7.8 s** | waiting_for_approval | Hold vs 7.5 s; M6 3977 |
| F6 | M2 **364.4 s** | **failed** | U6 concurrency=3; `Request timed out`; progress `{1/3}` |

## F6 provider timeouts (parallel)

Logs show **3 concurrent** `LLM complete request` at start; **1** response (~60s); **2× `LLM_TIMEOUT`** at matching timestamps on attempts 1 and 2. Same failure class as U6 spot-check (~368s). Sequential U5 F6 previously succeeded at ~377s — parallel wall-clock gain **not demonstrated** under current provider + `LLM_TIMEOUT_MS=120000`.

## Verdict

- **NFR-O1 Path B F3/F4**: PASS  
- **NFR-O1 F5**: PASS (hold)  
- **NFR-O2 F0**: PASS  
- **F6 parallel**: documented provider timeout; fail-closed OK  
- **U4**: Path B progress UI done (FR-O6)
